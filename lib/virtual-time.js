/**
 * Virtual time control using timeweb
 */

const fs = require('fs');
const path = require('path');

// Load timeweb library
const timewebLib = fs.readFileSync(
  path.join(require.resolve('timeweb/dist/timeweb.js')),
  { encoding: 'utf8' }
);

const overwriteTime = async function(page) {
  // Inject timeweb before any page scripts run
  await page.evaluateOnNewDocument(timewebLib);
  
  // Initialize at time 0
  await page.evaluateOnNewDocument(() => {
    // Ensure timeweb starts at 0
    window.addEventListener('DOMContentLoaded', () => {
      if (window.timeweb) {
        window.timeweb.goTo(0);
      }
    });
  });
};

const goToTimeAndAnimateForCapture = async function(page, time) {
  // Go to specific time and process all animations
  await page.evaluate((ms) => {
    if (window.timeweb) {
      window.timeweb.goTo(ms);
    }
  }, time);
};

module.exports = {
  overwriteTime,
  goToTimeAndAnimateForCapture
};