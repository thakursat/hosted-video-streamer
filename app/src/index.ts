import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { loadConfig, loadSecrets, APP_DIR } from './config.js';
import { rescan, buildMeta } from './services/library.js';
import { ytDlpBin } from './services/ytdlp.js';
import { execFile } from 'child_process';
import authRouter from './routes/auth.js';
import videosRouter from './routes/videos.js';
import downloadsRouter from './routes/downloads.js';
import batchRouter from './routes/batch.js';
import settingsRouter from './routes/settings.js';
import uploadRouter from './routes/upload.js';
import { errorHandler } from './middleware/error.js';

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

const config = loadConfig();
const secrets = loadSecrets();

const app = express();

// Security headers (relax CSP for inline scripts/styles in SPA)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', '*'],
      mediaSrc: ["'self'", 'blob:'],
      connectSrc: ["'self'"],
    },
  },
}));

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: secrets.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// API routes
app.use('/api', authRouter);
app.use('/api', videosRouter);
app.use('/api', downloadsRouter);
app.use('/api', batchRouter);
app.use('/api', settingsRouter);
app.use('/api', uploadRouter);

// Stream and thumb routes (kept at root for simplicity)
app.use('/stream', (req, res, next) => {
  // Forward to videos router which handles /stream/:id
  req.url = '/stream' + req.url;
  next();
});

// Serve React SPA from client/dist in production
const clientDist = path.join(APP_DIR, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  // Dev: React runs on its own Vite port (5173), this is just the API
  app.get('/', (_req, res) => res.json({ status: 'StreamVault API running. Start the client with: cd client && npm run dev' }));
}

app.use(errorHandler);

const PORT = Number(process.env.PORT || config.port || 8080);
app.listen(PORT, () => {
  console.log(`StreamVault running on http://0.0.0.0:${PORT}`);
  console.log(`Media dir: ${config.mediaDir}`);
  rescan();
  buildMeta().catch(() => {});
  scheduleYtDlpUpdate();
});

function scheduleYtDlpUpdate(): void {
  const run = () => {
    execFile(ytDlpBin(), ['-U'], { timeout: 120000 }, (err, stdout) => {
      const line = (stdout || '').trim().split('\n').filter(Boolean).pop();
      if (!err && line) console.log(`yt-dlp: ${line}`);
      if (err) {
        // Download local binary as fallback
        const { YT_DLP_LOCAL } = require('./config.js');
        const tmp = YT_DLP_LOCAL + '.tmp';
        execFile('curl', ['-fsSL',
          'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp',
          '-o', tmp], { timeout: 120000 }, (e2) => {
          if (e2) { console.warn('yt-dlp download failed:', e2.message.split('\n')[0]); return; }
          try {
            const fs2 = require('fs');
            fs2.renameSync(tmp, YT_DLP_LOCAL);
            fs2.chmodSync(YT_DLP_LOCAL, 0o755);
          } catch (e3) {
            try { require('fs').rmSync(tmp, { force: true }); } catch {}
          }
        });
      }
    });
  };
  run();
  setInterval(run, 12 * 60 * 60 * 1000);
}
