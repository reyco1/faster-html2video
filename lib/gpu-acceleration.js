/**
 * GPU Acceleration Detection and Configuration
 * Supports NVIDIA (NVENC), AMD (AMF), Intel (QSV), and Apple (VideoToolbox)
 */

const { spawn } = require('child_process');

/**
 * Hardware acceleration profiles for different GPU vendors
 */
const ACCELERATION_PROFILES = {
  // NVIDIA NVENC (fastest, best quality)
  nvenc: {
    name: 'NVIDIA NVENC',
    hwaccel: 'cuda',
    encoder: 'h264_nvenc',
    pixelFormat: 'yuv420p',
    preset: 'p4', // Medium preset for NVENC
    extraArgs: [
      '-gpu', '0',
      '-rc', 'vbr',
      '-cq', '23',
      '-b:v', '0',
      '-maxrate', '50M',
      '-bufsize', '100M'
    ]
  },
  
  // Apple VideoToolbox (Mac hardware acceleration)
  videotoolbox: {
    name: 'Apple VideoToolbox',
    hwaccel: 'videotoolbox',
    encoder: 'h264_videotoolbox',
    pixelFormat: 'yuv420p',
    preset: null,
    extraArgs: [
      '-b:v', '0',
      '-q:v', '23',
      '-realtime', '0'
    ]
  },
  
  // Intel Quick Sync Video
  qsv: {
    name: 'Intel Quick Sync',
    hwaccel: 'qsv',
    encoder: 'h264_qsv',
    pixelFormat: 'nv12',
    preset: 'medium',
    extraArgs: [
      '-global_quality', '23',
      '-look_ahead', '1'
    ]
  },
  
  // AMD AMF
  amf: {
    name: 'AMD AMF',
    hwaccel: 'd3d11va',
    encoder: 'h264_amf',
    pixelFormat: 'yuv420p',
    preset: 'balanced',
    extraArgs: [
      '-rc', 'cqp',
      '-qp_i', '23',
      '-qp_p', '23',
      '-qp_b', '25'
    ]
  },
  
  // CPU fallback
  cpu: {
    name: 'CPU (libx264)',
    hwaccel: null,
    encoder: 'libx264',
    pixelFormat: 'yuv420p',
    preset: 'medium',
    extraArgs: [
      '-crf', '23'
    ]
  }
};

/**
 * Detection order (fastest to slowest)
 */
const DETECTION_ORDER = ['nvenc', 'videotoolbox', 'qsv', 'amf', 'cpu'];

/**
 * Cache for detected capabilities
 */
let detectedCapabilities = null;

/**
 * Detect available hardware acceleration capabilities
 */
async function detectHardwareCapabilities() {
  if (detectedCapabilities) {
    return detectedCapabilities;
  }

  const capabilities = {
    available: [],
    recommended: null,
    ffmpegVersion: null
  };

  try {
    // Get FFmpeg version and capabilities
    const ffmpegInfo = await getFFmpegInfo();
    capabilities.ffmpegVersion = ffmpegInfo.version;

    // Test each acceleration method
    for (const method of DETECTION_ORDER) {
      if (method === 'cpu') {
        // CPU is always available
        capabilities.available.push(method);
        continue;
      }

      const profile = ACCELERATION_PROFILES[method];
      const isAvailable = await testHardwareEncoder(profile.encoder);
      
      if (isAvailable) {
        capabilities.available.push(method);
        
        // Set first working hardware encoder as recommended
        if (!capabilities.recommended) {
          capabilities.recommended = method;
        }
      }
    }

    // Default to CPU if no hardware acceleration found
    if (!capabilities.recommended) {
      capabilities.recommended = 'cpu';
    }

    detectedCapabilities = capabilities;
    return capabilities;

  } catch (error) {
    console.warn('Hardware detection failed, falling back to CPU:', error.message);
    return {
      available: ['cpu'],
      recommended: 'cpu',
      ffmpegVersion: 'unknown'
    };
  }
}

/**
 * Get FFmpeg version and basic info
 */
function getFFmpegInfo() {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-version']);
    let output = '';

    ffmpeg.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
        resolve({
          version: versionMatch ? versionMatch[1] : 'unknown',
          output
        });
      } else {
        reject(new Error('FFmpeg not found'));
      }
    });

    ffmpeg.on('error', reject);
  });
}

/**
 * Test if a specific hardware encoder is available
 */
function testHardwareEncoder(encoder) {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-encoders']);
    let output = '';

    ffmpeg.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffmpeg.on('close', () => {
      // Check if encoder is listed and enabled
      const encoderRegex = new RegExp(`V.*${encoder.replace('_', '.')}.*${encoder}`, 'i');
      resolve(encoderRegex.test(output));
    });

    ffmpeg.on('error', () => resolve(false));
  });
}

/**
 * Generate optimized FFmpeg arguments for HTML-to-video generation (WebM VP9)
 */
function getOptimizedGenerationArgs(outputPath, fps, width, height, pixelFormat = 'yuva420p', quality = 23, accelerationMethod = null) {
  const args = ['-y']; // Overwrite output files

  // Auto-detect best acceleration if not specified
  if (!accelerationMethod) {
    accelerationMethod = detectedCapabilities?.recommended || 'cpu';
  }

  // Input settings for image2pipe (from Puppeteer screenshots)
  args.push('-f', 'image2pipe');
  args.push('-framerate', fps.toString());
  args.push('-i', '-'); // Read from stdin

  // For WebM VP9 generation with transparency, GPU acceleration is limited
  // Most hardware encoders don't support VP9 with alpha channel
  // We'll use GPU-accelerated preprocessing when possible, but stick with VP9 for transparency
  
  if (accelerationMethod !== 'cpu' && accelerationMethod !== 'auto') {
    const profile = ACCELERATION_PROFILES[accelerationMethod];
    
    if (profile && profile.hwaccel) {
      // Use hardware acceleration for decoding/preprocessing only
      // Still use software VP9 encoding for transparency support
      args.push('-hwaccel', profile.hwaccel);
      
      // Optimize threading for GPU-assisted processing
      args.push('-threads', '0'); // Use all available CPU cores
    }
  }
  
  // CPU/Software encoding with VP9 (supports transparency)
  args.push('-c:v', 'libvpx-vp9');
  args.push('-pix_fmt', pixelFormat); // yuva420p for transparency
  args.push('-crf', quality.toString());
  args.push('-b:v', '0'); // Use CRF mode
  args.push('-threads', '0'); // Use all available CPU cores
  
  // VP9 specific optimizations
  args.push('-deadline', 'good'); // Balance speed vs quality
  args.push('-cpu-used', '2'); // Faster encoding preset
  
  args.push(outputPath);

  // Determine the profile name based on acceleration method
  const profileName = accelerationMethod !== 'cpu' && accelerationMethod !== 'auto' 
    ? `GPU-Accelerated VP9 (${ACCELERATION_PROFILES[accelerationMethod]?.name || 'Hardware'} preprocessing)`
    : 'CPU VP9 (with transparency)';

  return {
    args,
    profile: profileName,
    method: accelerationMethod || 'cpu',
    requiresConversion: false
  };
}

/**
 * Generate optimized FFmpeg arguments for conversion
 */
function getOptimizedFFmpegArgs(inputPath, outputPath, format = 'mp4', accelerationMethod = null) {
  const args = ['-y']; // Overwrite output files

  // Auto-detect best acceleration if not specified
  if (!accelerationMethod) {
    accelerationMethod = detectedCapabilities?.recommended || 'cpu';
  }

  const profile = ACCELERATION_PROFILES[accelerationMethod];
  if (!profile) {
    throw new Error(`Unknown acceleration method: ${accelerationMethod}`);
  }

  // Input settings
  if (profile.hwaccel) {
    args.push('-hwaccel', profile.hwaccel);
    
    // Special handling for different hardware acceleration
    if (accelerationMethod === 'nvenc') {
      args.push('-hwaccel_output_format', 'cuda');
    } else if (accelerationMethod === 'qsv') {
      args.push('-hwaccel_output_format', 'qsv');
    }
  }

  args.push('-i', inputPath);

  // Video encoding settings
  args.push('-c:v', profile.encoder);
  
  if (profile.preset) {
    args.push('-preset', profile.preset);
  }

  args.push('-pix_fmt', profile.pixelFormat);

  // Add profile-specific arguments
  args.push(...profile.extraArgs);

  // Format-specific optimizations
  if (format === 'mp4') {
    args.push('-movflags', '+faststart'); // Enable streaming
  } else if (format === 'mov') {
    args.push('-f', 'mov');
  }

  // Threading for CPU encoding
  if (accelerationMethod === 'cpu') {
    args.push('-threads', '0'); // Use all available cores
  }

  args.push(outputPath);

  return {
    args,
    profile: profile.name,
    method: accelerationMethod
  };
}

/**
 * Get performance estimate for different acceleration methods
 */
function getPerformanceEstimate(method, inputDuration, resolution) {
  const baseTime = inputDuration; // seconds
  const pixelCount = resolution.width * resolution.height;
  const complexityFactor = Math.max(1, pixelCount / (1920 * 1080)); // Relative to 1080p

  const speedMultipliers = {
    nvenc: 0.1,      // 10x faster than CPU
    videotoolbox: 0.15, // 6-7x faster than CPU
    qsv: 0.2,        // 5x faster than CPU
    amf: 0.25,       // 4x faster than CPU
    cpu: 1.0         // Baseline
  };

  const multiplier = speedMultipliers[method] || 1.0;
  return Math.ceil(baseTime * complexityFactor * multiplier);
}

/**
 * Initialize hardware detection (call this at server startup)
 */
async function initializeHardwareDetection() {
  console.log('🔍 Detecting hardware acceleration capabilities...');
  
  try {
    const capabilities = await detectHardwareCapabilities();
    
    console.log(`✅ Hardware detection complete:`);
    console.log(`   • Available: ${capabilities.available.join(', ')}`);
    console.log(`   • Recommended: ${capabilities.recommended} (${ACCELERATION_PROFILES[capabilities.recommended].name})`);
    console.log(`   • FFmpeg version: ${capabilities.ffmpegVersion}`);
    
    return capabilities;
  } catch (error) {
    console.warn('⚠️ Hardware detection failed:', error.message);
    return { available: ['cpu'], recommended: 'cpu' };
  }
}

module.exports = {
  detectHardwareCapabilities,
  getOptimizedFFmpegArgs,
  getOptimizedGenerationArgs,
  getPerformanceEstimate,
  initializeHardwareDetection,
  ACCELERATION_PROFILES,
  DETECTION_ORDER
};