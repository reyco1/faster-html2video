#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Directories to scan for videos
const directories = [
  'outputs',
  'output',
  '.'
];

const registry = {
  videos: [],
  lastUpdated: new Date().toISOString()
};

// Scan directories for .webm files
for (const dir of directories) {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      if (file.endsWith('.webm')) {
        const filePath = path.join(dir, file);
        const metadataPath = filePath.replace('.webm', '.metadata.json');
        
        const stats = fs.statSync(filePath);
        const video = {
          path: filePath,
          metadataPath: metadataPath,
          filename: file,
          directory: dir === '.' ? 'root' : dir,
          generatedAt: stats.mtime.toISOString(),
          fileSize: (stats.size / (1024 * 1024)).toFixed(2) + ' MB'
        };
        
        // Try to read metadata
        if (fs.existsSync(metadataPath)) {
          try {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            video.resolution = `${metadata.width}x${metadata.height}`;
            video.duration = metadata.duration + 's';
            video.fps = metadata.fps + ' fps';
          } catch (e) {
            // Metadata parse error
          }
        }
        
        registry.videos.push(video);
      }
    }
  }
}

// Sort by most recent first
registry.videos.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));

// Write registry
fs.writeFileSync('video-registry.json', JSON.stringify(registry, null, 2));
console.log(`Updated video registry with ${registry.videos.length} videos`);