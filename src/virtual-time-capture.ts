/**
 * Enhanced Virtual Time Capture
 * High-performance frame-perfect animation capture
 */

import * as puppeteer from 'puppeteer';
import { VideoConfig, CaptureStats } from './faster-html2video';
import { injectCompleteVirtualTime, goToTime } from './virtual-time-complete';
import { TransparentWebMEncoder } from './faster-html2video';
import { ProgressBarManager } from './faster-html2video';

export async function captureVirtualTimeMode(
  page: puppeteer.Page,
  config: VideoConfig,
  encoder: TransparentWebMEncoder,
  progressBar: ProgressBarManager
): Promise<{ capturedFrames: number; duplicatedFrames: number }> {
  const fps = config.fps || 60;
  const duration = config.duration || 5;
  const totalFrames = Math.floor(duration * fps);
  
  console.log(`🎬 Starting capture: ${duration}s @ ${fps}fps = ${totalFrames} frames`);
  
  // Start progress bar
  progressBar.start(totalFrames);
  
  let capturedFrames = 0;
  let duplicatedFrames = 0;
  let lastPixelHash: string | null = null;
  
  // Pre-calculate all timestamps for efficiency
  const frameTimestamps = Array.from({ length: totalFrames }, (_, i) => (i / fps) * 1000);
  
  // Capture each frame at exact timestamp
  for (let frameNum = 0; frameNum < totalFrames; frameNum++) {
    const timestampMs = frameTimestamps[frameNum];
    
    // Navigate virtual time to exact frame timestamp
    await goToTime(page, timestampMs);
    
    // Minimal delay for rendering (5ms is enough with virtual time)
    await new Promise(resolve => setTimeout(resolve, 5));
    
    // Get viewport dimensions dynamically
    const viewport = await page.evaluate((stageSelector) => {
      const stage = document.querySelector(stageSelector) as HTMLElement;
      if (stage) {
        const rect = stage.getBoundingClientRect();
        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      }
      return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    }, config.stageSelector || '#stage');
    
    // Capture frame with dynamic clip region
    const screenshot = await page.screenshot({
      type: 'png',
      omitBackground: true,
      clip: viewport
    });
    
    // Convert to RGBA
    const pixels = await convertPngToRGBA(screenshot as Buffer, viewport.width, viewport.height);
    
    // Simple frame deduplication by comparing first 1KB of pixel data
    const pixelHash = pixels.slice(0, 1024).toString('base64');
    if (pixelHash === lastPixelHash && frameNum > 0) {
      await encoder.duplicateLastFrame();
      duplicatedFrames++;
    } else {
      await encoder.writeFrame(pixels);
      capturedFrames++;
      lastPixelHash = pixelHash;
    }
    
    // Aggressive memory cleanup
    if (screenshot instanceof Buffer) {
      screenshot.fill(0);
    }
    pixels.fill(0);
    
    // Update progress with performance stats
    const fps_actual = frameNum > 0 ? frameNum / ((Date.now() - progressBar['startTime']) / 1000) : 0;
    const extra = ` | ${fps_actual.toFixed(1)} fps | ${timestampMs.toFixed(0)}ms`;
    progressBar.update(frameNum + 1, extra);
    
    // More frequent GC for long captures
    if (frameNum % 100 === 0 && global.gc) {
      global.gc();
    }
  }
  
  progressBar.complete();
  
  return { capturedFrames, duplicatedFrames };
}

async function convertPngToRGBA(pngBuffer: Buffer, width: number, height: number): Promise<Buffer> {
  try {
    const sharp = await import('sharp');
    const rawPixels = await sharp.default(pngBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer();
    
    pngBuffer.fill(0);
    return rawPixels;
  } catch (error) {
    throw new Error('Failed to convert PNG to RGBA');
  }
}