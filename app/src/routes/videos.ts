import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  getLibrary, buildTree, findById, rescan, safePath, pruneEmptyDirs, getMediaRoot,
} from '../services/library.js';
import { generateThumb, generateSprite, thumbPath, spritePath, vttPath } from '../services/media.js';
import { MIME } from '../config.js';

const router = Router();

// Library listing
router.get('/videos', requireAuth, (req, res) => {
  const folder = String(req.query.folder || '').replace(/^[/\\]+/, '');
  const recursive = req.query.recursive === '1' || req.query.all === '1';
  const all = req.query.all === '1';

  let items = getLibrary();
  if (!all) {
    items = recursive
      ? items.filter(v => v.folder === folder || v.folder.startsWith(folder ? folder + '/' : ''))
      : items.filter(v => v.folder === folder);
  }
  res.json(items.map(v => ({
    id: v.id, name: v.name, ext: v.ext, folder: v.folder,
    size: v.size, addedAt: v.addedAt, duration: v.duration,
    width: v.width, height: v.height,
  })));
});

// Folder tree
router.get('/tree', requireAuth, (_req, res) => {
  res.json(buildTree());
});

// Video metadata (ffprobe)
router.get('/videos/:id/info', requireAuth, async (req, res) => {
  const video = findById(req.params.id);
  if (!video) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(video);
});

// Stream
router.get('/stream/:id', requireAuth, (req, res) => {
  const video = findById(req.params.id);
  if (!video) { res.status(404).json({ error: 'Not found' }); return; }

  const stat = fs.statSync(video.absPath);
  const total = stat.size;
  const mime = MIME[video.ext] || 'video/mp4';
  const range = req.headers.range;

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : total - 1;
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mime,
    });
    fs.createReadStream(video.absPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(video.absPath).pipe(res);
  }
});

// Thumbnail
router.get('/thumb/:id', requireAuth, async (req, res) => {
  const video = findById(req.params.id);
  if (!video) { res.status(404).json({ error: 'Not found' }); return; }
  try {
    const p = await generateThumb(video.id, video.absPath, video.duration || 60);
    res.sendFile(p);
  } catch {
    res.status(500).json({ error: 'Thumbnail generation failed' });
  }
});

// Sprite sheet + VTT
router.get('/videos/:id/sprite.jpg', requireAuth, async (req, res) => {
  const video = findById(req.params.id);
  if (!video) { res.status(404).json({ error: 'Not found' }); return; }
  try {
    const { sprite } = await generateSprite(video.id, video.absPath, video.duration || 60);
    res.sendFile(sprite);
  } catch { res.status(500).json({ error: 'Sprite generation failed' }); }
});

router.get('/videos/:id/thumbs.vtt', requireAuth, async (req, res) => {
  const video = findById(req.params.id);
  if (!video) { res.status(404).json({ error: 'Not found' }); return; }
  try {
    const { vtt } = await generateSprite(video.id, video.absPath, video.duration || 60);
    res.type('text/vtt').sendFile(vtt);
  } catch { res.status(500).json({ error: 'VTT generation failed' }); }
});

// Download original file to client
router.get('/videos/:id/download', requireAuth, (req, res) => {
  const video = findById(req.params.id);
  if (!video) { res.status(404).json({ error: 'Not found' }); return; }
  res.download(video.absPath, `${video.name}${video.ext}`);
});

// Rename
router.patch('/videos/:id', requireAuth, (req, res) => {
  const video = findById(req.params.id);
  if (!video) { res.status(404).json({ error: 'Not found' }); return; }
  const name = String(req.body?.name || '').trim();
  if (!name || /[/\\<>:"|?*]/.test(name)) {
    res.status(400).json({ error: 'Invalid name.' }); return;
  }
  const newAbs = path.join(path.dirname(video.absPath), name + video.ext);
  if (fs.existsSync(newAbs)) { res.status(409).json({ error: 'Name already exists.' }); return; }
  fs.renameSync(video.absPath, newAbs);
  rescan();
  res.json({ ok: true });
});

// Bulk delete
router.delete('/videos', requireAuth, (req, res) => {
  const ids = z.array(z.string()).safeParse(req.body?.ids);
  if (!ids.success) { res.status(400).json({ error: 'ids array required.' }); return; }
  for (const id of ids.data) {
    const v = findById(id);
    if (!v) continue;
    try {
      fs.rmSync(v.absPath, { force: true });
      pruneEmptyDirs(path.dirname(v.absPath));
    } catch {}
  }
  rescan();
  res.json({ ok: true });
});

// Bulk move
router.post('/videos/move', requireAuth, (req, res) => {
  const ids = z.array(z.string()).safeParse(req.body?.ids);
  const dest = String(req.body?.folder ?? '');
  if (!ids.success) { res.status(400).json({ error: 'ids array required.' }); return; }
  const destAbs = dest ? safePath(dest) : getMediaRoot();
  if (!destAbs) { res.status(400).json({ error: 'Invalid destination.' }); return; }
  fs.mkdirSync(destAbs, { recursive: true });
  for (const id of ids.data) {
    const v = findById(id);
    if (!v) continue;
    const target = path.join(destAbs, v.name + v.ext);
    try {
      fs.renameSync(v.absPath, target);
      pruneEmptyDirs(path.dirname(v.absPath));
    } catch {}
  }
  rescan();
  res.json({ ok: true });
});

// Create folder
router.post('/folders', requireAuth, (req, res) => {
  const name = String(req.body?.name || '').trim();
  const parent = String(req.body?.parent || '');
  if (!name || /[<>:"|?*\\]/.test(name)) {
    res.status(400).json({ error: 'Invalid folder name.' }); return;
  }
  const parentAbs = parent ? safePath(parent) : getMediaRoot();
  if (!parentAbs) { res.status(400).json({ error: 'Invalid parent.' }); return; }
  fs.mkdirSync(path.join(parentAbs, name), { recursive: true });
  res.json({ ok: true });
});

// Rename folder
router.patch('/folders', requireAuth, (req, res) => {
  const folder = String(req.body?.folder || '');
  const name = String(req.body?.name || '').trim();
  if (!name || /[<>:"|?*\\]/.test(name)) {
    res.status(400).json({ error: 'Invalid name.' }); return;
  }
  const abs = safePath(folder);
  if (!abs || !fs.existsSync(abs)) { res.status(404).json({ error: 'Folder not found.' }); return; }
  const newAbs = path.join(path.dirname(abs), name);
  if (fs.existsSync(newAbs)) { res.status(409).json({ error: 'Name already in use.' }); return; }
  fs.renameSync(abs, newAbs);
  rescan();
  res.json({ ok: true });
});

// Delete folder
router.delete('/folders', requireAuth, (req, res) => {
  const folder = String(req.body?.folder || '');
  const abs = safePath(folder);
  if (!abs || !fs.existsSync(abs)) { res.status(404).json({ error: 'Folder not found.' }); return; }
  fs.rmSync(abs, { recursive: true, force: true });
  rescan();
  res.json({ ok: true });
});

// Rescan
router.post('/rescan', requireAuth, (_req, res) => {
  rescan();
  res.json({ ok: true, count: getLibrary().length });
});

// Stats
router.get('/stats', requireAuth, (_req, res) => {
  const os = require('os');
  const { execSync } = require('child_process');
  const lib = getLibrary();

  let disk: { used: number; total: number } | undefined;
  try {
    const out = execSync(`df -k "${getMediaRoot()}"`, { timeout: 3000 }).toString();
    const parts = out.trim().split('\n')[1]?.split(/\s+/) || [];
    if (parts.length >= 4) {
      disk = { total: +parts[1] * 1024, used: (+parts[1] - +parts[3]) * 1024 };
    }
  } catch {}

  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  res.json({
    videos: lib.length,
    libraryBytes: lib.reduce((s, v) => s + v.size, 0),
    disk,
    mem: { total: totalMem, used: totalMem - freeMem },
    cpu: { count: os.cpus().length, load: os.loadavg() },
    uptime: { process: process.uptime(), system: os.uptime() },
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    activeDownloads: 0,
  });
});

export default router;
