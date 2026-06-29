import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { rescan, safePath, getMediaRoot, buildMeta } from '../services/library';
import { ytNetArgs, spawnDownload, fetchPlaylistEntries, netHint } from '../services/ytdlp';
import type { BatchJob, BatchItem } from '../types';

const router = Router();
const batches = new Map<string, BatchJob>();

function broadcastBatch(b: BatchJob, event = 'update'): void {
  const subs = b._subs || new Set();
  const payload = JSON.stringify({
    id: b.id, title: b.title, status: b.status, paused: b.paused,
    done: b.done, total: b.total, items: b.items,
  });
  for (const res of subs) {
    try { res.write(`event: ${event}\ndata: ${payload}\n\n`); } catch {}
  }
}

function sseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

async function runBatch(b: BatchJob): Promise<void> {
  const destAbs = b.folder ? (safePath(b.folder) || getMediaRoot()) : getMediaRoot();

  for (const item of b.items) {
    if (b._stopReq) { b.status = 'stopped'; break; }
    if (item.status !== 'pending') continue;

    while (b.paused && !b._stopReq) {
      await new Promise(r => setTimeout(r, 300));
    }
    if (b._stopReq) { b.status = 'stopped'; break; }

    item.status = 'downloading';
    item.progress = 0;
    broadcastBatch(b);

    const isDirectUrl = !!item.url;
    const src = isDirectUrl ? [item.url!] : [b.url, '--playlist-items', String(item.index)];
    const outTpl = path.join(destAbs, '%(title).200B [%(id)s].%(ext)s');

    const args = [
      '--newline', '--no-mtime', '--no-warnings', '--continue',
      ...(!isDirectUrl ? ['--ignore-errors'] : []),
      '--download-archive', b.archive,
      ...ytNetArgs(),
      isDirectUrl ? '--no-playlist' : '--yes-playlist',
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
      '--merge-output-format', 'mp4',
      '-o', outTpl,
      ...src,
    ];

    await new Promise<void>(resolve => {
      const proc = spawnDownload(args);
      b._proc = proc;

      proc.stdout.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          const pctM = line.match(/(\d+\.?\d*)%/);
          if (pctM) { item.progress = parseFloat(pctM[1]); broadcastBatch(b); }
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.includes('ERROR')) item.error = netHint(text.trim().split('\n')[0]);
      });

      proc.on('close', (code) => {
        b._proc = undefined;
        if (code === 0 || (code !== null && isDirectUrl === false)) {
          item.status = item.error ? 'error' : 'done';
        } else {
          item.status = 'error';
          item.error = item.error || `Exited with code ${code}`;
        }
        item.progress = 100;
        b.done = b.items.filter(i => i.status === 'done').length;
        broadcastBatch(b);
        resolve();
      });
    });
  }

  if (b.status !== 'stopped') {
    b.status = b.items.some(i => i.status === 'error') ? 'error' : 'done';
  }
  broadcastBatch(b);
  rescan();
  buildMeta().catch(() => {});
}

router.post('/playlist/probe', requireAuth, async (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (!url) { res.status(400).json({ error: 'url required' }); return; }
  try {
    const result = await fetchPlaylistEntries(url);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: netHint(err.message || 'Probe failed') });
  }
});

router.post('/playlist/download', requireAuth, (req, res) => {
  const url = String(req.body?.url || '').trim();
  const folder = String(req.body?.folder || '').replace(/^[/\\]+/, '');
  const title = String(req.body?.title || 'Playlist');
  const rawItems: { index: number; title: string; url?: string }[] = req.body?.items || [];

  if (!url || !rawItems.length) {
    res.status(400).json({ error: 'url and items required' }); return;
  }

  const destAbs = folder ? (safePath(folder) || getMediaRoot()) : getMediaRoot();
  fs.mkdirSync(destAbs, { recursive: true });

  const id = crypto.randomBytes(8).toString('hex');
  const archive = path.join(destAbs, '.downloaded.txt');

  const items: BatchItem[] = rawItems.map(i => ({
    index: i.index, title: i.title, url: i.url,
    status: 'pending', progress: 0,
  }));

  const batch: BatchJob = {
    id, url, title, folder, items,
    done: 0, total: items.length,
    status: 'running', paused: false,
    startedAt: Date.now(), archive,
    _subs: new Set(),
  };
  batches.set(id, batch);
  res.json({ id });
  runBatch(batch);
});

router.get('/batch/:id/events', requireAuth, (req, res) => {
  const b = batches.get(req.params["id"] as string);
  sseHeaders(res);
  if (!b) { res.write('event: error\ndata: {"error":"Not found"}\n\n'); res.end(); return; }
  b._subs?.add(res);
  res.write(`event: update\ndata: ${JSON.stringify({
    id: b.id, title: b.title, status: b.status, paused: b.paused,
    done: b.done, total: b.total, items: b.items,
  })}\n\n`);
  req.on('close', () => b._subs?.delete(res));
});

router.get('/batches', requireAuth, (_req, res) => {
  res.json([...batches.values()].map(b => ({
    id: b.id, title: b.title, status: b.status, paused: b.paused,
    done: b.done, total: b.total,
  })));
});

router.post('/batch/:id/pause', requireAuth, (req, res) => {
  const b = batches.get(req.params["id"] as string);
  if (!b) { res.status(404).json({ error: 'Not found' }); return; }
  b.paused = true;
  b._proc?.kill('SIGTERM');
  broadcastBatch(b);
  res.json({ ok: true });
});

router.post('/batch/:id/resume', requireAuth, (req, res) => {
  const b = batches.get(req.params["id"] as string);
  if (!b) { res.status(404).json({ error: 'Not found' }); return; }
  b.paused = false;
  if (b.status === 'paused') { b.status = 'running'; runBatch(b); }
  broadcastBatch(b);
  res.json({ ok: true });
});

router.post('/batch/:id/stop', requireAuth, (req, res) => {
  const b = batches.get(req.params["id"] as string);
  if (!b) { res.status(404).json({ error: 'Not found' }); return; }
  b._stopReq = true;
  b._proc?.kill('SIGKILL');
  res.json({ ok: true });
});

router.post('/batch/:id/skip/:index', requireAuth, (req, res) => {
  const b = batches.get(req.params["id"] as string);
  if (!b) { res.status(404).json({ error: 'Not found' }); return; }
  const idx = parseInt(req.params["index"] as string, 10);
  const item = b.items.find(i => i.index === idx);
  if (item) { item.status = 'skipped'; b._proc?.kill('SIGTERM'); }
  res.json({ ok: true });
});

router.post('/batch/:id/dismiss', requireAuth, (req, res) => {
  batches.delete(req.params["id"] as string);
  res.json({ ok: true });
});

export default router;
