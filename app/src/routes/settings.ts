import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { getConfig, saveConfig } from '../config';
import { getYtDlpVersion, updateYtDlp } from '../services/ytdlp';

const router = Router();

router.get('/settings', requireAuth, (_req, res) => {
  res.json({ proxy: getConfig().proxy || '' });
});

router.post('/settings', requireAuth, (req, res) => {
  const schema = z.object({
    proxy: z.string().refine(
      v => !v || /^https?:\/\/|^socks[45]?:\/\//i.test(v),
      'Proxy must be http://, https://, or socks5:// URL, or leave blank.',
    ),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message }); return;
  }
  saveConfig({ proxy: parsed.data.proxy });
  res.json({ ok: true, proxy: parsed.data.proxy });
});

router.get('/ytdlp/version', requireAuth, async (_req, res) => {
  try {
    const info = await getYtDlpVersion();
    res.json(info);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ytdlp/update', requireAuth, async (_req, res) => {
  try {
    await updateYtDlp();
    const info = await getYtDlpVersion();
    res.json({ ok: true, version: info.current });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
