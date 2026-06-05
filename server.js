require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/auth',     require('./src/routes/auth'));
app.use('/api/maps',     require('./src/routes/maps'));
app.use('/api',          require('./src/routes/items'));
app.use('/api/accounts', require('./src/routes/accounts'));
app.use('/api/users',    require('./src/routes/users'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Debug endpoint — SEMPRE retorna 200 para diagnóstico via web_fetch
app.get('/debug/db', async (req, res) => {
  const result = {
    ts: new Date().toISOString(),
    jwt_set: !!process.env.JWT_SECRET,
    db_url_set: !!process.env.DATABASE_URL,
    node_env: process.env.NODE_ENV || 'undefined',
  };
  try {
    const db = require('./src/db');
    // Testa conexão básica
    const ping = await db.query('SELECT 1 as n');
    result.db_connected = true;
    // Verifica tabelas
    try {
      const u = await db.query("SELECT COUNT(*) as c FROM users");
      result.users_count = parseInt(u.rows[0].c);
    } catch(e) { result.users_error = e.message; }
    try {
      const m = await db.query("SELECT COUNT(*) as c FROM financial_maps");
      result.maps_count = parseInt(m.rows[0].c);
    } catch(e) { result.maps_error = e.message; }
    try {
      const i = await db.query("SELECT COUNT(*) as c FROM map_items");
      result.items_count = parseInt(i.rows[0].c);
    } catch(e) { result.items_error = e.message; }
    result.ok = !result.users_error;
  } catch(e) {
    result.db_connected = false;
    result.db_error = e.message;
    result.ok = false;
  }
  res.json(result); // SEMPRE 200
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`🚀 CFH na porta ${PORT}`);
  console.log(`   JWT: ${process.env.JWT_SECRET ? '✅' : '⚠️ fallback'}`);
  console.log(`   DB:  ${process.env.DATABASE_URL ? '✅' : '❌ não definida'}`);
});

module.exports = app;
