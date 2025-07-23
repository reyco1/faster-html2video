const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Send webhook notification
 * @param {string} webhookUrl - The webhook URL to send to
 * @param {object} payload - The payload to send
 * @returns {Promise<void>}
 */
async function sendWebhook(webhookUrl, payload) {
  if (!webhookUrl) return;
  
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(webhookUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const postData = JSON.stringify(payload);
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'fast-html2video-webhook/1.0'
        },
        timeout: 10000 // 10 second timeout
      };
      
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            console.warn(`Webhook failed: ${res.statusCode} ${res.statusMessage}`);
            resolve(); // Don't fail the job if webhook fails
          }
        });
      });
      
      req.on('error', (error) => {
        console.warn(`Webhook error: ${error.message}`);
        resolve(); // Don't fail the job if webhook fails
      });
      
      req.on('timeout', () => {
        req.destroy();
        console.warn('Webhook timeout');
        resolve(); // Don't fail the job if webhook fails
      });
      
      req.write(postData);
      req.end();
      
    } catch (error) {
      console.warn(`Webhook error: ${error.message}`);
      resolve(); // Don't fail the job if webhook fails
    }
  });
}

/**
 * Create webhook payload for job events
 * @param {string} event - Event type (started, progress, completed, failed)
 * @param {string} jobId - Unique job identifier
 * @param {object} data - Event-specific data
 * @returns {object} Webhook payload
 */
function createWebhookPayload(event, jobId, data = {}) {
  return {
    event,
    jobId,
    timestamp: new Date().toISOString(),
    data: {
      ...data,
      version: '1.0'
    }
  };
}

/**
 * Webhook events for job lifecycle
 */
const WEBHOOK_EVENTS = {
  JOB_STARTED: 'job.started',
  JOB_PROGRESS: 'job.progress', 
  JOB_COMPLETED: 'job.completed',
  JOB_FAILED: 'job.failed',
  BATCH_STARTED: 'batch.started',
  BATCH_PROGRESS: 'batch.progress',
  BATCH_COMPLETED: 'batch.completed',
  BATCH_FAILED: 'batch.failed'
};

module.exports = {
  sendWebhook,
  createWebhookPayload,
  WEBHOOK_EVENTS
};