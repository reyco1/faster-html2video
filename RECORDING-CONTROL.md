# Recording Control Feature

The recording control feature allows HTML pages to communicate with the recording process to start, stop, pause, and resume recording dynamically.

## Overview

When enabled, this feature exposes a JavaScript API that HTML pages can use to control the recording process. This is useful for:
- Recording only specific parts of an animation
- Starting recording after page setup
- Stopping recording when animation completes
- Creating interactive recording sessions

## Usage

### Command Line Options

```bash
# Enable recording control
npx faster-html2video input.html output.webm -d 30 --enable-recording-control

# Wait for explicit start signal from page
npx faster-html2video input.html output.webm -d 30 --enable-recording-control --wait-for-start-signal

# Set maximum recording duration (safety limit)
npx faster-html2video input.html output.webm -d 30 --enable-recording-control --max-recording-duration 120
```

**Important**: The `-d` duration parameter is always respected as the maximum recording time, even with recording control enabled. The recording will stop when either:
- The HTML page sends a 'stop' signal
- The duration specified by `-d` is reached
- The `--max-recording-duration` safety limit is reached (if specified)

### JavaScript API

When recording control is enabled, the following function is exposed to the page:

```javascript
// Start recording
const response = await window.__recordingControl('start');
// Returns: { status: 'started', timestamp: 1234567890 }

// Stop recording
const response = await window.__recordingControl('stop');
// Returns: { status: 'stopped', timestamp: 1234567890 }

// Pause recording
const response = await window.__recordingControl('pause');
// Returns: { status: 'paused', timestamp: 1234567890 }

// Resume recording
const response = await window.__recordingControl('resume');
// Returns: { status: 'resumed', timestamp: 1234567890 }

// Get current status
const response = await window.__recordingControl('status');
// Returns: { state: 'RECORDING', timestamp: 1234567890, framesCaptured: 150 }
```

### Console-based Control

As an alternative, you can use console messages (useful for quick testing):

```javascript
console.log('RECORDING:START');  // Start recording
console.log('RECORDING:STOP');   // Stop recording
console.log('RECORDING:PAUSE');  // Pause recording
console.log('RECORDING:RESUME'); // Resume recording
```

## Example HTML

```html
<!DOCTYPE html>
<html>
<head>
    <title>Recording Control Example</title>
    <style>
        body { background: transparent; }
        #stage { width: 1920px; height: 1080px; }
    </style>
</head>
<body>
    <div id="stage">
        <button onclick="startRecording()">Start</button>
        <button onclick="stopRecording()">Stop</button>
        <div id="animation">Animation content here</div>
    </div>
    
    <script>
        async function startRecording() {
            if (window.__recordingControl) {
                const result = await window.__recordingControl('start');
                console.log('Recording started:', result);
                
                // Start your animation
                startAnimation();
            }
        }
        
        async function stopRecording() {
            if (window.__recordingControl) {
                const result = await window.__recordingControl('stop');
                console.log('Recording stopped:', result);
            }
        }
        
        function startAnimation() {
            // Your animation code here
            // Animation will be recorded
            
            // Auto-stop after animation completes
            setTimeout(() => {
                stopRecording();
            }, 10000); // 10 seconds
        }
    </script>
</body>
</html>
```

## Recording States

The recording can be in one of these states:
- `NOT_STARTED` - Initial state when waiting for start signal
- `RECORDING` - Actively capturing frames
- `PAUSED` - Temporarily stopped (can be resumed)
- `STOPPED` - Recording complete (cannot be resumed)

## Best Practices

1. **Always check if recording control is available**:
   ```javascript
   if (typeof window.__recordingControl !== 'undefined') {
       // Recording control is available
   }
   ```

2. **Handle errors gracefully**:
   ```javascript
   try {
       const result = await window.__recordingControl('start');
   } catch (error) {
       console.error('Recording control error:', error);
   }
   ```

3. **Set reasonable maximum durations** to prevent runaway recordings:
   ```bash
   --max-recording-duration 300  # 5 minutes max
   ```

4. **Use visual indicators** to show recording state to users

5. **Auto-stop recordings** after animations complete to ensure clean endings

## Complete Example

See `examples/recording-control.html` for a complete working example with UI controls and animations.

To run the example:
```bash
npx faster-html2video examples/recording-control.html output.webm \
  --enable-recording-control \
  --wait-for-start-signal \
  --max-recording-duration 60 \
  -f 30
```

## Backward Compatibility

This feature is completely optional and backward compatible. Existing HTML files will continue to work exactly as before without any modifications. The recording control features are only active when explicitly enabled via command line options.