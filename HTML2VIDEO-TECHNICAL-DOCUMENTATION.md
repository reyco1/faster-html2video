# HTML to Video Conversion - Technical Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Conversion Pipeline](#core-conversion-pipeline)
4. [Virtual Time System](#virtual-time-system)
5. [Frame Capture Process](#frame-capture-process)
6. [FFmpeg Integration](#ffmpeg-integration)
7. [Performance Optimizations](#performance-optimizations)
8. [Configuration Options](#configuration-options)
9. [Error Handling](#error-handling)
10. [Extensibility](#extensibility)

## Overview

The fast-html2video system is a high-performance HTML animation to video converter that transforms dynamic web content into video files. It uses Puppeteer for browser automation, the timeweb library for deterministic time control, and FFmpeg for video encoding with hardware acceleration support.

### Key Features

- **Deterministic Animation Capture**: Uses virtual time control to ensure consistent frame timing
- **Hardware Acceleration**: Supports NVIDIA NVENC, Apple VideoToolbox, Intel QSV, and AMD AMF
- **Transparency Support**: VP9 codec with alpha channel for transparent videos
- **Real-time Progress Tracking**: Live progress bars and webhook notifications
- **Batch Processing**: Concurrent processing of multiple HTML files
- **Recording Control**: Optional page-controlled start/stop signals
- **Memory Efficient**: Direct PNG streaming to FFmpeg stdin

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    fast-html2video System                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │    CLI      │    │  Web UI     │    │    API      │         │
│  │  (cli.js)   │    │ Interface   │    │  Server     │         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                  │                  │                │
│         └──────────────────┼──────────────────┘                │
│                            │                                   │
│  ┌─────────────────────────▼─────────────────────────┐         │
│  │             Core Conversion Engine                │         │
│  │                (index.js)                        │         │
│  │                                                   │         │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐│         │
│  │  │   Browser   │  │  Virtual    │  │   Frame     ││         │
│  │  │ Management  │  │    Time     │  │  Capture    ││         │
│  │  │ (Puppeteer) │  │  Control    │  │   Loop      ││         │
│  │  └─────────────┘  └─────────────┘  └─────────────┘│         │
│  └─────────────────────────┬─────────────────────────┘         │
│                            │                                   │
│  ┌─────────────────────────▼─────────────────────────┐         │
│  │            Supporting Libraries                   │         │
│  │                                                   │         │
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │         │
│  │ │   Virtual   │ │     GPU     │ │  Webhook    │   │         │
│  │ │    Time     │ │Acceleration │ │Notifications│   │         │
│  │ │(virtual-    │ │(gpu-accel   │ │ (webhook    │   │         │
│  │ │ time.js)    │ │ eration.js) │ │  .js)       │   │         │
│  │ └─────────────┘ └─────────────┘ └─────────────┘   │         │
│  └─────────────────────────┬─────────────────────────┘         │
│                            │                                   │
│  ┌─────────────────────────▼─────────────────────────┐         │
│  │                   FFmpeg                          │         │
│  │            (Video Encoding Pipeline)              │         │
│  │                                                   │         │
│  │ PNG Frames ──► Hardware Decode ──► VP9 Encode ──► │         │
│  │    (stdin)        (Optional)       (Software)     │         │
│  └───────────────────────────────────────────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

- **CLI Interface** (`cli.js`): Command-line argument parsing and batch processing coordination
- **Core Engine** (`index.js`): Main conversion logic and orchestration
- **Virtual Time** (`lib/virtual-time.js`): Deterministic animation timing control
- **GPU Acceleration** (`lib/gpu-acceleration.js`): Hardware encoder detection and optimization
- **Webhook System** (`lib/webhook.js`): Real-time progress notifications

## Core Conversion Pipeline

The conversion process follows these sequential steps:

### 1. Configuration Setup (`index.js:23-42`)

```javascript
config = Object.assign({
  fps: 60,
  duration: 5,
  width: 1920,
  height: 1080,
  pixFmt: 'yuva420p', // For transparency
  codec: 'vp9',
  quality: 23,
  pipeMode: true
}, config || {});
```

**Key Calculations:**
- `totalFrames = Math.floor(duration * fps)` - Total frames to capture
- `frameDuration = 1000 / fps` - Milliseconds per frame for virtual time

### 2. Browser Launch (`index.js:61-81`)

Puppeteer launches with performance-optimized arguments:

```javascript
const launchOptions = {
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
  ]
};
```

**Chrome Detection**: On macOS, automatically uses system Chrome if available for better performance.

### 3. Virtual Time Injection (`index.js:92`)

Before page navigation, the system injects the timeweb library:

```javascript
await overwriteTime(page);
```

This replaces native JavaScript timing functions (`setTimeout`, `requestAnimationFrame`, etc.) with controlled versions.

### 4. Page Setup and Navigation (`index.js:115-158`)

- Sets viewport dimensions
- Navigates to target URL
- Configures transparent background
- Optionally waits for recording control signals

### 5. FFmpeg Process Initialization (`index.js:161-196`)

Spawns FFmpeg with optimized arguments based on hardware capabilities:

```javascript
const generationConfig = getOptimizedGenerationArgs(
  output, fps, config.width, config.height, 
  config.pixFmt, config.quality, config.accelerationMethod
);
ffmpeg = spawn('ffmpeg', generationConfig.args);
```

### 6. Frame Capture Loop (`index.js:243-330`)

The core capture process:

```javascript
for (let frameNum = 0; frameNum < totalFrames; frameNum++) {
  const timestamp = frameNum * frameDuration;
  
  // Set virtual time
  await goToTimeAndAnimateForCapture(page, timestamp);
  
  // Capture screenshot
  const screenshot = await page.screenshot({
    type: 'png',
    omitBackground: true,
    clip: captureArea
  });
  
  // Stream to FFmpeg
  if (!ffmpeg.stdin.write(screenshot)) {
    await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
  }
}
```

**Key Features:**
- Deterministic timing via `goToTimeAndAnimateForCapture()`
- Transparent background capture with `omitBackground: true`
- Backpressure handling with drain events
- Real-time progress tracking and webhooks

### 7. Finalization (`index.js:332-421`)

- Closes FFmpeg stdin stream
- Waits for encoding completion
- Generates metadata JSON
- Sends completion webhooks
- Reports performance statistics

## Virtual Time System

The virtual time system (`lib/virtual-time.js`) is crucial for deterministic video generation.

### Implementation Details

```javascript
const overwriteTime = async function(page) {
  // Inject timeweb before any page scripts run
  await page.evaluateOnNewDocument(timewebLib);
  
  // Initialize at time 0
  await page.evaluateOnNewDocument(() => {
    window.addEventListener('DOMContentLoaded', () => {
      if (window.timeweb) {
        window.timeweb.goTo(0);
      }
    });
  });
};
```

### Time Control Process

1. **Library Injection**: The timeweb library is injected before any page scripts execute
2. **Function Override**: Native timing functions are replaced with controlled versions
3. **Frame Positioning**: For each frame, `goToTimeAndAnimateForCapture()` sets the exact timestamp
4. **Animation Processing**: All CSS animations, JavaScript timers, and RAF callbacks process at the set time

### Benefits

- **Consistent Timing**: Eliminates frame rate variations and timing drift
- **Reproducible Output**: Same HTML always generates identical video
- **Frame Accuracy**: Each captured frame represents exactly the specified timestamp

## Frame Capture Process

### Screenshot Configuration

```javascript
const screenshot = await page.screenshot({
  type: 'png',        // Raw PNG for quality
  omitBackground: true, // Enable transparency
  clip: captureArea   // Custom capture region
});
```

### Capture Area Detection (`index.js:259-271`)

```javascript
const captureArea = await page.evaluate((selector) => {
  const element = document.querySelector(selector);
  if (!element) return null;
  
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height
  };
}, config.selector || 'body');
```

### Memory Management

- **Direct Streaming**: PNG data streams directly from Puppeteer to FFmpeg stdin
- **Backpressure Handling**: Uses drain events to prevent memory overflow
- **No Temporary Files**: Avoids disk I/O for intermediate frames

## FFmpeg Integration

### Hardware Acceleration Detection (`lib/gpu-acceleration.js`)

The system automatically detects available hardware encoders:

```javascript
const DETECTION_ORDER = ['nvenc', 'videotoolbox', 'qsv', 'amf', 'cpu'];
```

### VP9 Generation Arguments

For HTML-to-video conversion with transparency:

```javascript
// Input from stdin
args.push('-f', 'image2pipe');
args.push('-framerate', fps.toString());
args.push('-i', '-');

// VP9 encoding with transparency
args.push('-c:v', 'libvpx-vp9');
args.push('-pix_fmt', 'yuva420p');
args.push('-crf', quality.toString());
args.push('-deadline', 'good');
args.push('-cpu-used', '2');
```

### Hardware Acceleration Limitations

Most hardware encoders don't support VP9 with alpha channel, so the system:
1. Uses hardware acceleration for decoding/preprocessing when available
2. Falls back to software VP9 encoding for transparency support
3. Optimizes CPU threading for software encoding

## Performance Optimizations

### 1. Browser Optimizations

- **Headless Mode**: Uses newest headless implementation
- **Background Throttling Disabled**: Prevents animation slowdowns
- **Device Scale Factor**: Fixed at 1.0 for consistent rendering
- **Chrome Detection**: Uses system Chrome on macOS for better performance

### 2. Memory Management

- **Pipe Mode**: Direct PNG streaming eliminates temporary files
- **Backpressure Handling**: Prevents memory overflow during capture
- **Resource Cleanup**: Proper browser and FFmpeg process termination

### 3. Parallel Processing

The CLI supports batch processing with configurable concurrency:

```javascript
// Process files with concurrency limit
const queue = [...files];
const inProgress = [];

while (queue.length > 0 || inProgress.length > 0) {
  while (inProgress.length < parallel && queue.length > 0) {
    // Start new process
    const promise = processSingleFile(file, outputFile, options);
    inProgress.push(promise);
  }
  
  // Wait for completion
  const result = await Promise.race(inProgress);
}
```

### 4. Hardware Acceleration Profiles

```javascript
const ACCELERATION_PROFILES = {
  nvenc: {
    name: 'NVIDIA NVENC',
    encoder: 'h264_nvenc',
    // ~10x faster than CPU
  },
  videotoolbox: {
    name: 'Apple VideoToolbox', 
    encoder: 'h264_videotoolbox',
    // ~6-7x faster than CPU
  },
  // ... other profiles
};
```

## Configuration Options

### Core Settings

| Option | Default | Description |
|--------|---------|-------------|
| `fps` | 60 | Frames per second for output video |
| `duration` | 5 | Video duration in seconds |
| `width` | 1920 | Video width in pixels |
| `height` | 1080 | Video height in pixels |
| `quality` | 23 | Video quality (CRF value, lower = better) |
| `selector` | 'body' | CSS selector for capture area |

### Advanced Options

| Option | Default | Description |
|--------|---------|-------------|
| `pixFmt` | 'yuva420p' | Pixel format (yuva420p for transparency) |
| `codec` | 'vp9' | Video codec |
| `pipeMode` | true | Stream frames directly to FFmpeg |
| `enableRecordingControl` | false | Allow page to control recording |
| `waitForStartSignal` | false | Wait for page start signal |
| `accelerationMethod` | auto | Hardware acceleration method |

### Webhook Integration

```javascript
{
  webhookUrl: 'https://api.example.com/webhooks',
  jobId: 'custom-job-id' // Optional custom identifier
}
```

Webhook events:
- `JOB_STARTED`: Conversion begins
- `JOB_PROGRESS`: Progress updates (every 10% or 50 frames)
- `JOB_COMPLETED`: Successful completion
- `JOB_FAILED`: Error occurred

### Recording Control

When enabled, HTML pages can control recording:

```javascript
// In your HTML page
__recordingControl('start'); // Begin recording
__recordingControl('stop');  // End recording
```

## Error Handling

### Browser Process Management

```javascript
try {
  // Conversion logic
} catch (error) {
  if (browser) {
    await browser.close(); // Ensure cleanup
  }
  
  if (config.webhookUrl) {
    await sendWebhook(/* failure notification */);
  }
  
  throw error;
}
```

### FFmpeg Error Handling

```javascript
ffmpeg.on('error', (err) => {
  ffmpegError = err;
});

// Check during frame writing
if (ffmpegError) {
  throw ffmpegError;
}
```

### Batch Processing Resilience

- Individual file failures don't stop batch processing
- Detailed error reporting for failed conversions
- Webhook notifications for batch progress and failures

## Extensibility

### Adding New Hardware Encoders

1. **Define Profile** in `lib/gpu-acceleration.js`:

```javascript
const ACCELERATION_PROFILES = {
  new_encoder: {
    name: 'New Hardware Encoder',
    hwaccel: 'new_hwaccel',
    encoder: 'new_encoder_name',
    pixelFormat: 'yuv420p',
    preset: 'medium',
    extraArgs: ['-custom', 'args']
  }
};
```

2. **Add Detection Logic**:

```javascript
async function testHardwareEncoder(encoder) {
  // Test if encoder is available
  return encoderAvailable;
}
```

3. **Update Detection Order**:

```javascript
const DETECTION_ORDER = ['nvenc', 'new_encoder', 'videotoolbox', ...];
```

### Custom Page Interactions

Extend the virtual time system for custom page interactions:

```javascript
// In lib/virtual-time.js
const customPageAction = async function(page, action, params) {
  await page.evaluate((action, params) => {
    // Custom page manipulation
    window.customHandler(action, params);
  }, action, params);
};
```

### Additional Output Formats

Modify FFmpeg arguments in `lib/gpu-acceleration.js`:

```javascript
function getCustomFormatArgs(outputPath, format, options) {
  const args = ['-y'];
  
  // Format-specific configuration
  if (format === 'custom_format') {
    args.push('-c:v', 'custom_encoder');
    args.push('-custom_option', 'value');
  }
  
  return { args, profile: 'Custom Format' };
}
```

### Webhook Event Extensions

Add new webhook events in `lib/webhook.js`:

```javascript
const WEBHOOK_EVENTS = {
  // Existing events...
  CUSTOM_EVENT: 'custom_event',
  FRAME_MILESTONE: 'frame_milestone'
};

// Send custom notifications
await sendWebhook(webhookUrl, createWebhookPayload(
  WEBHOOK_EVENTS.CUSTOM_EVENT, 
  jobId, 
  customData
));
```

### Plugin Architecture

For advanced extensibility, consider implementing a plugin system:

```javascript
// Plugin interface
class ConversionPlugin {
  async beforeCapture(page, config) { /* Pre-capture hook */ }
  async afterFrame(frameData, frameNum) { /* Post-frame hook */ }
  async beforeEncode(ffmpegArgs) { /* Pre-encode hook */ }
  async afterComplete(metadata) { /* Post-completion hook */ }
}

// Plugin registration
const plugins = [
  new CustomAnimationPlugin(),
  new MetricsCollectionPlugin(),
  new CloudUploadPlugin()
];
```

This architecture enables developers to extend functionality without modifying core conversion logic, making the system highly adaptable for specific use cases.