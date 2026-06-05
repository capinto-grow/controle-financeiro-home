const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha obrigatórios' });

    const result = await db.query(
      'SELECT id, workspace_id, name, email, password_hash, role, status FROM users WHERE email = $1 LIMIT 1',
      [email.toLowerCase()]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
    if (user.status !== 'ativo') return res.status(401).json({ error: 'Usuário inativo' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = jwt.sign(
      { userId: user.id, workspaceId: user.workspace_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log do login
    await db.query(
      'INSERT INTO audit_logs (workspace_id, user_id, action, entity) VALUES ($1, $2, $3, $4)',
      [user.workspace_id, user.id, 'LOGIN', 'auth']
    ).catch(() => {});

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, workspaceId: user.workspace_id }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/auth/me — verifica token e retorna usuário atual
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, email, role, workspace_id FROM users WHERE id = $1',
      [req.user.userId]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
