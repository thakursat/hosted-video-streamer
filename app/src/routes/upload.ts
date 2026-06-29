import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../middleware/auth.js';
import { rescan, safePath, getMediaRoot, buildMeta } from '../services/library.js';
import { VIDEO_EXTENSIONS } from '../config.js';

const router = Router();

router.put('/upload', requireAuth, (req, res) => {
  const folder = String(req.query.folder || '').replace(/^[/\\]+/, '');
  const rawName = path.basename(String(req.query.filename || '').trim());
  if (!rawName || rawName.startsWith('.')) {
    res.status(400).json({ error: 'Invalid filename.' }); return;
  }
  const ext = path.extname(rawName).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext)) {
    res.status(400).json({ error: `Unsupported file type "${ext}".` }); return;
  }
  const destAbs = folder ? (safePath(folder) || getMediaRoot()) : getMediaRoot();
  try { fs.mkdirSync(destAbs, { recursive: true }); } catch {}
  const destFile = path.join(destAbs, rawName);
  if (fs.existsSync(destFile)) {
    res.status(409).json({ error: 'A file with that name already exists.' }); return;
  }
  const ws = fs.createWriteStream(destFile);
  req.pipe(ws);
  ws.on('finish', () => { rescan(); buildMeta().catch(() => {}); res.json({ ok: true }); });
  ws.on('error', (e) => {
    try { fs.rmSync(destFile, { force: true }); } catch {}
    res.status(500).json({ error: 'Write failed: ' + e.message });
  });
  req.on('error', () => { ws.destroy(); try { fs.rmSync(destFile, { force: true }); } catch {} });
});

export default router;
