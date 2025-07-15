/**
 * Virtual Time Control for faster-html2video
 * Inspired by timeweb (https://github.com/tungs/timeweb)
 * 
 * This module provides functions to override JavaScript timing functions
 * to enable frame-perfect video capture of time-based animations.
 */

export const virtualTimeScript = `
(function() {
  // Store original timing functions
  const originalSetTimeout = window.setTimeout;
  const originalSetInterval = window.setInterval;
  const originalClearTimeout = window.clearTimeout;
  const originalClearInterval = window.clearInterval;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;
  const originalDateNow = Date.now;
  const originalDateGetTime = Date.prototype.getTime;
  const originalPerformanceNow = performance.now;

  // Virtual time state
  let virtualTime = 0;
  let timeouts = [];
  let intervals = [];
  let animationFrames = [];
  let nextId = 1;

  // Override Date.now
  Date.now = function() {
    return virtualTime;
  };

  // Override Date.prototype.getTime
  Date.prototype.getTime = function() {
    if (this._isVirtual) {
      return virtualTime;
    }
    return originalDateGetTime.call(this);
  };

  // Override performance.now
  performance.now = function() {
    return virtualTime;
  };

  // Override setTimeout
  window.setTimeout = function(callback, delay, ...args) {
    const id = nextId++;
    timeouts.push({
      id,
      callback,
      time: virtualTime + (delay || 0),
      args
    });
    return id;
  };

  // Override clearTimeout
  window.clearTimeout = function(id) {
    timeouts = timeouts.filter(t => t.id !== id);
  };

  // Override setInterval
  window.setInterval = function(callback, delay, ...args) {
    const id = nextId++;
    intervals.push({
      id,
      callback,
      delay: delay || 0,
      lastTime: virtualTime,
      args
    });
    return id;
  };

  // Override clearInterval
  window.clearInterval = function(id) {
    intervals = intervals.filter(i => i.id !== id);
  };

  // Override requestAnimationFrame
  window.requestAnimationFrame = function(callback) {
    const id = nextId++;
    animationFrames.push({
      id,
      callback,
      time: virtualTime + 16.67 // ~60fps
    });
    return id;
  };

  // Override cancelAnimationFrame
  window.cancelAnimationFrame = function(id) {
    animationFrames = animationFrames.filter(f => f.id !== id);
  };

  // Function to advance virtual time
  window.__advanceVirtualTime = function(ms) {
    virtualTime += ms;
    
    // Process timeouts
    const readyTimeouts = timeouts.filter(t => t.time <= virtualTime);
    timeouts = timeouts.filter(t => t.time > virtualTime);
    
    readyTimeouts.forEach(t => {
      try {
        t.callback(...t.args);
      } catch (e) {
        console.error('Error in timeout callback:', e);
      }
    });

    // Process intervals
    intervals.forEach(interval => {
      while (interval.lastTime + interval.delay <= virtualTime) {
        interval.lastTime += interval.delay;
        try {
          interval.callback(...interval.args);
        } catch (e) {
          console.error('Error in interval callback:', e);
        }
      }
    });

    // Process animation frames
    const readyFrames = animationFrames.filter(f => f.time <= virtualTime);
    animationFrames = animationFrames.filter(f => f.time > virtualTime);
    
    readyFrames.forEach(f => {
      try {
        f.callback(virtualTime);
      } catch (e) {
        console.error('Error in animation frame callback:', e);
      }
    });
  };

  // Function to set virtual time directly
  window.__setVirtualTime = function(ms) {
    virtualTime = ms;
  };

  // Function to get current virtual time
  window.__getVirtualTime = function() {
    return virtualTime;
  };

  // Override GSAP Timeline if it exists
  if (window.gsap && window.gsap.globalTimeline) {
    const timeline = window.gsap.globalTimeline;
    const originalUpdateRoot = timeline._updateRoot;
    
    timeline._updateRoot = function() {
      // Use virtual time for GSAP
      timeline._time = virtualTime / 1000; // GSAP uses seconds
      return originalUpdateRoot.call(timeline);
    };
  }

  console.log('Virtual time control initialized');
})();
`;

export interface VirtualTimeConfig {
  enabled: boolean;
  frameTime?: number; // Time to advance per frame in ms (default: 1000/fps)
}

export async function injectVirtualTime(page: any): Promise<void> {
  await page.evaluateOnNewDocument(virtualTimeScript);
}

export async function advanceTime(page: any, ms: number): Promise<void> {
  await page.evaluate((timeMs: number) => {
    if (window.__advanceVirtualTime) {
      window.__advanceVirtualTime(timeMs);
    }
  }, ms);
}

export async function setTime(page: any, ms: number): Promise<void> {
  await page.evaluate((timeMs: number) => {
    if (window.__setVirtualTime) {
      window.__setVirtualTime(timeMs);
    }
  }, ms);
}

export async function getVirtualTime(page: any): Promise<number> {
  return await page.evaluate(() => {
    if (window.__getVirtualTime) {
      return window.__getVirtualTime();
    }
    return Date.now();
  });
}