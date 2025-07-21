# 🎬 fast-html2video

High-performance HTML animation to video converter using virtual time capture. Convert your web animations, Canvas animations, WebGL content, and more into video files with frame-perfect accuracy.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org)

## 🌟 Features

- **🎯 Frame-Perfect Capture** - Uses virtual time to ensure no frames are dropped
- **🎨 Transparency Support** - WebM output with alpha channel preservation
- **⚡ High Performance** - Direct memory streaming, no disk I/O for frames
- **⏱️ Accurate Timing** - Captures exactly at the specified framerate
- **📊 Real-time Progress** - Visual progress tracking during capture
- **🎮 Recording Control** - HTML pages can control recording start/stop
- **🔄 Batch Processing** - Convert multiple files efficiently
- **📈 Detailed Metadata** - Optional JSON metadata for each capture

## 🚀 Quick Start

### Installation

```bash
# Install globally
npm install -g fast-html2video

# Or use locally in a project
npm install fast-html2video
```

### Basic Usage

```bash
# Convert an HTML file to video
fast-html2video animation.html output.webm -d 10 -f 30

# Convert from URL
fast-html2video https://example.com/animation video.webm -d 30 --fps 60

# Capture specific element
fast-html2video page.html output.webm -s "#animation-container" -d 20
```

## 📋 Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --duration <seconds>` | Video duration in seconds | 5 |
| `-f, --fps <rate>` | Frames per second | 60 |
| `-w, --width <pixels>` | Video width | 1920 |
| `-h, --height <pixels>` | Video height | 1080 |
| `-s, --selector <selector>` | CSS selector for capture area | 'body' |
| `-q, --quality <crf>` | Video quality (0-51, lower is better) | 23 |
| `--enable-recording-control` | Enable start/stop signals from page | false |
| `--wait-for-start-signal` | Wait for start signal before recording | false |
| `--no-metadata` | Disable metadata JSON generation | false |
| `--batch` | Enable batch mode for multiple files | false |
| `--output-dir <dir>` | Output directory for batch mode | './batch-output' |
| `--parallel <n>` | Number of parallel conversions | 2 |
| `--verbose` | Show FFmpeg output | false |
| `--quiet` | Suppress all output | false |

## 🎯 Examples

### Basic Animation Capture

```bash
# Capture a 10-second animation at 30fps
fast-html2video my-animation.html video.webm -d 10 --fps 30
```

### High-Quality Capture

```bash
# Maximum quality, 4K resolution, 60fps
fast-html2video animation.html hq-video.webm -w 3840 -h 2160 --fps 60 -q 10
```

### Recording Control

Let your HTML control when recording starts and stops:

```javascript
// In your HTML file
async function startRecording() {
  if (window.__recordingControl) {
    await window.__recordingControl('start');
  }
}

async function stopRecording() {
  if (window.__recordingControl) {
    await window.__recordingControl('stop');
  }
}

// Start recording when ready
document.addEventListener('DOMContentLoaded', () => {
  startRecording();
  
  // Stop after animation completes
  setTimeout(stopRecording, 5000);
});
```

Run with recording control:
```bash
fast-html2video animation.html output.webm -d 60 --enable-recording-control --wait-for-start-signal
```

### Batch Processing

Convert multiple files at once using the built-in batch mode:

```bash
# Basic batch conversion
fast-html2video --batch --output-dir ./videos animations/*.html

# Batch with parallel processing
fast-html2video --batch --output-dir ./videos --parallel 4 *.html

# Batch with custom settings
fast-html2video --batch --output-dir ./output --fps 60 -d 30 --parallel 2 animations/*.html

# Automatic batch mode (when multiple files provided)
fast-html2video file1.html file2.html file3.html --output-dir ./videos
```

## 🔧 Programmatic API

```javascript
const capture = require('fast-html2video');

// Basic usage
await capture({
  url: 'animation.html',
  output: 'video.webm',
  duration: 30,
  fps: 30
});

// Advanced options
await capture({
  url: 'https://example.com/animation',
  output: 'output/video.webm',
  duration: 60,
  fps: 60,
  width: 1920,
  height: 1080,
  selector: '.animation-stage',
  quality: 15,
  enableRecordingControl: true,
  waitForStartSignal: true,
  generateMetadata: true,
  quiet: false
});
```

## 🛠️ Advanced Usage

### Custom Viewport Sizes

```bash
# Mobile viewport
fast-html2video responsive.html mobile.webm -w 375 -h 667 -d 15

# Square video for social media
fast-html2video animation.html square.webm -w 1080 -h 1080 -d 30
```

### Specific Quality Settings

```bash
# Draft quality (fast, larger file)
fast-html2video animation.html draft.webm -q 35

# Production quality (slower, smaller file)
fast-html2video animation.html final.webm -q 18
```

### Without Metadata

```bash
# Skip metadata JSON generation
fast-html2video animation.html output.webm --no-metadata
```

## 📊 Metadata Output

When metadata generation is enabled (default), a JSON file is created with capture statistics:

```json
{
  "inputFile": "animation.html",
  "generationTime": 45.2,
  "processingSpeed": 8.5,
  "generationTimeRatio": 1.51,
  "capturedFrames": 300,
  "duration": 10,
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "fileSize": 2.4,
  "codec": "vp9",
  "outputFile": "output.webm",
  "timestamp": "2023-12-08T10:30:00.000Z"
}
```

## 🎨 Tips for Best Results

### HTML/CSS Guidelines

1. **Use absolute positioning** for animated elements
2. **Set explicit dimensions** on the container element
3. **Avoid external dependencies** that might load slowly
4. **Use CSS animations** or JavaScript with `requestAnimationFrame`
5. **Test locally first** before capturing from URLs

### Performance Optimization

1. **Close other applications** to free up CPU/memory
2. **Use lower FPS** (24-30) for faster processing
3. **Batch process** during off-hours for large jobs
4. **Enable recording control** to capture only needed segments

### Common Use Cases

- **Product Demos** - Capture interactive web demos
- **Data Visualizations** - Convert D3.js, Chart.js animations
- **Web Animations** - Export CSS/JS animations for video editing
- **Prototypes** - Document UI interactions and flows
- **Social Media** - Create videos from web content
- **Documentation** - Capture tutorial sequences

## 🔍 Troubleshooting

### No Chrome/Chromium Found

```bash
# macOS
export PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Linux
export PUPPETEER_EXECUTABLE_PATH="/usr/bin/google-chrome"

# Windows
set PUPPETEER_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
```

### FFmpeg Not Found

Install FFmpeg with VP9 support:

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

### Memory Issues

For long captures or high resolutions:

```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=8192" fast-html2video animation.html output.webm
```

## 🏗️ How It Works

fast-html2video achieves frame-perfect capture through a sophisticated virtual time system that completely controls animation timing. Here's the detailed process:

### 1. Virtual Time Override 🕰️

The core innovation is **virtual time control**. When your HTML page loads, fast-html2video injects the [timeweb](https://github.com/tungs/timeweb) library which overrides all browser timing functions:

```javascript
// These browser functions are replaced:
setTimeout()     → Virtual time equivalent
setInterval()    → Virtual time equivalent
Date.now()       → Returns virtual time
performance.now() → Returns virtual time
requestAnimationFrame() → Virtual frame timing
```

This means your animations run at exactly the pace we control, not real-time. A 10-second animation might take 2 minutes to capture, but every frame is perfect.

### 2. Frame-by-Frame Capture 🎬

Instead of recording in real-time, the system steps through time precisely:

```javascript
for (let frame = 0; frame < totalFrames; frame++) {
  // Jump to exact timestamp for this frame
  const timestamp = frame * (1000 / fps);
  await goToTimeAndAnimateForCapture(page, timestamp);
  
  // Let animations render at this exact moment
  await page.evaluate(() => new Promise(resolve => 
    requestAnimationFrame(resolve)
  ));
  
  // Capture this frame as PNG
  const screenshot = await page.screenshot({
    type: 'png',
    omitBackground: true  // Preserves transparency
  });
}
```

### 3. Direct Memory Streaming 🚀

Rather than saving thousands of PNG files to disk, frames are streamed directly to FFmpeg:

```javascript
// Launch FFmpeg with WebM VP9 encoding
const ffmpeg = spawn('ffmpeg', [
  '-f', 'image2pipe',           // Accept images from stdin
  '-vcodec', 'png',             // Input format is PNG
  '-r', fps,                    // Set framerate
  '-i', '-',                    // Read from stdin (pipe)
  '-vcodec', 'libvpx-vp9',      // VP9 codec for WebM
  '-pix_fmt', 'yuva420p',       // Preserve alpha channel
  '-crf', quality,              // Quality setting
  '-deadline', 'good',          // Encoding speed vs quality
  output                        // Output file
]);

// Stream each frame directly to FFmpeg
ffmpeg.stdin.write(screenshot);
```

### 4. Puppeteer Browser Control 🎭

The system uses Puppeteer to control a headless Chrome browser:

```javascript
// Launch browser with specific settings
const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--disable-web-security',
    '--disable-dev-shm-usage',
    '--no-sandbox'
  ]
});

// Set exact viewport size
await page.setViewport({
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1
});
```

### 5. Recording Control Integration 🎮

When recording control is enabled, the system exposes functions to the page:

```javascript
// Inject recording control function into the page
await page.exposeFunction('__recordingControl', async (action) => {
  if (action === 'start') {
    recordingStarted = true;
    return { status: 'started' };
  } else if (action === 'stop') {
    recordingStopped = true;
    return { status: 'stopped' };
  }
});
```

Your HTML can then control recording:
```javascript
// In your HTML
await window.__recordingControl('start');  // Begin capture
await window.__recordingControl('stop');   // End capture
```

### 6. Progress Tracking 📊

Different progress indicators based on mode:

```javascript
if (config.enableRecordingControl) {
  // Dynamic progress: ⏺ Recording │ 245 frames captured │ 32s │ 7.6 fps
  progressBar = new cliProgress.SingleBar({
    format: '⏺ Recording │ {value} frames captured │ {duration}s │ {fps}'
  });
} else {
  // Fixed progress: ████████░░░░ │ 67% │ 201/300 frames │ ETA: 45s │ 8.2 fps  
  progressBar = new cliProgress.SingleBar({
    format: '{bar} │ {percentage}% │ {value}/{total} frames │ ETA: {eta}s │ {fps}'
  });
}
```

### 7. Metadata Generation 📈

Each capture generates detailed statistics:

```javascript
const metadata = {
  inputFile: url,                           // Source HTML file
  generationTime: elapsed,                  // Total capture time
  processingSpeed: captureRate,             // Frames per second processed
  generationTimeRatio: elapsed / actualDuration, // Speed ratio
  capturedFrames: actualFramesCaptured,     // Frames actually captured
  duration: actualDuration,                 // Final video length
  codec: 'vp9',                            // Video codec used
  // ... more stats
};
```

### Why This Works So Well ⚡

1. **Frame Perfect**: Every frame captured at exact timing, no drops or duplicates
2. **System Independent**: CPU load doesn't affect animation timing
3. **Transparent**: Preserves alpha channels for overlays and effects
4. **Memory Efficient**: No temporary files, direct streaming to video
5. **Flexible**: Works with any web animation (CSS, JavaScript, Canvas, WebGL)

This approach ensures that complex animations with varying performance requirements all capture at perfect quality, regardless of your system's performance.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Uses [Puppeteer](https://pptr.dev/) for browser automation
- [FFmpeg](https://ffmpeg.org/) for video encoding
- [timeweb](https://github.com/tungs/timeweb) for timing control

## 📞 Support

- 🐛 [Report Issues](https://github.com/reyco1/faster-html2video/issues)
- 💡 [Request Features](https://github.com/reyco1/faster-html2video/issues/new)
- 📖 [Discussions](https://github.com/reyco1/faster-html2video/discussions)

---

Made with ❤️ by the community