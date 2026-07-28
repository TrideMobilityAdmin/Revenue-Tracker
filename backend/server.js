require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const entriesRoutes = require('./routes/entries');
const mgmtRemarksRoutes = require('./routes/mgmtRemarks');

const app = express();

// --- Security & parsing middleware ---
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  })
);

// General API rate limit (defense in depth, on top of the login-specific limiter)
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// --- Health check (used by AWS load balancer / ECS / EB) ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'tride-revenue-tracker-api' });
});

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/entries', entriesRoutes);
app.use('/api/mgmt-remarks', mgmtRemarksRoutes);

// --- Fallback error handler ---
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`TRiDE Revenue Tracker API listening on port ${PORT}`);
  });
});
