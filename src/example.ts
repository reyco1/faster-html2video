import { captureHTML2Video, createConfig, FasterHTML2Video, VideoConfig } from './faster-html2video';
import { promises as fs } from 'fs';
import * as path from 'path';

async function createTestHTML() {
  console.log('📝 Creating test HTML file...');
  
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>faster-html2video Test</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
    <style>
        body { margin: 0; padding: 0; width: 1920px; height: 1080px; background: transparent; }
        #stage { position: absolute; top: 0; left: 0; width: 1920px; height: 1080px; background: transparent; }
        .circle { position: absolute; width: 120px; height: 120px; background: radial-gradient(circle, #ff6b6b, #ee5a24); 
                  border-radius: 50%; top: 50%; left: 0; transform: translateY(-50%); }
        .text { position: absolute; top: 100px; left: 100px; color: #333; font-size: 48px; font-weight: bold; 
                background: rgba(255,255,255,0.9); padding: 20px; border-radius: 10px; }
    </style>
</head>
<body>
    <div id="stage">
        <div class="circle" id="circle"></div>
        <div class="text" id="text">faster-html2video Demo</div>
    </div>
    <script>
        const tl = gsap.timeline();
        tl.to("#circle", { x: 1800, duration: 30, ease: "power2.inOut" });
        tl.to("#text", { rotation: 360, scale: 1.2, duration: 30, ease: "sine.inOut" }, 0);
        
        window.seekToTime = function(time) { 
            return new Promise(resolve => {
                tl.progress(time / 30);
                requestAnimationFrame(resolve);
            });
        };
        window.getAnimationState = function() { 
            return { progress: tl.progress(), time: tl.time() }; 
        };
        console.log('Test animation ready');
    </script>
</body>
</html>`;

  await fs.writeFile('./test-animation.html', htmlContent);
  console.log('✅ Test HTML file created: ./test-animation.html\n');
}

async function basicExample() {
  console.log('🎬 Example: Basic transparent WebM capture');
  
  const absolutePath = path.resolve('./test-animation-highenergy.html');
  const config = createConfig(
    `file://${absolutePath}`,
    'output.webm',
    10 // 10 seconds for quick test
  );
  
  // Apply performance optimizations
  config.fps = 30; // Reduce to 30fps (50% fewer frames)
  // Note: VP8 doesn't support transparency well, so we stick with VP9
  config.quality = 26; // Slightly lower quality for speed

  const stats = await captureHTML2Video(config);
  
  console.log(`✅ Basic capture complete: ${stats.fileSizeMB.toFixed(1)}MB in ${stats.processingTimeSeconds.toFixed(1)}s`);
  console.log(`   Speedup from optimizations: ${(stats.totalFrames / stats.capturedFrames).toFixed(1)}x\n`);
}

async function runExample() {
  console.log('🚀 faster-html2video Example\n');
  
  try {
    await createTestHTML();
    await basicExample();
    
    console.log('🎉 Example completed successfully!');
    console.log('✅ Check output.webm for your transparent video');
    
    // Output clickable links for terminal
    console.log('\n📺 View your video:');
    console.log(`   file://${path.resolve('./viewers/view-video-dynamic.html')}`);
    console.log('\n🎨 Test transparency:');
    console.log(`   file://${path.resolve('./viewers/view-transparent.html')}`);
    
  } catch (error) {
    console.error('❌ Example failed:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

if (require.main === module) {
  runExample().catch(console.error);
}