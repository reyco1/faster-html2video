# CLI Usage Examples

## Basic Usage

### 1. Output to specific file
```bash
npx faster-html2video input.html output.webm -d 10
```

### 2. Output to directory (filename auto-generated)
```bash
npx faster-html2video input.html outputs/ -d 10
# Creates: outputs/input.webm
```

### 3. With custom settings
```bash
npx faster-html2video animation.html videos/ -d 5 --fps 30 --quality 26
```

## Common Options

- `-d, --duration <seconds>` - Animation duration (required)
- `-f, --fps <rate>` - Frames per second (default: 60)
- `-q, --quality <crf>` - Video quality, 15-35 (default: 23)
- `-w, --width <pixels>` - Stage width (default: 1920)
- `-h, --height <pixels>` - Stage height (default: 1080)
- `-s, --stage <selector>` - CSS selector for stage (default: #stage)
- `--verbose` - Enable detailed logging

## Examples

### Batch processing multiple files
```bash
# Create output directory
mkdir -p videos

# Process multiple animations
npx faster-html2video animations/bounce.html videos/ -d 5 --fps 30
npx faster-html2video animations/particles.html videos/ -d 10 --fps 30
npx faster-html2video animations/logo.html videos/ -d 3 --fps 60

# Results in:
# videos/bounce.webm
# videos/particles.webm
# videos/logo.webm
```

### High quality capture
```bash
npx faster-html2video premium-animation.html output/ -d 10 --fps 60 --quality 18
```

### Performance optimized capture
```bash
npx faster-html2video complex-animation.html output/ -d 10 --fps 30 --quality 26
```

## Output Structure

When outputting to a directory, the tool creates:
- `filename.webm` - The video file
- `filename.metadata.json` - Capture statistics and settings