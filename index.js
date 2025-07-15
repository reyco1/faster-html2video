/**
 * fast-html2video - High-performance HTML animation to video converter
 * Based on timecut's architecture with performance optimizations
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { overwriteTime, goToTimeAndAnimateForCapture } = require('./lib/virtual-time');

const defaultFPS = 60;
const defaultDuration = 5;

module.exports = async function(config) {
  let browser = null;
  let ffmpeg = null;
  
  try {
  config = Object.assign({
    fps: defaultFPS,
    duration: defaultDuration,
    width: 1920,
    height: 1080,
    pixFmt: 'yuva420p', // For transparency
    codec: 'vp9',
    quality: 23,
    quiet: false,
    pipeMode: true, // Always use pipe mode for performance
    output: 'output.webm'
  }, config || {});

  const fps = config.fps || defaultFPS;
  const duration = config.duration || defaultDuration;
  const totalFrames = Math.floor(duration * fps);
  const frameDuration = 1000 / fps;
  
  const url = config.url.includes('://') ? config.url : 'file://' + path.resolve(process.cwd(), config.url);
  const output = path.resolve(process.cwd(), config.output);

  const log = (...args) => {
    if (!config.quiet) {
      console.log(...args);
    }
  };
  

  // Ensure output directory exists
  const outputDir = path.dirname(output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Launch browser with optimizations
  const launchOptions = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--high-dpi-support=1',
      '--force-device-scale-factor=1'
    ]
  };
  
  // Use Chrome if available on macOS
  if (process.platform === 'darwin' && fs.existsSync('/Applications/Google Chrome.app')) {
    launchOptions.executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  
  browser = await puppeteer.launch(launchOptions);

  const page = await browser.newPage();
  
  // Set viewport
  await page.setViewport({
    width: config.width,
    height: config.height,
    deviceScaleFactor: 1
  });

  // Inject virtual time control before navigation
  await overwriteTime(page);

  // Navigate to page
  log(`Loading ${url}...`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  log('Page loaded');

  // Prepare page
  await page.evaluate((selector) => {
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    
    const stage = document.querySelector(selector);
    if (stage) {
      stage.style.background = 'transparent';
    }
  }, config.selector || 'body');

  // Start FFmpeg process
  const ffmpegArgs = [
    '-y',
    '-f', 'image2pipe',
    '-framerate', fps,
    '-i', '-',
    '-c:v', 'libvpx-vp9',
    '-pix_fmt', config.pixFmt,
    '-crf', config.quality,
    '-b:v', '0',
    '-threads', '4',
    output
  ];

  ffmpeg = spawn('ffmpeg', ffmpegArgs);
  let ffmpegError = null;

  ffmpeg.stderr.on('data', (data) => {
    const output = data.toString();
    if (config.verbose) {
      process.stderr.write(output);
    }
  });

  ffmpeg.on('error', (err) => {
    ffmpegError = err;
  });

  const ffmpegPromise = new Promise((resolve, reject) => {
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });

  // Capture frames
  log(`Capturing ${totalFrames} frames at ${fps}fps...`);
  const startTime = Date.now();

  for (let frameNum = 0; frameNum < totalFrames; frameNum++) {
    const timestamp = frameNum * frameDuration;
    
    // Go to specific time
    await goToTimeAndAnimateForCapture(page, timestamp);
    
    // Minimal delay for render
    await new Promise(resolve => setTimeout(resolve, 5));
    
    // Get capture area
    const captureArea = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      };
    }, config.selector || 'body');
    
    // Capture screenshot
    const screenshot = await page.screenshot({
      type: 'png',
      omitBackground: true,
      clip: captureArea
    });
    
    // Write to FFmpeg
    if (ffmpegError) {
      throw ffmpegError;
    }
    
    if (!ffmpeg.stdin.write(screenshot)) {
      // Handle backpressure
      await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
    }
    
    // Progress
    if ((frameNum + 1) % Math.floor(fps / 2) === 0) { // Update twice per second
      const elapsed = (Date.now() - startTime) / 1000;
      const captureRate = (frameNum + 1) / elapsed;
      const percent = Math.round(((frameNum + 1) / totalFrames) * 100);
      log(`Progress: ${percent}% (${frameNum + 1}/${totalFrames}) - ${captureRate.toFixed(1)} fps`);
    }
  }

  // Finalize
  ffmpeg.stdin.end();
  await ffmpegPromise;
  
  await browser.close();

  const elapsed = (Date.now() - startTime) / 1000;
  const captureRate = totalFrames / elapsed;
  
  log(`\nCompleted!`);
  log(`Total time: ${elapsed.toFixed(1)}s`);
  log(`Capture rate: ${captureRate.toFixed(1)} fps`);
  log(`Output: ${output}`);
  
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    throw error;
  }
};