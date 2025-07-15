# Performance Optimization Guide

## Current Performance
- **Default**: ~7-8 seconds per second of video (at 60fps, 1080p)
- **Processing Rate**: ~8.5 fps

## Quick Wins for Better Performance

### 1. **Reduce Frame Rate** (Biggest Impact)
```javascript
const config = createConfig(url, output, duration);
config.fps = 30; // 50% fewer frames to process
// or
config.fps = 24; // 60% fewer frames (cinematic quality)
```

### 2. **Use VP8 Instead of VP9**
```javascript
config.codec = 'vp8'; // Faster encoding, slightly larger files
```

### 3. **Reduce Resolution**
```javascript
config.width = 1280;
config.height = 720; // 720p instead of 1080p
```

### 4. **Adjust Quality**
```javascript
config.quality = 30; // Higher CRF = lower quality but faster
// Default is 23, range is 15-35
```

## Performance Comparison

| Settings | Frames | Time (10s video) | Speed |
|----------|--------|------------------|-------|
| Default (60fps, 1080p, VP9) | 600 | ~71s | 8.5 fps |
| Optimized (30fps, 1080p, VP8) | 300 | ~35s | 8.5 fps |
| Fast (24fps, 720p, VP8) | 240 | ~28s | 8.5 fps |

## Recommended Configurations

### High Quality (slower)
```javascript
{
  fps: 60,
  width: 1920,
  height: 1080,
  codec: 'vp9',
  quality: 20
}
```

### Balanced (default)
```javascript
{
  fps: 30,
  width: 1920,
  height: 1080,
  codec: 'vp9',
  quality: 23
}
```

### Fast (recommended for previews)
```javascript
{
  fps: 30,
  width: 1920,
  height: 1080,
  codec: 'vp8',
  quality: 28
}
```

### Ultra Fast (lowest quality)
```javascript
{
  fps: 24,
  width: 1280,
  height: 720,
  codec: 'vp8',
  quality: 35
}
```

## Bottlenecks

The main performance bottlenecks are:
1. **Puppeteer screenshot capture** (~6-8ms per frame)
2. **PNG to RGBA conversion** (~2-4ms per frame)
3. **FFmpeg encoding** (varies by codec/quality)

Total overhead per frame: ~10-15ms minimum

## Future Optimizations

Potential improvements:
- Parallel frame capture (complex due to page state)
- GPU acceleration for encoding
- WebRTC capture instead of screenshots
- Native screen recording APIs
- WebAssembly-based encoder