require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── API Routes ────────────────────────────────────────────
app.use('/api/auth',     require('./src/routes/auth'));
app.use('/api/maps',     require('./src/routes/maps'));
app.use('/api',          require('./src/routes/items'));   // /api/maps/:id/items + /api/items/:id
app.use('/api/accounts', require('./src/routes/accounts'));
app.use('/api/users',    require('./src/routes/users'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Serve React frontend ──────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Controle Financeiro Home rodando na porta ${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   DB: ${process.env.DATABASE_URL ? 'configurado' : '⚠️ DATABASE_URL não definida'}`);
});

module.exports = app;
