#!/usr/bin/env node

import { Command } from 'commander';
import { FasterHTML2Video, VideoConfig, createConfig, captureHTML2Video } from './faster-html2video';
import { promises as fs } from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name('faster-html2video')
  .description('High-performance HTML animation to transparent WebM converter')
  .version('1.0.0');

program
  .argument('<url>', 'URL or file path to HTML page')
  .argument('<output>', 'Output WebM file path or directory')
  .requiredOption('-d, --duration <seconds>', 'Animation duration in seconds', parseFloat)
  .option('-w, --width <pixels>', 'Stage width in pixels', '1920')
  .option('-h, --height <pixels>', 'Stage height in pixels', '1080')
  .option('-f, --fps <rate>', 'Frames per second', '60')
  .option('-s, --stage <selector>', 'CSS selector for stage element', '#stage')
  .option('-q, --quality <crf>', 'Video quality (15-35, lower=better)', '23')
  .option('-c, --codec <codec>', 'Video codec (vp8|vp9)', 'vp9')
  .option('--no-transparency', 'Disable transparent background')
  .option('--no-frame-diff', 'Disable frame differencing optimization')
  .option('--start-delay <seconds>', 'Delay before capture starts', '1')
  .option('--enable-recording-control', 'Enable recording control via page communication')
  .option('--wait-for-start-signal', 'Wait for explicit start signal from page')
  .option('--max-recording-duration <seconds>', 'Maximum recording duration (default: 300)', '300')
  .option('--virtual-time', 'Use virtual time to ensure smooth animations (like timecut)')
  .option('--verbose', 'Enable verbose logging')
  .option('--benchmark', 'Run performance benchmark comparison')
  .action(async (url, output, options) => {
    try {
      if (options.benchmark) {
        await runBenchmark(url, output, options);
      } else {
        await runCapture(url, output, options);
      }
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

async function runCapture(url: string, output: string, options: any): Promise<void> {
  const resolvedUrl = url.startsWith('http') ? url : `file://${path.resolve(url)}`;
  
  // Handle output path - if it's a directory, create filename from input
  let outputPath = output;
  try {
    const stats = await fs.stat(output).catch(() => null);
    if (stats && stats.isDirectory()) {
      // Output is a directory, generate filename from input
      const inputName = path.basename(url, path.extname(url));
      outputPath = path.join(output, `${inputName}.webm`);
      console.log(`📁 Output directory detected, will save as: ${outputPath}`);
    }
  } catch (e) {
    // Path doesn't exist, assume it's a file path
  }
  
  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });
  
  const config: VideoConfig = {
    url: resolvedUrl,
    output: outputPath,
    duration: options.duration,
    width: parseInt(options.width),
    height: parseInt(options.height),
    fps: parseInt(options.fps),
    stageSelector: options.stage,
    quality: parseInt(options.quality),
    codec: options.codec,
    transparentBackground: options.transparency !== false,
    enableFrameDifferencing: options.frameDiff !== false,
    startDelay: options.startDelay ? parseFloat(options.startDelay) : 1,
    enableRecordingControl: options.enableRecordingControl || false,
    waitForStartSignal: options.waitForStartSignal || false,
    maxRecordingDuration: options.maxRecordingDuration ? parseFloat(options.maxRecordingDuration) : undefined,
    useVirtualTime: options.virtualTime || false,
    verbose: options.verbose || false
  };

  console.log('🚀 faster-html2video starting...\n');
  
  const stats = await captureHTML2Video(config);
  
  console.log('\n📊 Final Statistics:');
  console.log(`   Output file: ${outputPath}`);
  console.log(`   File size: ${stats.fileSizeMB.toFixed(1)} MB`);
  console.log(`   Total frames: ${stats.totalFrames}`);
  console.log(`   Processing time: ${stats.processingTimeSeconds.toFixed(1)}s`);
}

async function runBenchmark(url: string, output: string, options: any): Promise<void> {
  console.log('🏁 Running Performance Benchmark');
  
  const resolvedUrl = url.startsWith('http') ? url : `file://${path.resolve(url)}`;
  const benchmarkDuration = Math.min(options.duration, 10);
  
  const fastConfig = createConfig(resolvedUrl, 'benchmark_fast.webm', benchmarkDuration);
  fastConfig.width = parseInt(options.width);
  fastConfig.height = parseInt(options.height);
  fastConfig.fps = parseInt(options.fps);
  fastConfig.verbose = false;

  const startFast = Date.now();
  const fastStats = await captureHTML2Video(fastConfig);
  const fastTime = (Date.now() - startFast) / 1000;

  console.log(`✅ faster-html2video: ${fastTime.toFixed(1)}s`);
  console.log(`🏆 Processing rate: ${fastStats.averageFps.toFixed(1)} fps`);
}

if (require.main === module) {
  program.parse();
}