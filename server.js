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

// Debug endpoint - verifica banco sem autenticação
app.get('/debug/db', async (req, res) => {
  try {
    const db = require('./src/db');
    const users = await db.query('SELECT COUNT(*) as count, MAX(email) as last_email FROM users');
    const maps = await db.query('SELECT COUNT(*) as count FROM financial_maps');
    const items = await db.query('SELECT COUNT(*) as count FROM map_items');
    res.json({
      ok: true,
      startup_ran: true,
      users: { count: parseInt(users.rows[0].count), sample_email: users.rows[0].last_email },
      maps: parseInt(maps.rows[0].count),
      items: parseInt(items.rows[0].count),
      jwt_secret_set: !!process.env.JWT_SECRET,
      db_url_set: !!process.env.DATABASE_URL,
      node_env: process.env.NODE_ENV,
      ts: new Date().toISOString()
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message, tables_exist: false });
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`🚀 CFH Server na porta ${PORT} | ENV: ${process.env.NODE_ENV || 'dev'}`);
  console.log(`   JWT_SECRET: ${process.env.JWT_SECRET ? '✅ definido' : '⚠️ usando fallback'}`);
  console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✅ definido' : '❌ não definido'}`);
});

module.exports = app;
