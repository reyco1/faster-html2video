# SaaS Conversion Guide for faster-html2video

This guide outlines the step-by-step process to convert faster-html2video from a CLI tool into a full-featured SaaS platform.

## Overview

Converting faster-html2video to SaaS requires building a web interface, API server, job queue system, and cloud infrastructure while keeping the core video processing engine server-side.

## Architecture Design

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web Client    │────▶│   API Server    │────▶│  Worker Nodes   │
│  (React/Vue)    │     │  (Express/NestJS)│     │ (Docker + Node) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                        │
        │                       ▼                        ▼
        │               ┌─────────────────┐     ┌─────────────────┐
        │               │    PostgreSQL   │     │   Redis Queue   │
        │               │  (User & Jobs)  │     │   (Bull/BullMQ) │
        │               └─────────────────┘     └─────────────────┘
        │                       │                        │
        └───────────────────────┴────────────────────────┘
                                │
                        ┌───────▼─────────┐
                        │   AWS S3/CDN    │
                        │ (Video Storage) │
                        └─────────────────┘
```

## Phase 1: Core API Development (2-3 weeks)

### 1.1 Set Up API Server
```bash
mkdir html2video-api
cd html2video-api
npm init -y
npm install express typescript @types/express
npm install jsonwebtoken bcrypt postgresql prisma
npm install multer aws-sdk bull
```

### 1.2 Database Schema
```prisma
// schema.prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  plan      Plan     @default(FREE)
  apiKey    String   @unique
  jobs      Job[]
  createdAt DateTime @default(now())
}

model Job {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  status    JobStatus
  config    Json
  inputUrl  String
  outputUrl String?
  error     String?
  startedAt DateTime?
  endedAt   DateTime?
  createdAt DateTime @default(now())
}

enum Plan {
  FREE
  PRO
  ENTERPRISE
}

enum JobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

### 1.3 API Endpoints
```typescript
// Core endpoints to implement
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/profile

POST   /api/jobs                 // Create new job
GET    /api/jobs                 // List user's jobs
GET    /api/jobs/:id             // Get job status
DELETE /api/jobs/:id             // Cancel job
GET    /api/jobs/:id/download    // Download video

POST   /api/webhooks/register    // Register webhook
GET    /api/usage                // Get usage stats
```

## Phase 2: Job Queue System (1-2 weeks)

### 2.1 Queue Setup
```typescript
// queue/videoQueue.ts
import Bull from 'bull';
import { VideoConfig } from '../types';

export const videoQueue = new Bull('video-processing', {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
});

// Add job to queue
export async function addVideoJob(userId: string, config: VideoConfig) {
  const job = await videoQueue.add('process-video', {
    userId,
    config,
  }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  });
  
  return job.id;
}
```

### 2.2 Worker Implementation
```typescript
// workers/videoWorker.ts
import { Job } from 'bull';
import { FasterHtml2Video } from '../lib/faster-html2video';
import { uploadToS3 } from '../lib/storage';

export async function processVideoJob(job: Job) {
  const { userId, config } = job.data;
  
  // Update job progress
  job.progress(10);
  
  // Initialize converter
  const converter = new FasterHtml2Video();
  
  // Generate video
  const localPath = await converter.capture(config);
  job.progress(80);
  
  // Upload to S3
  const s3Url = await uploadToS3(localPath, userId);
  job.progress(100);
  
  return { videoUrl: s3Url };
}
```

## Phase 3: Docker Containerization (1 week)

### 3.1 Worker Dockerfile
```dockerfile
FROM node:20-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ffmpeg \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

CMD ["node", "dist/worker.js"]
```

### 3.2 Docker Compose for Development
```yaml
version: '3.8'
services:
  api:
    build: ./api
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/db
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  worker:
    build: ./worker
    environment:
      - REDIS_URL=redis://redis:6379
      - S3_BUCKET=html2video-outputs
    depends_on:
      - redis
    deploy:
      replicas: 3

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    
volumes:
  postgres_data:
```

## Phase 4: Web Interface (2-3 weeks)

### 4.1 Frontend Setup
```bash
npx create-react-app html2video-web --template typescript
cd html2video-web
npm install axios react-query tailwindcss
npm install socket.io-client recharts
```

### 4.2 Core Components
```typescript
// components/VideoConverter.tsx
- Upload form / URL input
- Configuration settings (duration, fps, size)
- Real-time progress display
- Preview player

// components/JobHistory.tsx  
- List of previous jobs
- Status indicators
- Download/delete actions
- Usage statistics

// components/PricingPlans.tsx
- Plan comparison
- Upgrade/downgrade flow
- Usage limits display
```

### 4.3 Real-time Updates
```typescript
// hooks/useJobProgress.ts
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export function useJobProgress(jobId: string) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('pending');
  
  useEffect(() => {
    const socket = io(process.env.REACT_APP_WS_URL);
    
    socket.emit('subscribe', jobId);
    
    socket.on('progress', (data) => {
      setProgress(data.progress);
      setStatus(data.status);
    });
    
    return () => socket.disconnect();
  }, [jobId]);
  
  return { progress, status };
}
```

## Phase 5: Cloud Infrastructure (1-2 weeks)

### 5.1 AWS Setup
```bash
# S3 Bucket for video storage
aws s3 mb s3://html2video-outputs
aws s3 mb s3://html2video-inputs

# CloudFront for CDN
aws cloudfront create-distribution \
  --origin-domain-name html2video-outputs.s3.amazonaws.com

# ECS for container orchestration
aws ecs create-cluster --cluster-name html2video-cluster
```

### 5.2 Kubernetes Alternative
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: video-worker
spec:
  replicas: 5
  selector:
    matchLabels:
      app: video-worker
  template:
    metadata:
      labels:
        app: video-worker
    spec:
      containers:
      - name: worker
        image: html2video/worker:latest
        resources:
          requests:
            memory: "2Gi"
            cpu: "1"
          limits:
            memory: "4Gi"
            cpu: "2"
```

## Phase 6: Monitoring & Scaling (1 week)

### 6.1 Metrics Collection
```typescript
// monitoring/metrics.ts
import { Counter, Histogram, register } from 'prom-client';

export const jobsTotal = new Counter({
  name: 'html2video_jobs_total',
  help: 'Total number of jobs processed',
  labelNames: ['status'],
});

export const jobDuration = new Histogram({
  name: 'html2video_job_duration_seconds',
  help: 'Job processing duration',
  buckets: [10, 30, 60, 120, 300, 600],
});
```

### 6.2 Auto-scaling Configuration
```yaml
# HPA for Kubernetes
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: video-worker
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## Phase 7: Security & Authentication (1 week)

### 7.1 API Security
```typescript
// middleware/auth.ts
- JWT token validation
- Rate limiting per user/plan
- API key authentication
- CORS configuration

// middleware/security.ts
- Input validation
- URL whitelisting
- File size limits
- Sanitize HTML inputs
```

### 7.2 Infrastructure Security
```bash
# Network isolation
- VPC for internal services
- Security groups for ports
- WAF for API protection
- SSL/TLS everywhere
```

## Phase 8: Billing Integration (1 week)

### 8.1 Stripe Integration
```typescript
// billing/stripe.ts
- Plan subscription management
- Usage-based billing
- Invoice generation
- Payment method handling
```

### 8.2 Usage Tracking
```typescript
// Track video minutes processed
// Track storage used
// Track API calls
// Enforce plan limits
```

## Launch Checklist

### Pre-launch
- [ ] Load testing with k6/Artillery
- [ ] Security audit
- [ ] Documentation site
- [ ] API documentation (OpenAPI)
- [ ] Terms of Service / Privacy Policy
- [ ] Support system setup

### Infrastructure
- [ ] Domain and SSL setup
- [ ] CDN configuration
- [ ] Backup procedures
- [ ] Monitoring alerts
- [ ] Error tracking (Sentry)

### Business
- [ ] Pricing model finalized
- [ ] Payment processing tested
- [ ] Email notifications working
- [ ] Analytics tracking
- [ ] Customer support flow

## Estimated Timeline

- **Phase 1-2**: 3-4 weeks (Core functionality)
- **Phase 3-4**: 3-4 weeks (UI and containerization)
- **Phase 5-6**: 2-3 weeks (Cloud and monitoring)
- **Phase 7-8**: 2 weeks (Security and billing)
- **Testing & Launch**: 2 weeks

**Total**: 12-15 weeks for MVP

## Cost Estimates (Monthly)

### Small Scale (100 users)
- API Server: $50 (single instance)
- Workers: $200 (3-5 instances)
- Database: $25
- Redis: $25
- S3/CDN: $50
- **Total**: ~$350/month

### Medium Scale (1000 users)
- API Servers: $200 (load balanced)
- Workers: $1000 (auto-scaling fleet)
- Database: $100 (RDS)
- Redis: $100 (ElastiCache)
- S3/CDN: $500
- **Total**: ~$1900/month

### Large Scale (10k+ users)
- Kubernetes cluster: $2000+
- Worker fleet: $5000+
- Managed services: $1000+
- Storage/CDN: $2000+
- **Total**: $10k+/month

## Next Steps

1. **Validate Market**: Research competitors and pricing
2. **MVP Scope**: Define minimum features for launch
3. **Tech Stack**: Finalize framework choices
4. **Team**: Determine if you need additional developers
5. **Funding**: Calculate runway needed for development

This guide provides a roadmap, but adjust based on your specific requirements and resources.