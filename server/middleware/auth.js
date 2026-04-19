/**
 * server/middleware/auth.js
 * JWT authentication middleware.
 */
const jwt = require('jsonwebtoken');
const { users } = require('../db/queries');

const SECRET = process.env.JWT_SECRET || 'finlens_dev_secret';

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

// Middleware: wajib login
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token tidak ditemukan. Silakan login.' });
  }
  const token = header.slice(7);
  try {
    const payload = verifyToken(token);
    const user = users.findById(payload.id);
    if (!user) return res.status(401).json({ error: 'User tidak ditemukan.' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token tidak valid atau sudah kedaluwarsa.' });
  }
}

// Middleware: opsional (tidak redirect jika tidak login)
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const payload = verifyToken(header.slice(7));
      req.user = users.findById(payload.id);
    } catch {}
  }
  next();
}

module.exports = { signToken, verifyToken, requireAuth, optionalAuth };
