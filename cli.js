#!/usr/bin/env node

const { Command } = require('commander');
const capture = require('./index');
const package = require('./package.json');
const path = require('path');
const fs = require('fs');

const program = new Command();

// Helper function to process a single file
async function processSingleFile(input, output, options) {
  const captureOptions = {
    url: input,
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
    webhookUrl: options.webhookUrl,
    verbose: options.verbose,
    quiet: options.quiet
  };
  
  await capture(captureOptions);
}

// Helper function for batch processing
async function processBatch(files, options) {
  const outputDir = options.outputDir || './batch-output';
  const parallel = options.parallel || 2;
  
  // Generate batch ID for webhook tracking
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log(`Batch converting ${files.length} files...`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Parallel conversions: ${parallel}`);
  console.log(`Settings: ${options.fps}fps, ${options.duration}s duration, quality=${options.quality}\n`);
  
  // Send batch started webhook
  if (options.webhookUrl) {
    const { sendWebhook, createWebhookPayload, WEBHOOK_EVENTS } = require('./lib/webhook');
    await sendWebhook(options.webhookUrl, createWebhookPayload(WEBHOOK_EVENTS.BATCH_STARTED, batchId, {
      totalFiles: files.length,
      outputDirectory: outputDir,
      parallelConversions: parallel,
      settings: {
        fps: options.fps,
        duration: options.duration,
        quality: options.quality,
        width: options.width,
        height: options.height
      }
    }));
  }
  
  const startTime = Date.now();
  const results = [];
  
  // Process files with concurrency limit
  const queue = [...files];
  const inProgress = [];
  
  while (queue.length > 0 || inProgress.length > 0) {
    // Start new processes up to the concurrency limit
    while (inProgress.length < parallel && queue.length > 0) {
      const file = queue.shift();
      const basename = path.basename(file, path.extname(file));
      const outputFile = path.join(outputDir, `${basename}.webm`);
      
      const index = files.indexOf(file);
      console.log(`[${index + 1}/${files.length}] Starting: ${file}`);
      
      const jobId = `${batchId}_job_${index + 1}`;
      const jobOptions = { ...options, jobId };
      
      const promise = processSingleFile(file, outputFile, jobOptions)
        .then(() => {
          console.log(`[${index + 1}/${files.length}] ✓ Completed: ${file}`);
          return { file, success: true, jobId };
        })
        .catch(error => {
          console.error(`[${index + 1}/${files.length}] ✗ Failed: ${file} - ${error.message}`);
          return { file, success: false, error: error.message, jobId };
        })
        .finally(() => {
          const idx = inProgress.indexOf(promise);
          inProgress.splice(idx, 1);
        });
        
      inProgress.push(promise);
    }
    
    // Wait for at least one to complete
    if (inProgress.length > 0) {
      const result = await Promise.race(inProgress);
      results.push(result);
      
      // Send batch progress webhook
      if (options.webhookUrl) {
        const { sendWebhook, createWebhookPayload, WEBHOOK_EVENTS } = require('./lib/webhook');
        const completed = results.length;
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        await sendWebhook(options.webhookUrl, createWebhookPayload(WEBHOOK_EVENTS.BATCH_PROGRESS, batchId, {
          totalFiles: files.length,
          completedFiles: completed,
          successfulFiles: successful,
          failedFiles: failed,
          progress: Math.round((completed / files.length) * 100),
          currentFile: result.file,
          currentFileSuccess: result.success
        }));
      }
    }
  }
  
  // Summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log('\n' + '='.repeat(60));
  console.log('BATCH CONVERSION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total files: ${files.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total time: ${totalTime}s`);
  console.log(`Average time: ${(totalTime / files.length).toFixed(1)}s per video`);
  
  if (failed > 0) {
    console.log('\nFailed conversions:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.file}: ${r.error}`);
    });
  }
  
  // Send batch completed webhook
  if (options.webhookUrl) {
    const { sendWebhook, createWebhookPayload, WEBHOOK_EVENTS } = require('./lib/webhook');
    const eventType = failed > 0 ? WEBHOOK_EVENTS.BATCH_COMPLETED : WEBHOOK_EVENTS.BATCH_COMPLETED;
    
    await sendWebhook(options.webhookUrl, createWebhookPayload(eventType, batchId, {
      totalFiles: files.length,
      successfulFiles: successful,
      failedFiles: failed,
      totalTime: parseFloat(totalTime),
      averageTimePerFile: parseFloat((totalTime / files.length).toFixed(1)),
      outputDirectory: outputDir,
      failedFiles: failed > 0 ? results.filter(r => !r.success).map(r => ({
        file: r.file,
        error: r.error
      })) : undefined
    }));
  }
}

program
  .name('fast-html2video')
  .version(package.version)
  .description(package.description)
  .arguments('[inputs...]')
  .option('-d, --duration <seconds>', 'Duration in seconds', parseFloat, 5)
  .option('-f, --fps <rate>', 'Frames per second', (val) => parseInt(val, 10), 60)
  .option('-w, --width <pixels>', 'Video width', parseInt, 1920)
  .option('-h, --height <pixels>', 'Video height', parseInt, 1080)
  .option('-s, --selector <selector>', 'CSS selector for capture area', 'body')
  .option('-q, --quality <crf>', 'Video quality (0-51, lower is better)', parseInt, 23)
  .option('--enable-recording-control', 'Enable recording control via page signals')
  .option('--wait-for-start-signal', 'Wait for start signal from page before recording')
  .option('--no-metadata', 'Disable metadata JSON generation')
  .option('--batch', 'Enable batch mode for multiple files')
  .option('--output-dir <dir>', 'Output directory for batch mode', './batch-output')
  .option('--parallel <n>', 'Number of parallel conversions in batch mode', parseInt, 2)
  .option('--webhook-url <url>', 'Webhook URL to notify of job progress and completion')
  .option('--verbose', 'Show FFmpeg output')
  .option('--quiet', 'Suppress all output')
  .action(async (inputs, options) => {
    try {
      // Handle different input scenarios
      let files = [];
      let outputFile = null;
      
      if (!inputs || inputs.length === 0) {
        console.error('Error: No input files specified');
        console.error('Run "fast-html2video --help" for usage information');
        process.exit(1);
      }
      
      // Determine if this is single file or batch mode
      if (inputs.length === 2 && !options.batch && !inputs[1].endsWith('.html')) {
        // Traditional single file mode: input.html output.webm
        files = [inputs[0]];
        outputFile = inputs[1];
      } else if (inputs.length === 1 && !options.batch) {
        // Single file without output specified
        console.error('Error: Output file required for single file mode');
        console.error('Usage: fast-html2video input.html output.webm');
        process.exit(1);
      } else {
        // Batch mode (explicit or implicit)
        files = inputs;
        options.batch = true;
      }
      
      // Process based on mode
      if (options.batch) {
        await processBatch(files, options);
      } else {
        // Single file mode
        await processSingleFile(files[0], outputFile, options);
      }
      
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Custom help
program.addHelpText('after', `
Examples:
  # Single file conversion
  $ fast-html2video animation.html output.webm -d 10 --fps 30
  
  # Batch conversion
  $ fast-html2video --batch --output-dir ./videos *.html
  $ fast-html2video --batch --parallel 4 file1.html file2.html file3.html
  
  # Batch with options
  $ fast-html2video --batch --output-dir ./output --fps 60 -d 30 animations/*.html
`);

program.parse();