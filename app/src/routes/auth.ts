import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getConfig, saveConfig } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const SignupSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
const ChangeSchema = z.object({
  currentPassword: z.string().min(1),
  email: z.string().email().optional(),
  newPassword: z.string().min(8).optional(),
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ email: getConfig().email });
});

router.get('/setup-state', (_req, res) => {
  res.json({ hasAccount: !!getConfig().passwordHash });
});

router.post('/signup', async (req, res) => {
  if (getConfig().passwordHash) {
    res.status(403).json({ error: 'Account already exists.' });
    return;
  }
  const parsed = SignupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }
  const { email, password } = parsed.data;
  const hash = await bcrypt.hash(password, 12);
  saveConfig({ email, passwordHash: hash });
  req.session.userId = email;
  res.json({ ok: true });
});

router.post('/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid email or password.' });
    return;
  }
  const { email, password } = parsed.data;
  const cfg = getConfig();
  if (!cfg.passwordHash || cfg.email !== email) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  const ok = await bcrypt.compare(password, cfg.passwordHash);
  if (!ok) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  req.session.userId = email;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.post('/change-password', requireAuth, async (req, res) => {
  const parsed = ChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }
  const { currentPassword, email, newPassword } = parsed.data;
  const cfg = getConfig();
  const ok = await bcrypt.compare(currentPassword, cfg.passwordHash);
  if (!ok) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }
  const updates: Record<string, string> = {};
  if (email) updates.email = email;
  if (newPassword) updates.passwordHash = await bcrypt.hash(newPassword, 12);
  saveConfig(updates);
  res.json({ ok: true });
});

export default router;
