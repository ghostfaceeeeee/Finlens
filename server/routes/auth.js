/**
 * server/routes/auth.js
 * Register, login, logout, get profile, change password.
 */
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { users, aiLog } = require('../db/queries');
const { signToken, requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware');

const router = Router();

const AVATAR_COLORS = ['#11C4A8','#5B8AF5','#F7644A','#F5A623','#A78BFA','#34D399','#F472B6'];
const rand = arr => arr[Math.floor(Math.random() * arr.length)];

// ── REGISTER ──────────────────────────────────────────────────
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password)
      return res.status(400).json({ error: 'Email, username, dan password wajib diisi.' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password minimal 8 karakter.' });
    if (!/^[a-zA-Z0-9_.]+$/.test(username))
      return res.status(400).json({ error: 'Username hanya boleh huruf, angka, titik, underscore.' });
    if (username.length < 3 || username.length > 20)
      return res.status(400).json({ error: 'Username 3-20 karakter.' });

    if (users.findByEmail(email))
      return res.status(409).json({ error: 'Email sudah terdaftar.' });
    if (users.findByUsername(username))
      return res.status(409).json({ error: 'Username sudah dipakai.' });

    const hash   = await bcrypt.hash(password, 12);
    const color  = rand(AVATAR_COLORS);
    const result = users.create(email.toLowerCase(), username, hash, color);
    const user   = users.findById(result.lastInsertRowid);
    const token  = signToken({ id: user.id, username: user.username, role: user.role });

    res.status(201).json({
      message: 'Registrasi berhasil!',
      token,
      user: { id: user.id, email: user.email, username: user.username, avatar_color: user.avatar_color },
    });
  } catch (e) { next(e); }
});

// ── LOGIN ─────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email dan password wajib diisi.' });

    const user = users.findByEmail(email);
    if (!user) return res.status(401).json({ error: 'Email atau password salah.' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Email atau password salah.' });

    users.updateLastLogin(user.id);
    const token = signToken({ id: user.id, username: user.username, role: user.role });

    res.json({
      message: `Selamat datang, ${user.username}!`,
      token,
      user: { id: user.id, email: user.email, username: user.username, avatar_color: user.avatar_color, role: user.role },
    });
  } catch (e) { next(e); }
});

// ── GET PROFILE ───────────────────────────────────────────────
router.get('/profile', requireAuth, (req, res) => {
  const stats = aiLog.getByUser(req.user.id, 5);
  res.json({ user: req.user, recent_ai: stats });
});

// ── CHANGE PASSWORD ───────────────────────────────────────────
router.put('/password', requireAuth, async (req, res, next) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password)
      return res.status(400).json({ error: 'Password lama dan baru wajib diisi.' });
    if (new_password.length < 8)
      return res.status(400).json({ error: 'Password baru minimal 8 karakter.' });

    const full = users.findByEmail(req.user.email);
    const ok   = await bcrypt.compare(old_password, full.password_hash);
    if (!ok) return res.status(401).json({ error: 'Password lama salah.' });

    const hash = await bcrypt.hash(new_password, 12);
    users.updatePassword(req.user.id, hash);
    res.json({ message: 'Password berhasil diubah.' });
  } catch (e) { next(e); }
});

// ── VERIFY TOKEN ──────────────────────────────────────────────
router.get('/verify', requireAuth, (req, res) => {
  res.json({ valid: true, user: req.user });
});

module.exports = router;
