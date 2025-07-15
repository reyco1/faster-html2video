/**
 * Complete Virtual Time Implementation
 * Based on timeweb's approach to override ALL timing functions
 */

export const virtualTimeCompleteScript = `
(function() {
  'use strict';
  
  // Virtual time state
  let virtualTime = 0;
  let startTime = 0;
  const startSystemTime = Date.now();
  
  // Store original functions
  const originalDate = Date;
  const originalDateNow = Date.now;
  const originalDateGetTime = Date.prototype.getTime;
  const originalDateValueOf = Date.prototype.valueOf;
  const originalPerformanceNow = performance.now;
  const originalSetTimeout = setTimeout;
  const originalSetInterval = setInterval;
  const originalClearTimeout = clearTimeout;
  const originalClearInterval = clearInterval;
  const originalRequestAnimationFrame = requestAnimationFrame;
  const originalCancelAnimationFrame = cancelAnimationFrame;
  
  // Event timing
  const originalGetCurrentTime = Event.prototype.timeStamp ? Object.getOwnPropertyDescriptor(Event.prototype, 'timeStamp').get : null;
  
  // Animation API
  const originalAnimate = Element.prototype.animate;
  const originalGetAnimations = document.getAnimations;
  const originalDocumentTimeline = document.timeline;
  
  // Media elements
  const originalVideoPlay = HTMLVideoElement.prototype.play;
  const originalVideoPause = HTMLVideoElement.prototype.pause;
  const originalAudioPlay = HTMLAudioElement.prototype.play;
  const originalAudioPause = HTMLAudioElement.prototype.pause;
  
  // Timers storage
  const timers = new Map();
  const intervals = new Map();
  const animationFrames = new Map();
  let nextTimerId = 1;
  
  // Override Date constructor
  window.Date = new Proxy(originalDate, {
    construct: function(target, args) {
      if (args.length === 0) {
        return new target(virtualTime + startSystemTime);
      }
      return new target(...args);
    },
    apply: function(target, thisArg, args) {
      return new target(virtualTime + startSystemTime).toString();
    }
  });
  
  // Copy Date static methods
  Object.setPrototypeOf(window.Date, originalDate);
  Object.getOwnPropertyNames(originalDate).forEach(prop => {
    if (prop !== 'prototype' && prop !== 'length' && prop !== 'name') {
      window.Date[prop] = originalDate[prop];
    }
  });
  
  // Override Date.now()
  Date.now = function() {
    return virtualTime + startSystemTime;
  };
  
  // Override Date.prototype methods
  Date.prototype.getTime = function() {
    if (this._isVirtualDate) {
      return virtualTime + startSystemTime;
    }
    return originalDateGetTime.call(this);
  };
  
  Date.prototype.valueOf = function() {
    if (this._isVirtualDate) {
      return virtualTime + startSystemTime;
    }
    return originalDateValueOf.call(this);
  };
  
  // Override performance.now()
  performance.now = function() {
    return virtualTime;
  };
  
  // Override setTimeout
  window.setTimeout = function(callback, delay = 0, ...args) {
    const id = nextTimerId++;
    const executeTime = virtualTime + delay;
    
    timers.set(id, {
      callback,
      executeTime,
      args,
      type: 'timeout'
    });
    
    return id;
  };
  
  // Override clearTimeout
  window.clearTimeout = function(id) {
    timers.delete(id);
  };
  
  // Override setInterval
  window.setInterval = function(callback, interval = 0, ...args) {
    const id = nextTimerId++;
    
    intervals.set(id, {
      callback,
      interval,
      lastExecuteTime: virtualTime,
      args,
      type: 'interval'
    });
    
    return id;
  };
  
  // Override clearInterval
  window.clearInterval = function(id) {
    intervals.delete(id);
  };
  
  // Override requestAnimationFrame
  window.requestAnimationFrame = function(callback) {
    const id = nextTimerId++;
    const executeTime = virtualTime + 16.666667; // ~60fps
    
    animationFrames.set(id, {
      callback,
      executeTime,
      type: 'raf'
    });
    
    return id;
  };
  
  // Override cancelAnimationFrame
  window.cancelAnimationFrame = function(id) {
    animationFrames.delete(id);
  };
  
  // Override Event.timeStamp
  if (originalGetCurrentTime) {
    Object.defineProperty(Event.prototype, 'timeStamp', {
      get: function() {
        if (this._virtualTimeStamp !== undefined) {
          return this._virtualTimeStamp;
        }
        return originalGetCurrentTime.call(this);
      }
    });
  }
  
  // Override Animation API
  if (originalAnimate) {
    Element.prototype.animate = function(keyframes, options) {
      const animation = originalAnimate.call(this, keyframes, options);
      if (animation && animation.timeline === document.timeline) {
        animation.startTime = virtualTime;
      }
      return animation;
    };
  }
  
  // Override document.timeline.currentTime
  if (originalDocumentTimeline) {
    Object.defineProperty(document.timeline, 'currentTime', {
      get: function() {
        return virtualTime;
      }
    });
  }
  
  // Pause media elements
  HTMLVideoElement.prototype.play = function() {
    console.log('Video play blocked in virtual time mode');
    return Promise.resolve();
  };
  
  HTMLAudioElement.prototype.play = function() {
    console.log('Audio play blocked in virtual time mode');
    return Promise.resolve();
  };
  
  // Process timers and animations
  function processTimers(targetTime) {
    const oldTime = virtualTime;
    virtualTime = targetTime;
    
    // Process timeouts
    const timeoutsToExecute = [];
    timers.forEach((timer, id) => {
      if (timer.executeTime <= virtualTime) {
        timeoutsToExecute.push({ id, timer });
      }
    });
    
    timeoutsToExecute.sort((a, b) => a.timer.executeTime - b.timer.executeTime);
    timeoutsToExecute.forEach(({ id, timer }) => {
      timers.delete(id);
      try {
        timer.callback(...timer.args);
      } catch (e) {
        console.error('Timer callback error:', e);
      }
    });
    
    // Process intervals
    intervals.forEach((interval, id) => {
      while (interval.lastExecuteTime + interval.interval <= virtualTime) {
        interval.lastExecuteTime += interval.interval;
        try {
          interval.callback(...interval.args);
        } catch (e) {
          console.error('Interval callback error:', e);
        }
      }
    });
    
    // Process animation frames
    const rafsToExecute = [];
    animationFrames.forEach((raf, id) => {
      if (raf.executeTime <= virtualTime) {
        rafsToExecute.push({ id, raf });
      }
    });
    
    rafsToExecute.sort((a, b) => a.raf.executeTime - b.raf.executeTime);
    rafsToExecute.forEach(({ id, raf }) => {
      animationFrames.delete(id);
      try {
        raf.callback(virtualTime);
      } catch (e) {
        console.error('RAF callback error:', e);
      }
    });
    
    // Dispatch time update event
    window.dispatchEvent(new CustomEvent('virtual-time-update', {
      detail: { oldTime, newTime: virtualTime }
    }));
  }
  
  // API functions
  window.__timeweb = {
    goTo: function(ms) {
      if (ms < virtualTime) {
        console.warn('Cannot go back in virtual time');
        return;
      }
      processTimers(ms);
    },
    
    pause: function() {
      // Already paused by default
    },
    
    play: function(speed = 1) {
      console.warn('Play not supported in capture mode');
    },
    
    getTime: function() {
      return virtualTime;
    },
    
    // Advanced API for faster-html2video
    setTime: function(ms) {
      virtualTime = ms;
      // Don't process timers when setting time directly
    },
    
    advanceTime: function(ms) {
      processTimers(virtualTime + ms);
    }
  };
  
  // Also expose as individual functions for compatibility
  window.__goToTime = window.__timeweb.goTo;
  window.__getVirtualTime = window.__timeweb.getTime;
  window.__setVirtualTime = window.__timeweb.setTime;
  window.__advanceVirtualTime = window.__timeweb.advanceTime;
  
  console.log('Virtual time (timeweb) initialized - all timing functions overridden');
})();
`;

export async function injectCompleteVirtualTime(page: any): Promise<void> {
  await page.evaluateOnNewDocument(virtualTimeCompleteScript);
}

export async function goToTime(page: any, ms: number): Promise<void> {
  await page.evaluate((timeMs: number) => {
    if (window.__timeweb) {
      window.__timeweb.goTo(timeMs);
    }
  }, ms);
}