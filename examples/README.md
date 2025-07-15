# Examples

This directory contains example HTML files and test scripts for faster-html2video.

## Animation Examples

### animation-simple.html
A basic animation example with a simple moving circle and rotating text.

```bash
npx faster-html2video examples/animation-simple.html output.webm -d 10
```

### animation-highenergy.html
A more complex animation with multiple moving elements and effects.

```bash
npx faster-html2video examples/animation-highenergy.html output.webm -d 20 -f 30
```

## Recording Control

### recording-control.html
Interactive example demonstrating the recording control API. Allows starting/stopping recording from within the HTML page.

```bash
# With manual start control
npx faster-html2video examples/recording-control.html output.webm \
  --enable-recording-control \
  --wait-for-start-signal \
  -f 30

# With automatic start
npx faster-html2video examples/recording-control.html output.webm \
  --enable-recording-control \
  -f 30
```

### test-recording-control.js
Test runner for recording control features.

```bash
cd examples
node test-recording-control.js 1  # Run test 1
```

## Utilities

### verify-transparency.html
Utility page to verify that generated WebM videos have proper transparency.

Open in browser with video parameter:
```
file:///path/to/examples/verify-transparency.html?video=../output/your-video.webm
```

## Tips

- All examples use transparent backgrounds by default
- Reduce FPS to 30 for faster processing: `-f 30`
- Use VP8 codec for faster encoding: `-c vp8`
- Adjust quality for speed vs file size: `-q 30` (higher = faster/lower quality)