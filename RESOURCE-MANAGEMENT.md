# Resource Management in faster-html2video

This document describes the resource management strategies implemented to prevent memory leaks and ensure efficient operation during video capture.

## Memory Management Features

### 1. Buffer Cleanup
- **Pixel buffers**: Immediately cleared after writing to FFmpeg encoder (`pixels.fill(0)`)
- **Screenshot buffers**: Cleared after PNG to RGBA conversion
- **Write queue**: Periodically cleaned up and explicitly cleared on errors

### 2. Garbage Collection
- **Automatic GC**: Triggered every 300 frames (5-10 seconds at 30-60fps)
- **Small delay**: Uses `setImmediate` to allow GC to run effectively
- **Error recovery**: Forces GC on errors and after browser closure

### 3. FFmpeg Process Management
- **Write queue management**: Prevents unbounded memory growth
- **Backpressure handling**: Respects FFmpeg's ability to consume data
- **Timeout protection**: 10-second timeout on writes, 30-second timeout on close
- **Process cleanup**: Ensures FFmpeg process is terminated on errors

### 4. Browser Resource Cleanup
- **Page closure**: All pages explicitly closed before browser shutdown
- **Force kill**: Falls back to SIGKILL if graceful shutdown fails
- **Memory monitoring**: Tracks heap usage and displays in progress bar

### 5. Progress Bar Management
- **Safe initialization**: Handles progress bar creation failures
- **Clean shutdown**: Properly stops progress bar on completion or error
- **Memory display**: Shows current memory usage in real-time

## Resource Lifecycle

### Encoder Lifecycle
```javascript
// Creation
encoder = new TransparentWebMEncoder(config, output);
await encoder.initialize();

// Usage
await encoder.writeFrame(pixels);

// Cleanup (automatic in finalize() or manual on error)
encoder.destroy();
```

### Frame Capture Lifecycle
```javascript
// Capture
const { pixels } = await frameCapture.captureFrame(timestamp);

// Use
await encoder.writeFrame(pixels);

// Cleanup (immediate)
pixels.fill(0);
```

### Browser Lifecycle
```javascript
// Creation
browser = await puppeteer.launch(options);
page = await browser.newPage();

// Cleanup (in finally block)
const pages = await browser.pages();
await Promise.all(pages.map(page => page.close()));
await browser.close();
```

## Best Practices

1. **Clear buffers immediately**: Don't keep pixel data longer than necessary
2. **Use write queues**: Prevent memory buildup from buffering
3. **Monitor memory**: Track usage and adjust GC frequency if needed
4. **Handle errors gracefully**: Always clean up resources in error paths
5. **Test with long videos**: Ensure memory stays stable over time

## Memory Monitoring

The progress bar displays real-time memory usage:
```
████████████░░░░░░░░ │ 55% │ 165/300 frames │ ETA: 15s │ Mem: 245MB
```

Monitor this during capture to ensure memory usage remains stable.

## Configuration

For systems with limited memory, consider:
- Reducing FPS: `-f 30` instead of default 60
- Using VP8 codec: `-c vp8` (faster, less memory intensive)
- Increasing GC frequency: Modify the 300-frame interval in code

## Troubleshooting

If you experience memory issues:

1. **Check memory usage**: Watch the progress bar memory indicator
2. **Enable verbose mode**: `-v` to see detailed FFmpeg output
3. **Force GC**: Run with `--js-flags=--expose-gc` (already enabled by default)
4. **Reduce parallel operations**: Lower frame processing concurrency

## Implementation Details

Key files and functions:
- `TransparentWebMEncoder`: Manages FFmpeg process and write queue
- `SmartFrameCapture`: Handles screenshot capture and conversion
- `ProgressBarManager`: Monitors and displays memory usage
- Main capture loop: Coordinates GC and resource cleanup

The system is designed to handle videos of any length while maintaining stable memory usage.