#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const capture = require('./index');
const { 
  detectHardwareCapabilities, 
  getOptimizedFFmpegArgs, 
  getPerformanceEstimate,
  initializeHardwareDetection 
} = require('./lib/gpu-acceleration');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads', { recursive: true });
    }
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/html' || file.originalname.endsWith('.html')) {
      cb(null, true);
    } else {
      cb(new Error('Only HTML files are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Store active generation jobs
const activeJobs = new Map();

/**
 * Generate unique job ID
 */
function generateJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Update video registry with new video
 */
function updateVideoRegistry(videoPath, metadataPath) {
  try {
    const registryPath = './video-registry.json';
    let registry = { videos: [], lastUpdated: new Date().toISOString() };
    
    if (fs.existsSync(registryPath)) {
      registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    }
    
    // Read metadata to get video info
    let metadata = {};
    if (fs.existsSync(metadataPath)) {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    }
    
    const videoInfo = {
      path: videoPath,
      metadataPath: metadataPath,
      filename: path.basename(videoPath),
      directory: path.dirname(videoPath),
      generatedAt: new Date().toISOString(),
      fileSize: metadata.fileSize ? `${metadata.fileSize.toFixed(2)} MB` : 'Unknown',
      resolution: metadata.width && metadata.height ? `${metadata.width}x${metadata.height}` : 'Unknown',
      duration: metadata.duration ? `${metadata.duration}s` : 'Unknown',
      fps: metadata.fps ? `${metadata.fps} fps` : 'Unknown'
    };
    
    // Remove any existing entry with the same path
    registry.videos = registry.videos.filter(v => v.path !== videoPath);
    
    // Add new entry at the beginning
    registry.videos.unshift(videoInfo);
    
    // Keep only the latest 50 videos
    registry.videos = registry.videos.slice(0, 50);
    
    registry.lastUpdated = new Date().toISOString();
    
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    
  } catch (error) {
    console.error('Failed to update video registry:', error);
  }
}

// API Routes

/**
 * Get list of available HTML files
 */
app.get('/api/html-files', (req, res) => {
  try {
    const htmlFiles = [];
    
    // Check examples directory
    const examplesDir = './examples';
    if (fs.existsSync(examplesDir)) {
      const files = fs.readdirSync(examplesDir);
      files.forEach(file => {
        if (file.endsWith('.html')) {
          const filePath = path.join(examplesDir, file);
          const stats = fs.statSync(filePath);
          htmlFiles.push({
            name: file,
            path: filePath,
            directory: 'examples',
            size: stats.size,
            modified: stats.mtime
          });
        }
      });
    }
    
    // Check uploads directory
    const uploadsDir = './uploads';
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      files.forEach(file => {
        if (file.endsWith('.html')) {
          const filePath = path.join(uploadsDir, file);
          const stats = fs.statSync(filePath);
          htmlFiles.push({
            name: file,
            path: filePath,
            directory: 'uploads',
            size: stats.size,
            modified: stats.mtime
          });
        }
      });
    }
    
    res.json(htmlFiles);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list HTML files' });
  }
});

/**
 * Upload HTML file
 */
app.post('/api/upload', upload.single('htmlFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const originalName = req.file.originalname;
    const filePath = req.file.path;
    
    res.json({
      message: 'File uploaded successfully',
      filename: originalName,
      path: filePath
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

/**
 * Start video generation
 */
app.post('/api/generate', async (req, res) => {
  try {
    const {
      htmlFile,
      duration = 5,
      fps = 60,
      width = 1920,
      height = 1080,
      quality = 23,
      selector = 'body',
      enableRecordingControl = false,
      waitForStartSignal = false
    } = req.body;
    
    if (!htmlFile) {
      return res.status(400).json({ error: 'HTML file is required' });
    }
    
    const jobId = generateJobId();
    const outputDir = './output';
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const basename = path.basename(htmlFile, '.html');
    const outputPath = path.join(outputDir, `${basename}-${Date.now()}.webm`);
    
    // Create job object
    const job = {
      id: jobId,
      status: 'starting',
      progress: 0,
      startTime: Date.now(),
      settings: {
        htmlFile,
        duration,
        fps,
        width,
        height,
        quality,
        selector,
        enableRecordingControl,
        waitForStartSignal
      },
      outputPath,
      clients: new Set() // SSE clients for this job
    };
    
    activeJobs.set(jobId, job);
    
    // Start generation in background
    generateVideo(job);
    
    res.json({
      jobId,
      message: 'Video generation started',
      outputPath
    });
    
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({ error: 'Failed to start video generation' });
  }
});

/**
 * Get job progress via Server-Sent Events
 */
app.get('/api/progress/:jobId', (req, res) => {
  const jobId = req.params.jobId;
  const job = activeJobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });
  
  // Add client to job's client set
  job.clients.add(res);
  
  // Send initial status
  res.write(`data: ${JSON.stringify({
    jobId,
    status: job.status,
    progress: job.progress,
    message: job.message || 'Starting...'
  })}\n\n`);
  
  // Remove client when connection closes
  req.on('close', () => {
    job.clients.delete(res);
  });
});

/**
 * Get list of generated videos
 */
app.get('/api/videos', (req, res) => {
  try {
    const registryPath = './video-registry.json';
    if (fs.existsSync(registryPath)) {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      res.json(registry);
    } else {
      res.json({ videos: [], lastUpdated: new Date().toISOString() });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to load video registry' });
  }
});

/**
 * Get video metadata
 */
app.get('/api/metadata/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const metadataPath = `./output/${filename.replace('.webm', '.metadata.json')}`;
    
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      res.json(metadata);
    } else {
      res.status(404).json({ error: 'Metadata not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to load metadata' });
  }
});

/**
 * Get hardware acceleration capabilities
 */
app.get('/api/hardware-capabilities', async (req, res) => {
  try {
    const capabilities = await detectHardwareCapabilities();
    res.json(capabilities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to detect hardware capabilities' });
  }
});

/**
 * Convert video to different format
 */
app.post('/api/convert/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const { format, accelerationMethod } = req.body; // 'mp4' or 'mov', optional acceleration method
    
    if (!['mp4', 'mov'].includes(format)) {
      return res.status(400).json({ error: 'Unsupported format. Use mp4 or mov.' });
    }
    
    const inputPath = `./output/${filename}`;
    if (!fs.existsSync(inputPath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }
    
    const outputFilename = filename.replace('.webm', `.${format}`);
    const outputPath = `./output/${outputFilename}`;
    
    // Generate conversion job ID
    const jobId = generateJobId();
    
    // Create conversion job
    const job = {
      id: jobId,
      type: 'conversion',
      status: 'converting',
      progress: 0,
      inputPath,
      outputPath,
      outputFilename,
      format,
      accelerationMethod,
      startTime: Date.now(),
      clients: new Set()
    };
    
    activeJobs.set(jobId, job);
    
    // Start conversion in background
    convertVideo(job);
    
    res.json({
      jobId,
      message: `Starting conversion to ${format.toUpperCase()}`,
      outputFilename
    });
    
  } catch (error) {
    console.error('Conversion error:', error);
    res.status(500).json({ error: 'Failed to start conversion' });
  }
});

/**
 * Delete a video and its metadata
 */
app.delete('/api/video/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const videoPath = `./output/${filename}`;
    const metadataPath = `./output/${filename.replace('.webm', '.metadata.json')}`;
    
    // Delete files if they exist
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
    }
    
    // Update registry
    const registryPath = './video-registry.json';
    if (fs.existsSync(registryPath)) {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      registry.videos = registry.videos.filter(v => v.filename !== filename);
      registry.lastUpdated = new Date().toISOString();
      fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    }
    
    res.json({ message: 'Video deleted successfully' });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

/**
 * Background video conversion function
 */
async function convertVideo(job) {
  try {
    job.status = 'converting';
    
    // Get optimized FFmpeg arguments with GPU acceleration
    const { args: ffmpegArgs, profile, method } = getOptimizedFFmpegArgs(
      job.inputPath, 
      job.outputPath, 
      job.format,
      job.accelerationMethod // Allow manual override
    );
    
    job.accelerationUsed = method;
    job.accelerationProfile = profile;
    
    broadcastJobUpdate(job, `Converting to ${job.format.toUpperCase()} using ${profile}...`);
    
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    let conversionOutput = '';
    
    ffmpeg.stderr.on('data', (data) => {
      const output = data.toString();
      conversionOutput += output;
      
      // Parse FFmpeg progress from stderr
      const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseFloat(timeMatch[3]);
        const currentTime = hours * 3600 + minutes * 60 + seconds;
        
        // Estimate total duration from input (rough estimate)
        const durationMatch = conversionOutput.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
        if (durationMatch) {
          const totalHours = parseInt(durationMatch[1]);
          const totalMinutes = parseInt(durationMatch[2]);
          const totalSeconds = parseFloat(durationMatch[3]);
          const totalTime = totalHours * 3600 + totalMinutes * 60 + totalSeconds;
          
          if (totalTime > 0) {
            job.progress = Math.min(Math.round((currentTime / totalTime) * 100), 100);
            job.message = `Converting to ${job.format.toUpperCase()}... ${job.progress}%`;
            broadcastJobUpdate(job);
          }
        }
      }
    });
    
    ffmpeg.on('error', (err) => {
      throw new Error(`FFmpeg error: ${err.message}`);
    });
    
    const conversionPromise = new Promise((resolve, reject) => {
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
    });
    
    await conversionPromise;
    
    // Get output file size
    const stats = fs.statSync(job.outputPath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    job.status = 'completed';
    job.progress = 100;
    job.message = `Conversion to ${job.format.toUpperCase()} completed! (${fileSizeMB.toFixed(1)}MB)`;
    job.completedAt = Date.now();
    job.fileSize = fileSizeMB;
    
    broadcastJobUpdate(job);
    
    // Clean up job after 5 minutes
    setTimeout(() => {
      activeJobs.delete(job.id);
    }, 5 * 60 * 1000);
    
  } catch (error) {
    console.error('Video conversion failed:', error);
    job.status = 'failed';
    job.error = error.message;
    job.message = `Conversion failed: ${error.message}`;
    broadcastJobUpdate(job);
    
    // Clean up failed job after 1 minute
    setTimeout(() => {
      activeJobs.delete(job.id);
    }, 60 * 1000);
  }
}

/**
 * Background video generation function
 */
async function generateVideo(job) {
  try {
    job.status = 'generating';
    broadcastJobUpdate(job, 'Video generation started');
    
    const config = {
      url: job.settings.htmlFile,
      output: job.outputPath,
      duration: job.settings.duration,
      fps: job.settings.fps,
      width: job.settings.width,
      height: job.settings.height,
      quality: job.settings.quality,
      selector: job.settings.selector,
      enableRecordingControl: job.settings.enableRecordingControl,
      waitForStartSignal: job.settings.waitForStartSignal,
      generateMetadata: true,
      quiet: true,
      jobId: job.id,
      // Custom progress callback
      onProgress: (framesCaptured, totalFrames, captureRate, elapsed) => {
        if (job.settings.enableRecordingControl && !totalFrames) {
          // Recording control mode - show frames captured
          job.progress = framesCaptured;
          job.message = `Recording... ${framesCaptured} frames captured (${captureRate.toFixed(1)} fps)`;
        } else {
          // Fixed duration mode - show percentage
          job.progress = Math.round((framesCaptured / totalFrames) * 100);
          const remaining = (totalFrames - framesCaptured) / captureRate;
          job.message = `Capturing frames... ${framesCaptured}/${totalFrames} (${job.progress}% - ETA: ${remaining.toFixed(0)}s)`;
        }
        broadcastJobUpdate(job);
      }
    };
    
    // Use the existing capture function
    await capture(config);
    
    // Update registry with the new video
    const metadataPath = job.outputPath.replace('.webm', '.metadata.json');
    updateVideoRegistry(job.outputPath, metadataPath);
    
    job.status = 'completed';
    job.progress = 100;
    job.message = 'Video generation completed successfully';
    job.completedAt = Date.now();
    
    broadcastJobUpdate(job);
    
    // Clean up job after 5 minutes
    setTimeout(() => {
      activeJobs.delete(job.id);
    }, 5 * 60 * 1000);
    
  } catch (error) {
    console.error('Video generation failed:', error);
    job.status = 'failed';
    job.error = error.message;
    job.message = `Generation failed: ${error.message}`;
    broadcastJobUpdate(job);
    
    // Clean up failed job after 1 minute
    setTimeout(() => {
      activeJobs.delete(job.id);
    }, 60 * 1000);
  }
}

/**
 * Broadcast job update to all connected clients
 */
function broadcastJobUpdate(job, message = null) {
  if (message) {
    job.message = message;
  }
  
  const update = {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error,
    outputPath: job.outputPath
  };
  
  const data = `data: ${JSON.stringify(update)}\n\n`;
  
  job.clients.forEach(client => {
    try {
      client.write(data);
    } catch (err) {
      // Client disconnected, remove from set
      job.clients.delete(client);
    }
  });
}

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  res.status(500).json({ error: error.message });
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Fast HTML2Video Server running at http://localhost:${PORT}`);
  console.log(`📁 Serving files from: ${process.cwd()}`);
  
  // Initialize hardware detection
  await initializeHardwareDetection();
  
  console.log('📋 Available endpoints:');
  console.log('   • GET  /viewers/generate-video.html - Video generation interface');
  console.log('   • GET  /viewers/view-video.html - Video viewer interface');
  console.log('   • GET  /api/html-files - List available HTML files');
  console.log('   • GET  /api/hardware-capabilities - Hardware acceleration info');
  console.log('   • POST /api/upload - Upload HTML file');
  console.log('   • POST /api/generate - Start video generation');
  console.log('   • GET  /api/progress/:jobId - Real-time progress (SSE)');
  console.log('   • GET  /api/videos - List generated videos');
  console.log('   • POST /api/convert/:filename - Convert video with GPU acceleration');
});