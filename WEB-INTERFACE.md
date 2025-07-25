# Web Interface Documentation

The fast-html2video package now includes a comprehensive web interface for generating videos from HTML animations with real-time progress monitoring.

## Quick Start

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Start the web server**:
   ```bash
   npm run server
   # or
   npm run dev
   ```

3. **Open the web interface**:
   - Video Generation: http://localhost:3000/viewers/generate-video.html
   - Video Viewer: http://localhost:3000/viewers/view-video.html

## Features

### 🎬 Video Generation Interface
- **File Selection**: Choose from existing HTML examples or upload custom files
- **Real-time Settings**: Configure duration, FPS, resolution, quality, and more
- **Live Progress**: Watch generation progress with frame counts and ETA
- **Instant Preview**: View generated videos immediately with transparency support
- **Metadata Display**: Detailed generation statistics and performance metrics
- **Recent Videos**: Quick access to previously generated videos
- **Dark/Light Theme**: Toggle between themes for comfortable viewing

### 📊 Key Features
- **Server-Sent Events**: Real-time progress updates without polling
- **File Upload**: Drag-and-drop or click to upload custom HTML files
- **Recording Control**: Support for HTML-controlled recording start/stop
- **Format Conversion**: Convert WebM videos to MP4 or QuickTime (MOV) formats
- **Real-time Conversion Progress**: Live progress tracking for video conversions
- **Batch Management**: View, download, and delete generated videos
- **Video Registry**: Automatic tracking of all generated videos
- **Responsive Design**: Works on desktop and mobile devices

## Configuration Options

### Basic Settings
- **Duration**: Video length in seconds (1-300)
- **FPS**: Frame rate (24, 30, 60)
- **Resolution**: Width x Height (100x100 to 4096x4096)
- **Quality**: CRF value (18=Excellent, 23=Good, 28=Fair, 35=Draft)
- **CSS Selector**: Target element to capture (default: body)

### Advanced Settings
- **Recording Control**: Enable HTML page to control recording
- **Wait for Signal**: Wait for start signal before beginning capture
- **Custom Upload**: Upload and use your own HTML files

## API Endpoints

The web interface provides a REST API for integration:

```
GET  /api/html-files          - List available HTML files
POST /api/upload              - Upload HTML file
POST /api/generate            - Start video generation
GET  /api/progress/:jobId     - Real-time progress (SSE)
GET  /api/videos              - List generated videos
GET  /api/metadata/:filename  - Get video metadata
POST /api/convert/:filename   - Convert video to MP4/MOV format
DELETE /api/video/:filename   - Delete video
```

## HTML Recording Control

Your HTML animations can control recording using the built-in API:

```javascript
// Start recording
if (window.__recordingControl) {
  await window.__recordingControl('start');
}

// Stop recording
if (window.__recordingControl) {
  await window.__recordingControl('stop');
}
```

Example with auto-timing:
```javascript
document.addEventListener('DOMContentLoaded', async () => {
  // Start recording when animation is ready
  await window.__recordingControl('start');
  
  // Stop after animation completes
  setTimeout(async () => {
    await window.__recordingControl('stop');
  }, 5000);
});
```

## Video Format Conversion

The web interface supports converting WebM videos to other popular formats for better compatibility across different platforms and devices.

### Supported Formats
- **MP4**: H.264/AVC codec with AAC audio, widely compatible
- **QuickTime (MOV)**: Apple's container format, ideal for macOS/iOS

### How to Convert

#### Via Video Viewer
1. Open http://localhost:3000/viewers/view-video.html
2. Select a WebM video from the dropdown
3. Scroll to the "Format Conversion" section
4. Click "Convert to MP4" or "Convert to QuickTime (MOV)"
5. Monitor real-time conversion progress
6. Download the converted file when complete

#### Via Generation Interface
1. Generate a video using http://localhost:3000/viewers/generate-video.html
2. After generation completes, use the conversion options below the video preview
3. Click the desired format button and monitor progress
4. Download the converted file directly

#### Via API
```javascript
// Start conversion
const response = await fetch('/api/convert/video.webm', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ format: 'mp4' }) // or 'mov'
});

const { jobId, outputFilename } = await response.json();

// Monitor progress via Server-Sent Events
const eventSource = new EventSource(`/api/progress/${jobId}`);
eventSource.onmessage = (event) => {
  const { status, progress, message } = JSON.parse(event.data);
  console.log(`${status}: ${progress}% - ${message}`);
};
```

### Conversion Features
- **Real-time Progress**: Live progress bars with percentage completion
- **Quality Preservation**: Maintains original video quality (CRF 23)
- **Fast Start**: MP4 files optimized for web streaming
- **Batch Conversion**: Convert multiple videos simultaneously
- **Error Handling**: Graceful fallbacks and detailed error messages

### Technical Details
- Uses FFmpeg with optimized encoding settings
- H.264 codec with YUV420P pixel format for maximum compatibility
- Medium encoding preset balances speed and quality
- Automatic cleanup of temporary files

## File Structure

```
viewers/
├── generate-video.html    # Main generation interface
└── view-video.html        # Video viewer (existing)

server.js                  # Express web server
uploads/                   # Uploaded HTML files
output/                    # Generated videos
video-registry.json        # Video metadata registry
```

## Customization

### Themes
The interface supports dark and light themes. Click the moon/sun icon in the top-right corner to toggle.

### Settings Persistence
Your last used settings are remembered in the browser for convenience.

### File Organization
- HTML examples are automatically detected from the `examples/` directory
- Uploaded files are stored in `uploads/`
- Generated videos are saved in `output/`
- Metadata is automatically generated for each video

## Troubleshooting

### Server Won't Start
- Ensure all dependencies are installed: `npm install`
- Check that port 3000 is available
- Look for error messages in the console

### Generation Fails
- Verify the HTML file is valid and accessible
- Check browser console for JavaScript errors in your HTML
- Ensure FFmpeg is installed and accessible
- Try reducing video resolution or duration

### Upload Issues
- Only HTML files are supported
- File size limit is 10MB
- Ensure the file has a .html extension

### Progress Not Updating
- Check that Server-Sent Events are supported in your browser
- Disable browser extensions that might block SSE
- Refresh the page and try again

## Performance Tips

1. **Lower FPS** (24-30) for faster generation
2. **Smaller resolution** for quicker processing
3. **Close other applications** to free up resources
4. **Use recording control** to capture only needed segments
5. **Test animations locally** before generating videos

## Integration Examples

### Starting Server Programmatically
```javascript
const express = require('express');
const server = require('./server');

// Server runs on port 3000 by default
// Set PORT environment variable to change
process.env.PORT = 8080;
```

### Custom Webhook Integration
```javascript
// Start generation with webhook notifications
const response = await fetch('/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    htmlFile: 'examples/animation.html',
    duration: 10,
    fps: 30,
    webhookUrl: 'https://your-server.com/webhook'
  })
});
```

The web interface provides a complete solution for HTML-to-video conversion with professional features and an intuitive user experience.