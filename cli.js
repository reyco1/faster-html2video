#!/usr/bin/env node

const { Command } = require('commander');
const capture = require('./index');
const package = require('./package.json');

const program = new Command();

program
  .name('fast-html2video')
  .version(package.version)
  .description(package.description)
  .argument('<url>', 'URL or path to HTML file')
  .argument('<output>', 'Output video file path')
  .option('-d, --duration <seconds>', 'Duration in seconds', parseFloat, 5)
  .option('-f, --fps <rate>', 'Frames per second', (val) => parseInt(val, 10), 60)
  .option('-w, --width <pixels>', 'Video width', parseInt, 1920)
  .option('-h, --height <pixels>', 'Video height', parseInt, 1080)
  .option('-s, --selector <selector>', 'CSS selector for capture area', 'body')
  .option('-q, --quality <crf>', 'Video quality (0-51, lower is better)', parseInt, 23)
  .option('--enable-recording-control', 'Enable recording control via page signals')
  .option('--wait-for-start-signal', 'Wait for start signal from page before recording')
  .option('--no-metadata', 'Disable metadata JSON generation')
  .option('--verbose', 'Show FFmpeg output')
  .option('--quiet', 'Suppress all output')
  .action(async (url, output, options) => {
    try {
      const captureOptions = {
        url,
        output,
        duration: options.duration,
        fps: options.fps,
        width: options.width,
        height: options.height,
        selector: options.selector,
        quality: options.quality,
        enableRecordingControl: options.enableRecordingControl,
        waitForStartSignal: options.waitForStartSignal,
        generateMetadata: options.metadata !== false,
        verbose: options.verbose,
        quiet: options.quiet
      };
      
      await capture(captureOptions);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();