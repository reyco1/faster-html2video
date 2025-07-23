/**
 * fast-html2video - High-performance HTML animation to video converter
 * Based on timecut's architecture with performance optimizations
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cliProgress = require('cli-progress');
const { overwriteTime, goToTimeAndAnimateForCapture } = require('./lib/virtual-time');
const { sendWebhook, createWebhookPayload, WEBHOOK_EVENTS } = require('./lib/webhook');

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
  
  // Generate unique job ID for webhook tracking
  const jobId = config.jobId || `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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

  // Set up recording control if enabled
  let recordingStarted = false;
  let recordingStopped = false;
  
  if (config.enableRecordingControl) {
    await page.exposeFunction('__recordingControl', async (action) => {
      log(`Recording control: ${action}`);
      if (action === 'start') {
        recordingStarted = true;
        return { status: 'started' };
      } else if (action === 'stop') {
        recordingStopped = true;
        return { status: 'stopped' };
      }
      return { status: 'unknown' };
    });
    
    log('Recording control enabled');
  }

  // Navigate to page
  log(`Loading ${url}...`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  log('Page loaded');
  
  // Wait for start signal if configured
  if (config.enableRecordingControl && config.waitForStartSignal) {
    log('Waiting for start signal from page...');
    while (!recordingStarted && !recordingStopped) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (recordingStopped) {
      log('Recording stopped before starting');
      return;
    }
    
    log('Start signal received, beginning capture...');
  }
  
  // Send job started webhook
  if (config.webhookUrl) {
    await sendWebhook(config.webhookUrl, createWebhookPayload(WEBHOOK_EVENTS.JOB_STARTED, jobId, {
      inputFile: url,
      outputFile: output,
      settings: {
        fps,
        duration,
        width: config.width,
        height: config.height,
        quality: config.quality
      }
    }));
  }

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

  // Create appropriate progress indicator based on recording control
  let progressBar;
  
  if (config.enableRecordingControl) {
    // For recording control, use a spinner with frame count
    progressBar = new cliProgress.SingleBar({
      format: '⏺ Recording │ {value} frames captured │ {duration}s │ {fps}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      linewrap: false,
      clearOnComplete: true
    });
  } else {
    // Standard progress bar for fixed duration
    progressBar = new cliProgress.SingleBar({
      format: '{bar} │ {percentage}% │ {value}/{total} frames │ ETA: {eta}s │ {duration}s │ {fps}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });
  }

  // Capture frames
  if (config.enableRecordingControl) {
    log(`Starting capture at ${fps}fps (recording control enabled)...`);
  } else {
    log(`Capturing ${totalFrames} frames at ${fps}fps...`);
  }
  
  const startTime = Date.now();
  
  if (config.enableRecordingControl) {
    // For recording control, start with indeterminate total
    progressBar.start(9999, 0, {
      fps: '0.0 fps'
    });
  } else {
    progressBar.start(totalFrames, 0, {
      fps: '0.0 fps'
    });
  }

  let actualFramesCaptured = 0;
  
  for (let frameNum = 0; frameNum < totalFrames; frameNum++) {
    // Check if recording was stopped
    if (config.enableRecordingControl && recordingStopped) {
      log('Recording stopped by page signal');
      break;
    }
    
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
    
    actualFramesCaptured = frameNum + 1;
    
    // Update progress
    const elapsed = (Date.now() - startTime) / 1000;
    const captureRate = frameNum > 0 ? actualFramesCaptured / elapsed : 0;
    
    if (config.enableRecordingControl) {
      // For recording control, just update the frame count
      progressBar.update(actualFramesCaptured, {
        fps: `${captureRate.toFixed(1)} fps`,
        duration: elapsed.toFixed(0)
      });
    } else {
      progressBar.update(actualFramesCaptured, {
        fps: `${captureRate.toFixed(1)} fps`
      });
    }
    
    // Send progress webhook (every 10% or 50 frames, whichever is less frequent)
    const progressInterval = Math.max(Math.floor(totalFrames * 0.1), 50);
    if (config.webhookUrl && actualFramesCaptured % progressInterval === 0) {
      const progress = config.enableRecordingControl ? 
        actualFramesCaptured : // For recording control, show frames captured
        (actualFramesCaptured / totalFrames) * 100; // For fixed duration, show percentage
        
      await sendWebhook(config.webhookUrl, createWebhookPayload(WEBHOOK_EVENTS.JOB_PROGRESS, jobId, {
        progress: config.enableRecordingControl ? undefined : Math.round(progress),
        framesCaptured: actualFramesCaptured,
        totalFrames: config.enableRecordingControl ? undefined : totalFrames,
        captureRate: parseFloat(captureRate.toFixed(1)),
        elapsed: parseFloat(elapsed.toFixed(1)),
        estimatedTimeRemaining: config.enableRecordingControl ? undefined : 
          (totalFrames - actualFramesCaptured) / captureRate
      }));
    }
  }

  // Finalize
  progressBar.stop();
  
  ffmpeg.stdin.end();
  await ffmpegPromise;
  
  await browser.close();

  const elapsed = (Date.now() - startTime) / 1000;
  const captureRate = actualFramesCaptured / elapsed;
  const actualDuration = actualFramesCaptured / fps;
  
  // Get file size
  const stats = fs.statSync(output);
  const fileSizeMB = stats.size / (1024 * 1024);
  
  // Generate metadata
  const metadata = {
    inputFile: url,
    generationTime: elapsed,
    processingSpeed: captureRate,
    generationTimeRatio: elapsed / actualDuration,
    totalFrames: totalFrames,
    capturedFrames: actualFramesCaptured,
    skippedFrames: totalFrames - actualFramesCaptured,
    duration: actualDuration,
    fps: fps,
    width: config.width || 1920,
    height: config.height || 1080,
    fileSize: fileSizeMB,
    fileSizeBytes: stats.size,
    codec: 'vp9',
    quality: config.quality || 23,
    outputFile: output,
    timestamp: new Date().toISOString()
  };
  
  // Write metadata file if enabled
  let metadataPath = null;
  if (config.generateMetadata !== false) {
    metadataPath = output.replace(/\.[^.]+$/, '.metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }
  
  log(`\nCompleted!`);
  log(`Total time: ${elapsed.toFixed(1)}s`);
  log(`Capture rate: ${captureRate.toFixed(1)} fps`);
  log(`Actual video duration: ${actualDuration.toFixed(1)}s (${actualFramesCaptured} frames)`);
  log(`Generation time ratio: ${(elapsed / actualDuration).toFixed(2)}x`);
  log(`Output: ${output} (${fileSizeMB.toFixed(1)}MB)`);
  if (metadataPath) {
    log(`Metadata: ${metadataPath}`);
  }
  
  // Send job completed webhook
  if (config.webhookUrl) {
    await sendWebhook(config.webhookUrl, createWebhookPayload(WEBHOOK_EVENTS.JOB_COMPLETED, jobId, {
      inputFile: url,
      outputFile: output,
      metadata: {
        generationTime: elapsed,
        captureRate: parseFloat(captureRate.toFixed(1)),
        actualDuration: parseFloat(actualDuration.toFixed(1)),
        capturedFrames: actualFramesCaptured,
        fileSize: parseFloat(fileSizeMB.toFixed(1)),
        generationTimeRatio: parseFloat((elapsed / actualDuration).toFixed(2))
      }
    }));
  }
  
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    
    // Send job failed webhook
    if (config.webhookUrl) {
      await sendWebhook(config.webhookUrl, createWebhookPayload(WEBHOOK_EVENTS.JOB_FAILED, jobId, {
        inputFile: url,
        outputFile: output,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        }
      }));
    }
    
    throw error;
  }
};