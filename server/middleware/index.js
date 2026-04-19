const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const security = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
        styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
        fontSrc:    ["'self'", "https://fonts.gstatic.com"],
        imgSrc:     ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'",
                     "https://api.groq.com",
                     "https://api.coingecko.com",
                     "https://query1.finance.yahoo.com",
                     "https://query2.finance.yahoo.com",
                     "https://api.open-meteo.com",
                     "https://newsdata.io"],
        workerSrc:  ["'self'", "blob:"],
      },
    },
  }),
  cors({ origin: process.env.NODE_ENV === 'production' ? (process.env.ALLOWED_ORIGIN || false) : true }),
];

const logger = morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev');

const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 120,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Rate limit tercapai. Coba lagi dalam 1 menit.' },
});

const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: parseInt(process.env.AI_RATE_LIMIT_MAX) || 30,
  message: { error: 'Batas AI request tercapai.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
});

function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  console.error(`[ERR] ${req.method} ${req.path}:`, err.message);
  res.status(status).json({
    error: err.message || 'Server error.',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

function notFound(req, res) {
  res.status(404).json({ error: `Not found: ${req.path}` });
}

module.exports = { security, logger, apiLimiter, aiLimiter, authLimiter, errorHandler, notFound };
