# fast-html2video

High-performance HTML animation to video converter using virtual time capture.

## Features

- **Frame-perfect capture** - Uses virtual time to ensure no frames are dropped
- **WebM with transparency** - Outputs VP9-encoded WebM files with alpha channel support
- **High performance** - Direct memory streaming, no disk I/O for frames
- **Accurate timing** - Captures exactly the requested duration at the specified framerate
- **Progress tracking** - Real-time capture progress updates

## Installation

```bash
npm install
npm link  # Optional: to use globally
```

## Usage

### Command Line

```bash
fast-html2video <input> <output> [options]

# Examples:
fast-html2video animation.html output.webm -d 30 -f 30
fast-html2video https://example.com/animation video.webm -d 60 --fps 60
```

### Options

- `-d, --duration <seconds>` - Duration in seconds (default: 5)
- `-f, --fps <rate>` - Frames per second (default: 60)
- `-w, --width <pixels>` - Video width (default: 1920)
- `-h, --height <pixels>` - Video height (default: 1080)
- `-s, --selector <selector>` - CSS selector for capture area (default: 'body')
- `-q, --quality <crf>` - Video quality, 0-51, lower is better (default: 23)
- `--verbose` - Show FFmpeg output
- `--quiet` - Suppress all output

### Programmatic API

```javascript
const capture = require('fast-html2video');

await capture({
  url: 'animation.html',
  output: 'video.webm',
  duration: 30,
  fps: 30,
  selector: '.stage'
});
```

## How it Works

fast-html2video uses virtual time control (via the timeweb library) to capture web animations frame-by-frame. Instead of recording in real-time, it:

1. Loads your HTML page in a headless browser
2. Overrides all JavaScript timing functions
3. Steps through time frame-by-frame
4. Captures each frame as a PNG
5. Streams frames directly to FFmpeg
6. Outputs a WebM video with transparency

This ensures perfect frame capture regardless of animation complexity or system performance.

## Requirements

- Node.js 14+
- FFmpeg with VP9 support
- Chrome or Chromium

## License

MIT