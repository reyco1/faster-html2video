/**
 * faster-html2video
 * 
 * High-performance HTML animation to WebM video converter
 * with transparent background support and optimized frame processing.
 */

import { spawn, ChildProcess } from 'child_process';
import { Readable, Transform } from 'stream';
import * as puppeteer from 'puppeteer';
import { performance } from 'perf_hooks';
import * as process from 'process';
import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import { injectVirtualTime, advanceTime, setTime } from './virtual-time';

// Type declarations for page.evaluate context
declare global {
  interface Window {
    seekToTime?: (time: number) => Promise<void>;
    getAnimationState?: () => any;
    mainTimeline?: any;
    __recordingControl?: (action: string, data?: any) => Promise<any>;
    __advanceVirtualTime?: (ms: number) => void;
    __setVirtualTime?: (ms: number) => void;
    __getVirtualTime?: () => number;
  }
}

// Recording control types
export enum RecordingState {
  NOT_STARTED = 'NOT_STARTED',
  RECORDING = 'RECORDING',
  PAUSED = 'PAUSED',
  STOPPED = 'STOPPED'
}

export interface RecordingControlAction {
  action: 'start' | 'stop' | 'pause' | 'resume' | 'status';
  timestamp?: number;
  data?: any;
}

// Progress bar utility with awesome styling
class ProgressBarManager {
  private bar: cliProgress.SingleBar;
  private startTime: number;
  private lastMemoryUpdate: number = 0;
  private memoryMB: number = 0;

  constructor() {
    this.startTime = Date.now();
    
    // Create a custom format with colors and emojis
    const format = chalk.cyan('{bar}') + ' │' +
      chalk.green('{percentage}%') + ' │' +
      chalk.yellow('{value}/{total} frames') + ' │' +
      chalk.blue('ETA: {eta_formatted}') + ' │' +
      chalk.magenta('Mem: {memory}MB') + 
      '{extra}';

    this.bar = new cliProgress.SingleBar({
      format: format,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      barsize: 30,
      etaBuffer: 50,
      fps: 10,
      forceRedraw: true,
      linewrap: false,
      clearOnComplete: true,
      stopOnComplete: true,
      formatValue: (v: any, options: any, type: string) => {
        if (type === 'eta') {
          return this.formatTime(v);
        }
        return String(v);
      }
    }, cliProgress.Presets.shades_classic);
  }

  start(total: number): void {
    this.bar.start(total, 0, {
      memory: this.memoryMB,
      extra: '',
      eta_formatted: 'calculating...'
    });
  }

  update(current: number, extra: string = ''): void {
    // Update memory usage every second
    const now = Date.now();
    if (now - this.lastMemoryUpdate > 1000) {
      const memUsage = process.memoryUsage();
      this.memoryMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      this.lastMemoryUpdate = now;
    }

    const elapsed = (now - this.startTime) / 1000;
    const rate = current / elapsed;
    const remaining = this.bar.getTotal() - current;
    const eta = rate > 0 ? remaining / rate : 0;

    this.bar.update(current, {
      memory: this.memoryMB,
      extra: extra ? ' │ ' + chalk.gray(extra) : '',
      eta_formatted: this.formatTime(eta)
    });
  }

  complete(): void {
    this.bar.stop();
  }
  
  destroy(): void {
    try {
      this.bar.stop();
    } catch (e) {
      // Ignore errors during cleanup
    }
  }

  private formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${Math.floor(seconds)}s`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }
  }
}

export interface VideoConfig {
  url: string;
  output: string;
  width?: number;
  height?: number;
  fps?: number;
  duration: number;
  
  // Stage capture settings
  stageSelector?: string;
  transparentBackground?: boolean;
  
  // Quality settings  
  quality?: number;
  codec?: 'vp8' | 'vp9';
  
  // Optimization settings
  enableFrameDifferencing?: boolean;
  differenceThreshold?: number;
  memoryStreamingEnabled?: boolean;
  
  // Recording control settings
  enableRecordingControl?: boolean;
  waitForStartSignal?: boolean;
  maxRecordingDuration?: number;
  
  // Virtual time control
  useVirtualTime?: boolean;
  
  // Advanced settings
  verbose?: boolean;
  keepTempFiles?: boolean;
  startDelay?: number;
}

export interface CaptureStats {
  totalFrames: number;
  capturedFrames: number;
  skippedFrames: number;
  processingTimeSeconds: number;
  averageFps: number;
  fileSizeMB: number;
}

export interface FrameState {
  timestamp: number;
  stateHash: string;
  hasTransparency: boolean;
  isDifferent: boolean;
}

class TransparentWebMEncoder {
  private ffmpegProcess: ChildProcess | null = null;
  private frameCount = 0;
  private startTime = performance.now();
  private isReady = false;
  private writeQueue: Buffer[] = [];
  private isWriting = false;
  private errorOccurred = false;
  private errorMessage = '';
  private isDestroyed = false;

  constructor(
    private config: VideoConfig,
    private outputFile: string
  ) {}

  async initialize(): Promise<void> {
    const codec = this.config.codec || 'vp9';
    const quality = this.config.quality || 23;
    const fps = this.config.fps || 60;
    const width = this.config.width || 1920;
    const height = this.config.height || 1080;

    // For WebM with transparency, we need specific settings
    const baseArgs = [
      '-f', 'rawvideo',
      '-pixel_format', 'rgba',
      '-video_size', `${width}x${height}`,
      '-framerate', fps.toString(),
      '-i', 'pipe:0'
    ];
    
    // Codec-specific settings for transparency with performance optimizations
    const codecArgs = codec === 'vp9' ? [
      '-c:v', 'libvpx-vp9',
      '-pix_fmt', 'yuva420p',
      '-crf', quality.toString(),
      '-b:v', '0',
      '-deadline', 'realtime',
      '-cpu-used', '8', // Maximum speed
      '-tile-columns', '4', // More parallelism
      '-tile-rows', '2', // More parallelism
      '-threads', '0', // Use all available threads
      '-auto-alt-ref', '0',
      '-lag-in-frames', '0',
      '-row-mt', '1', // Enable row multithreading
      '-frame-parallel', '1', // Enable frame parallel decoding
      '-static-thresh', '0',
      '-max-intra-rate', '300',
      '-error-resilient', '1' // Faster encoding
    ] : [
      '-c:v', 'libvpx',
      '-pix_fmt', 'yuva420p', 
      '-crf', quality.toString(),
      '-b:v', '0',
      '-deadline', 'realtime',
      '-cpu-used', '16', // Maximum speed for VP8
      '-threads', '0', // Use all available threads
      '-auto-alt-ref', '0',
      '-lag-in-frames', '0',
      '-static-thresh', '0',
      '-arnr-maxframes', '0', // Disable temporal denoising
      '-arnr-strength', '0' // Disable temporal denoising
    ];
    
    const outputArgs = [
      '-metadata:s:v:0', 'alpha_mode=1',
      '-metadata', 'title=Generated by faster-html2video',
      '-f', 'webm',
      '-cluster_size_limit', '2M',
      '-cluster_time_limit', '5100',
      '-y',
      this.outputFile
    ];
    
    const ffmpegArgs = [...baseArgs, ...codecArgs, ...outputArgs];

    if (this.config.verbose) {
      console.log('FFmpeg command:', 'ffmpeg', ffmpegArgs.join(' '));
    }

    this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Always capture stderr for debugging
    if (this.ffmpegProcess.stderr) {
      let lastStderrOutput = '';
      this.ffmpegProcess.stderr.on('data', (data) => {
        lastStderrOutput = data.toString();
        if (this.config.verbose) {
          console.log('FFmpeg:', lastStderrOutput);
        }
      });
      
      // Store last stderr for error reporting
      (this as any).lastStderrOutput = () => lastStderrOutput;
    }

    this.ffmpegProcess.on('error', (error) => {
      this.errorOccurred = true;
      this.errorMessage = `FFmpeg error: ${error.message}`;
      console.error(this.errorMessage);
    });

    if (this.ffmpegProcess.stdin) {
      this.ffmpegProcess.stdin.on('error', (error) => {
        this.errorOccurred = true;
        this.errorMessage = `FFmpeg stdin error: ${error.message}`;
        console.error(this.errorMessage);
      });
    }

    this.ffmpegProcess.on('exit', (code, signal) => {
      if (code !== 0) {
        this.errorOccurred = true;
        this.errorMessage = `FFmpeg exited with code ${code}, signal ${signal}`;
        console.error(this.errorMessage);
      }
    });

    this.isReady = true;
  }

  async writeFrame(pixelData: Buffer): Promise<void> {
    if (!this.isReady || !this.ffmpegProcess?.stdin) {
      throw new Error('Encoder not initialized');
    }

    if (this.errorOccurred) {
      throw new Error(this.errorMessage || 'FFmpeg process has failed');
    }

    this.writeQueue.push(pixelData);
    await this.processWriteQueue();
    this.frameCount++;

    // Verbose logging is now handled by progress bar in main capture loop
    
    // Free up memory from processed frames periodically
    if (this.frameCount % 100 === 0 && this.writeQueue.length === 0) {
      // Clear any lingering buffers in the queue
      this.writeQueue = [];
    }
  }

  private async processWriteQueue(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0 || this.errorOccurred) {
      return;
    }

    this.isWriting = true;

    try {
      while (this.writeQueue.length > 0 && !this.errorOccurred) {
        const data = this.writeQueue.shift()!;
        await this.writeToFFmpeg(data);
      }
    } catch (error) {
      console.error('Error in write queue:', error);
      this.errorOccurred = true;
      this.errorMessage = error instanceof Error ? error.message : String(error);
      // Clear the queue on error
      this.clearWriteQueue();
    } finally {
      this.isWriting = false;
    }
  }
  
  private clearWriteQueue(): void {
    // Explicitly clear buffers to free memory
    for (const buffer of this.writeQueue) {
      if (buffer instanceof Buffer) {
        buffer.fill(0);
      }
    }
    this.writeQueue = [];
  }

  private writeToFFmpeg(data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ffmpegProcess?.stdin) {
        reject(new Error('FFmpeg stdin not available'));
        return;
      }

      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        reject(new Error('FFmpeg write timeout - process may be hung'));
      }, 10000); // 10 second timeout for faster failure detection

      const cleanup = () => {
        clearTimeout(timeout);
      };

      const canWrite = this.ffmpegProcess.stdin.write(data, (error) => {
        cleanup();
        if (error) {
          reject(error);
        } else if (canWrite) {
          resolve();
        }
      });
      
      if (!canWrite) {
        this.ffmpegProcess.stdin.once('drain', () => {
          cleanup();
          resolve();
        });
      }
    });
  }

  async duplicateLastFrame(): Promise<void> {
    this.frameCount++;
  }

  async finalize(): Promise<CaptureStats> {
    if (!this.ffmpegProcess) {
      throw new Error('No FFmpeg process to finalize');
    }
    
    if (this.isDestroyed) {
      throw new Error('Encoder already destroyed');
    }

    console.log('   Starting finalization...');
    
    // Stop accepting new frames
    this.isReady = false;
    
    // Wait for any pending writes to complete
    let retries = 0;
    while ((this.isWriting || this.writeQueue.length > 0) && retries < 100) {
      await new Promise(resolve => setTimeout(resolve, 100));
      retries++;
    }
    
    if (retries >= 100) {
      console.error('Warning: Write queue did not empty after 10 seconds');
    }

    console.log('   Closing FFmpeg stdin...');
    
    // Close stdin and wait for FFmpeg to finish
    const closePromise = new Promise<void>((resolve, reject) => {
      let closed = false;
      
      const cleanup = () => {
        if (!closed) {
          closed = true;
          resolve();
        }
      };

      const timeout = setTimeout(() => {
        console.error('FFmpeg close timeout - process may be hung');
        if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
          console.error('Attempting to kill FFmpeg process...');
          this.ffmpegProcess.kill('SIGTERM');
          setTimeout(() => {
            if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
              this.ffmpegProcess.kill('SIGKILL');
            }
          }, 5000);
        }
        cleanup();
      }, 30000); // 30 second timeout

      this.ffmpegProcess!.once('close', (code) => {
        clearTimeout(timeout);
        console.log(`   FFmpeg closed with code ${code}`);
        cleanup();
      });

      this.ffmpegProcess!.once('exit', (code) => {
        clearTimeout(timeout);
        console.log(`   FFmpeg exited with code ${code}`);
        cleanup();
      });

      // Close stdin
      try {
        if (this.ffmpegProcess?.stdin && !this.ffmpegProcess.stdin.destroyed) {
          this.ffmpegProcess.stdin.end();
        }
      } catch (err) {
        console.error('Error closing stdin:', err);
      }
    });
    
    await closePromise;

    const endTime = performance.now();
    const totalTime = (endTime - this.startTime) / 1000;

    const fs = await import('fs/promises');
    const stats = await fs.stat(this.outputFile);

    const result = {
      totalFrames: this.frameCount,
      capturedFrames: this.frameCount,
      skippedFrames: 0,
      processingTimeSeconds: totalTime,
      averageFps: this.frameCount / totalTime,
      fileSizeMB: stats.size / (1024 * 1024)
    };
    
    // Clean up resources
    this.destroy();
    
    return result;
  }
  
  destroy(): void {
    if (this.isDestroyed) return;
    
    this.isDestroyed = true;
    this.isReady = false;
    
    // Clear write queue
    this.clearWriteQueue();
    
    // Terminate FFmpeg process if still running
    if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
      this.ffmpegProcess.kill('SIGTERM');
      this.ffmpegProcess = null;
    }
  }
}

class SmartFrameCapture {
  private page: puppeteer.Page;
  private lastFrameState: FrameState | null = null;
  private skippedFrames = 0;
  private stageSelector: string;

  constructor(page: puppeteer.Page, config: VideoConfig) {
    this.page = page;
    this.stageSelector = config.stageSelector || '#stage';
  }

  async captureFrame(timestamp: number): Promise<{
    pixels: Buffer | null;
    isDuplicate: boolean;
    frameState: FrameState;
  }> {
    await this.page.evaluate((time) => {
      if (window.seekToTime) {
        return window.seekToTime(time);
      }
    }, timestamp);

    const currentState = await this.getFrameState(timestamp);
    const isDifferent = this.isFrameDifferent(currentState);

    if (!isDifferent && this.lastFrameState) {
      this.skippedFrames++;
      return {
        pixels: null,
        isDuplicate: true,
        frameState: currentState
      };
    }

    const pixels = await this.captureStagePixels();
    this.lastFrameState = currentState;

    return {
      pixels,
      isDuplicate: false,
      frameState: currentState
    };
  }

  private async getFrameState(timestamp: number): Promise<FrameState> {
    return await this.page.evaluate((ts, selector) => {
      const animState = window.getAnimationState ? window.getAnimationState() : null;
      const stage = document.querySelector(selector);
      
      if (!stage) {
        throw new Error(`Stage element not found: ${selector}`);
      }

      const computedStyle = window.getComputedStyle(stage);
      const children = Array.from(stage.children).map(child => {
        const style = window.getComputedStyle(child);
        return `${style.transform}|${style.opacity}|${child.textContent}`;
      }).join('||');

      const stateString = `${ts}|${children}|${animState?.progress || 0}`;
      const stateHash = stateString.split('').reduce((hash, char) => {
        return ((hash << 5) - hash) + char.charCodeAt(0);
      }, 0).toString();

      return {
        timestamp: ts,
        stateHash,
        hasTransparency: computedStyle.backgroundColor === 'rgba(0, 0, 0, 0)' || 
                         computedStyle.backgroundColor === 'transparent',
        isDifferent: true
      };
    }, timestamp, this.stageSelector);
  }

  private isFrameDifferent(currentState: FrameState): boolean {
    if (!this.lastFrameState) return true;
    return currentState.stateHash !== this.lastFrameState.stateHash;
  }

  private async captureStagePixels(): Promise<Buffer> {
    const stageInfo = await this.page.evaluate((selector) => {
      const stage = document.querySelector(selector) as HTMLElement;
      if (!stage) {
        throw new Error(`Stage element not found: ${selector}`);
      }

      const rect = stage.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      };
    }, this.stageSelector);

    const screenshot = await this.page.screenshot({
      type: 'png',
      omitBackground: true,
      clip: {
        x: stageInfo.x,
        y: stageInfo.y,
        width: stageInfo.width,
        height: stageInfo.height
      }
    });

    const pixels = await this.convertPngToRGBA(screenshot as Buffer, stageInfo.width, stageInfo.height);
    
    // Clear the screenshot buffer to free memory
    if (screenshot instanceof Buffer) {
      screenshot.fill(0);
    }
    
    return pixels;
  }

  private async convertPngToRGBA(pngBuffer: Buffer, width: number, height: number): Promise<Buffer> {
    try {
      const sharp = await import('sharp');
      
      // Use sharp to convert PNG to raw RGBA pixels
      const rawPixels = await sharp.default(pngBuffer)
        .ensureAlpha() // Ensure alpha channel exists
        .raw() // Get raw pixel data
        .toBuffer();
      
      // Clear the input buffer after conversion
      pngBuffer.fill(0);
      
      return rawPixels;
    } catch (error) {
      console.error('Sharp conversion failed, falling back to FFmpeg:', error);
      
      // Fallback to FFmpeg if sharp fails
      const { spawn } = await import('child_process');
      
      return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-f', 'image2pipe',
          '-vcodec', 'png',
          '-i', 'pipe:0',
          '-f', 'rawvideo',
          '-pix_fmt', 'rgba',
          '-vcodec', 'rawvideo',
          'pipe:1'
        ], {
          stdio: ['pipe', 'pipe', 'ignore']
        });
        
        const chunks: Buffer[] = [];
        
        ffmpeg.stdout.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        ffmpeg.on('close', (code) => {
          if (code === 0) {
            resolve(Buffer.concat(chunks));
          } else {
            reject(new Error('Failed to convert PNG to RGBA'));
          }
        });
        
        ffmpeg.on('error', reject);
        ffmpeg.stdin.end(pngBuffer);
      });
    }
  }

  getSkippedFrameCount(): number {
    return this.skippedFrames;
  }
}

export class FasterHTML2Video {
  private browser: puppeteer.Browser | null = null;
  private recordingState: RecordingState = RecordingState.NOT_STARTED;
  private recordingStartTime: number = 0;
  private recordingFrames: number[] = [];
  private recordingControlReady: boolean = false;

  async capture(config: VideoConfig): Promise<CaptureStats> {
    const startTime = performance.now();
    let encoder: TransparentWebMEncoder | null = null;
    let progressBar: ProgressBarManager | null = null;
    let progressBarStarted = false;
    
    console.log(`🎬 faster-html2video: Starting capture`);
    console.log(`   URL: ${config.url}`);
    console.log(`   Output: ${config.output}`);
    console.log(`   Duration: ${config.duration}s @ ${config.fps || 60}fps`);
    
    if (config.enableRecordingControl) {
      console.log(`   Recording control: ENABLED`);
      if (config.waitForStartSignal) {
        console.log(`   Waiting for start signal from page...`);
      }
    }

    try {
      console.log('   Launching browser...');
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-dev-shm-usage',
          '--disable-gpu-sandbox',
          '--enable-webgl',
          '--disable-features=TranslateUI',
          '--disable-extensions',
          '--disable-sync',
          '--no-first-run',
          '--safebrowsing-disable-auto-update',
          '--js-flags=--expose-gc --max-old-space-size=4096',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security', // For faster rendering
          '--allow-running-insecure-content'
        ]
      });

      console.log('   Browser launched successfully!');
      const page = await this.browser.newPage();
      console.log('   Page created!');
      
      await page.setViewport({
        width: config.width || 1920,
        height: config.height || 1080,
        deviceScaleFactor: 1
      });

      // Inject virtual time control if enabled
      if (config.useVirtualTime) {
        console.log('   Injecting virtual time control...');
        await injectVirtualTime(page);
      }

      // Set up recording control BEFORE navigating to the page
      if (config.enableRecordingControl) {
        await this.setupRecordingControl(page, config);
      }

      console.log('   Navigating to URL...');
      await page.goto(config.url, { 
        waitUntil: 'networkidle0',
        timeout: 30000
      });
      console.log('   Page loaded!');
      
      // If using virtual time, advance time a bit to let initial scripts run
      if (config.useVirtualTime) {
        console.log('   Advancing virtual time for initialization...');
        await advanceTime(page, 100); // Advance 100ms
        await new Promise(resolve => setTimeout(resolve, 50)); // Real delay for browser processing
      }
      
      // Make the page background transparent for capture
      await page.evaluate((stageSelector) => {
        document.body.style.background = 'transparent';
        document.documentElement.style.background = 'transparent';
        
        // Also ensure the stage has transparent background
        const stage = document.querySelector(stageSelector) as HTMLElement;
        if (stage) {
          stage.style.background = 'transparent';
          stage.style.backgroundColor = 'transparent';
        }
        
        // Log what we're capturing for debugging
        console.log('Body background:', window.getComputedStyle(document.body).backgroundColor);
        console.log('Stage background:', stage ? window.getComputedStyle(stage).backgroundColor : 'no stage');
      }, config.stageSelector || '#stage');

      const delay = config.startDelay ? config.startDelay * 1000 : 1000;
      await new Promise(resolve => setTimeout(resolve, delay));

      const stageExists = await page.evaluate((selector) => {
        return !!document.querySelector(selector);
      }, config.stageSelector || '#stage');

      if (!stageExists) {
        throw new Error(`Stage element not found: ${config.stageSelector || '#stage'}`);
      }

      const frameCapture = new SmartFrameCapture(page, config);
      encoder = new TransparentWebMEncoder(config, config.output);

      await encoder.initialize();

      const fps = config.fps || 60;
      
      // Wait for start signal if configured
      if (config.enableRecordingControl && config.waitForStartSignal) {
        await this.waitForStartSignal(page, config);
      }

      // Calculate frame count - always respect the duration from command line
      const maxDuration = config.duration;
      const maxFrames = Math.ceil(config.duration * fps);
      
      if (config.enableRecordingControl) {
        console.log(`🎥 Recording ready (duration: ${maxDuration}s @ ${fps}fps)`);
        console.log(`   Recording control enabled - waiting for start/stop signals`);
        if (config.maxRecordingDuration) {
          console.log(`   Safety limit: ${config.maxRecordingDuration}s`);
        }
      } else {
        console.log(`🎥 Capturing ${maxFrames} frames...`);
      }

      let capturedFrames = 0;
      let duplicatedFrames = 0;
      let currentFrame = 0;

      // Create progress bar
      progressBar = new ProgressBarManager();
      
      try {
        progressBar.start(maxFrames);
        progressBarStarted = true;
      } catch (e) {
        console.error('Failed to start progress bar:', e);
      }
      
      // Recording loop
      while (currentFrame < maxFrames) {
        const timestamp = currentFrame / fps;
        
        // If using virtual time, advance time to match frame
        if (config.useVirtualTime) {
          const targetTimeMs = timestamp * 1000;
          await setTime(page, targetTimeMs);
          await advanceTime(page, 0); // Trigger any pending timeouts at this exact time
          // Small delay to let the browser process the time change
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        // Check if we should stop
        if (config.enableRecordingControl && this.recordingState === RecordingState.STOPPED) {
          console.log('   Recording stopped by user');
          break;
        }
        
        // Apply safety limit if specified
        if (config.enableRecordingControl && config.maxRecordingDuration) {
          const recordingDuration = (performance.now() - this.recordingStartTime) / 1000;
          if (recordingDuration > config.maxRecordingDuration) {
            console.log('   Recording stopped - safety limit reached');
            break;
          }
        }
        
        // Skip frame if paused or not recording
        if (config.enableRecordingControl && !this.shouldCaptureFrame()) {
          await new Promise(resolve => setTimeout(resolve, 1000 / fps)); // Wait frame duration
          continue;
        }
        
        try {
          const { pixels, isDuplicate } = await frameCapture.captureFrame(timestamp);

          if (isDuplicate) {
            await encoder.duplicateLastFrame();
            duplicatedFrames++;
          } else if (pixels) {
            await encoder.writeFrame(pixels);
            capturedFrames++;
            
            // Clear the pixel buffer immediately after writing
            pixels.fill(0);
            
            // Allow garbage collection every 300 frames (5-10 seconds at 30-60fps)
            // More frequent GC to prevent memory buildup
            if (capturedFrames % 300 === 0) {
              if (global.gc) {
                global.gc();
              }
              // Small delay to allow GC to run
              await new Promise(resolve => setImmediate(resolve));
            }
          }

          // Track captured frame
          if (config.enableRecordingControl) {
            this.recordingFrames.push(currentFrame);
          }
          
          currentFrame++;

          // Update progress bar
          if (config.enableRecordingControl) {
            const currentDuration = currentFrame / fps;
            const extra = `${currentDuration.toFixed(1)}s | ${this.recordingState}`;
            progressBar.update(currentFrame, extra);
          } else {
            progressBar.update(currentFrame);
          }
        } catch (frameError) {
          console.error(`Error processing frame ${currentFrame}:`, frameError);
          currentFrame++; // Move to next frame even on error
          
          // Continue with next frame instead of failing completely
          if (!config.enableRecordingControl && currentFrame < maxFrames - 1) {
            continue;
          }
          
          // For recording control mode, only throw if it's a critical error
          if (!config.enableRecordingControl) {
            throw frameError; // Re-throw on last frame
          }
        }
      }

      // Complete progress bar
      if (progressBarStarted) {
        try {
          progressBar.complete();
        } catch (e) {
          // Ignore errors during progress bar completion
        }
      }
      
      console.log('🎞️  Finalizing video encoding...');
      const stats = await encoder.finalize();
      
      stats.skippedFrames = frameCapture.getSkippedFrameCount();
      stats.capturedFrames = capturedFrames;

      const endTime = performance.now();
      const totalSeconds = (endTime - startTime) / 1000;

      console.log('✅ Capture completed!');
      console.log(`   Total time: ${totalSeconds.toFixed(1)}s`);
      console.log(`   Processing rate: ${(currentFrame / totalSeconds).toFixed(1)} fps`);
      console.log(`   Output size: ${stats.fileSizeMB.toFixed(1)}MB`);

      // Write metadata to JSON file
      const metadata = {
        generationTime: totalSeconds,
        processingSpeed: currentFrame / totalSeconds,
        totalFrames: stats.totalFrames,
        capturedFrames: stats.capturedFrames,
        skippedFrames: stats.skippedFrames,
        duration: config.enableRecordingControl ? (currentFrame / (config.fps || 60)) : config.duration,
        recordingControlEnabled: config.enableRecordingControl || false,
        fps: config.fps || 60,
        width: config.width || 1920,
        height: config.height || 1080,
        fileSize: stats.fileSizeMB,
        fileSizeBytes: stats.fileSizeMB * 1024 * 1024,
        codec: config.codec || 'vp9',
        quality: config.quality || 23,
        outputFile: config.output,
        timestamp: new Date().toISOString()
      };

      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Write individual metadata file
      await fs.writeFile(
        config.output.replace(/\.[^.]+$/, '.metadata.json'),
        JSON.stringify(metadata, null, 2)
      );
      
      // Update video registry
      const registryPath = path.join(path.dirname(config.output), '..', 'video-registry.json');
      let registry: any = { videos: [] };
      
      try {
        const existingRegistry = await fs.readFile(registryPath, 'utf-8');
        registry = JSON.parse(existingRegistry);
      } catch (e) {
        // Registry doesn't exist yet, use default
      }
      
      // Add or update entry for this video
      const videoEntry = {
        filename: path.basename(config.output),
        path: path.relative(path.dirname(registryPath), config.output),
        metadataPath: path.relative(path.dirname(registryPath), config.output.replace(/\.[^.]+$/, '.metadata.json')),
        directory: path.relative(path.dirname(registryPath), path.dirname(config.output)),
        generatedAt: metadata.timestamp,
        duration: metadata.duration,
        fps: metadata.fps,
        resolution: `${metadata.width}x${metadata.height}`,
        fileSize: metadata.fileSize,
        processingSpeed: metadata.processingSpeed
      };
      
      // Remove existing entry if updating
      registry.videos = registry.videos.filter((v: any) => v.path !== videoEntry.path);
      
      // Add new entry at the beginning (most recent first)
      registry.videos.unshift(videoEntry);
      
      // Keep only last 100 videos
      registry.videos = registry.videos.slice(0, 100);
      
      // Update last updated timestamp
      registry.lastUpdated = new Date().toISOString();
      
      // Write updated registry
      await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));
      
      return stats;

    } catch (error) {
      console.error('Capture error:', error);
      
      // Clean up progress bar on error
      if (progressBar && progressBarStarted) {
        try {
          progressBar.destroy();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      
      // Clean up encoder on error
      if (encoder) {
        try {
          encoder.destroy();
        } catch (e) {
          console.error('Error destroying encoder:', e);
        }
      }
      
      // Log memory usage at time of error
      const memUsage = process.memoryUsage();
      console.error('Memory usage at error:');
      console.error(`  RSS: ${(memUsage.rss / 1024 / 1024).toFixed(1)}MB`);
      console.error(`  Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);
      console.error(`  Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(1)}MB`);
      console.error(`  External: ${(memUsage.external / 1024 / 1024).toFixed(1)}MB`);
      
      throw error;
    } finally {
      // Clean up browser resources
      if (this.browser) {
        try {
          // Close all pages first
          const pages = await this.browser.pages();
          await Promise.all(pages.map(page => page.close().catch(() => {})));
          
          // Then close the browser
          await this.browser.close();
        } catch (e) {
          console.error('Error closing browser:', e);
          // Force kill if graceful close fails
          try {
            this.browser.process()?.kill('SIGKILL');
          } catch {} 
        }
        this.browser = null;
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
  }

  private async setupRecordingControl(page: puppeteer.Page, config: VideoConfig): Promise<void> {
    // Expose the recording control function
    await page.exposeFunction('__recordingControl', async (action: string, data?: any) => {
      console.log(`Recording control: ${action}`, data);
      
      // If waiting for start signal and not ready yet, queue or ignore commands
      if (config.waitForStartSignal && !this.recordingControlReady) {
        console.log(`   ⚠️  Recording control not ready yet, ignoring ${action}`);
        return { status: 'not_ready', timestamp: Date.now() };
      }
      
      switch (action) {
        case 'start':
          if (this.recordingState === RecordingState.NOT_STARTED || this.recordingState === RecordingState.PAUSED) {
            this.recordingState = RecordingState.RECORDING;
            this.recordingStartTime = performance.now();
            console.log('   📹 Recording STARTED');
            return { status: 'started', timestamp: Date.now() };
          }
          return { status: 'already_recording' };
          
        case 'stop':
          if (this.recordingState === RecordingState.RECORDING) {
            this.recordingState = RecordingState.STOPPED;
            console.log('   ⏹️  Recording STOPPED');
            return { status: 'stopped', timestamp: Date.now() };
          }
          return { status: 'not_recording' };
          
        case 'pause':
          if (this.recordingState === RecordingState.RECORDING) {
            this.recordingState = RecordingState.PAUSED;
            console.log('   ⏸️  Recording PAUSED');
            return { status: 'paused', timestamp: Date.now() };
          }
          return { status: 'not_recording' };
          
        case 'resume':
          if (this.recordingState === RecordingState.PAUSED) {
            this.recordingState = RecordingState.RECORDING;
            console.log('   ▶️  Recording RESUMED');
            return { status: 'resumed', timestamp: Date.now() };
          }
          return { status: 'not_paused' };
          
        case 'status':
          return { 
            state: this.recordingState, 
            timestamp: Date.now(),
            framesCaptured: this.recordingFrames.length
          };
          
        default:
          return { error: 'Unknown action' };
      }
    });

    // Also listen for console messages as a secondary method
    if (config.verbose) {
      page.on('console', async (msg) => {
        const text = msg.text();
        if (text.startsWith('RECORDING:')) {
          const command = text.substring(10).toLowerCase();
          await (page.evaluate((cmd) => {
            if (window.__recordingControl) {
              return window.__recordingControl(cmd);
            }
          }, command) as Promise<any>);
        }
      });
    }

    // Initialize recording state
    if (!config.waitForStartSignal) {
      this.recordingState = RecordingState.RECORDING;
      this.recordingControlReady = true;
    }
  }

  private shouldCaptureFrame(): boolean {
    return this.recordingState === RecordingState.RECORDING;
  }

  private async waitForStartSignal(page: puppeteer.Page, config: VideoConfig): Promise<void> {
    const maxWaitTime = 60000; // 60 seconds max wait
    const startWaitTime = Date.now();
    
    // Mark recording control as ready to accept commands
    this.recordingControlReady = true;
    
    console.log('   ⏳ Waiting for recording start signal...');
    
    let virtualTimeMs = 100; // Start from where we left off
    
    while (this.recordingState === RecordingState.NOT_STARTED) {
      // If using virtual time, advance it to trigger timeouts in the page
      if (config.useVirtualTime) {
        await advanceTime(page, 100); // Advance 100ms of virtual time
        virtualTimeMs += 100;
        await new Promise(resolve => setTimeout(resolve, 50)); // Real delay for processing
      } else {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (Date.now() - startWaitTime > maxWaitTime) {
        throw new Error('Timeout waiting for recording start signal');
      }
    }
  }
}

export async function captureHTML2Video(config: VideoConfig): Promise<CaptureStats> {
  const capture = new FasterHTML2Video();
  return await capture.capture(config);
}

export function createConfig(url: string, output: string, duration: number): VideoConfig {
  return {
    url,
    output,
    duration,
    width: 1920,
    height: 1080,
    fps: 60,
    stageSelector: '#stage',
    transparentBackground: true,
    enableFrameDifferencing: true,
    memoryStreamingEnabled: true,
    codec: 'vp9',
    quality: 23,
    verbose: true
  };
}