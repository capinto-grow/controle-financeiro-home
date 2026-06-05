const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
    const result = await db.query(
      'SELECT id, name, email, role, status, created_at FROM users WHERE workspace_id=$1 ORDER BY name',
      [req.user.workspaceId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erro ao buscar usuários' }); }
});

router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
    const hash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO users (id, workspace_id, name, email, password_hash, role, status)
       VALUES ($1,$2,$3,$4,$5,$6,'ativo') RETURNING id, name, email, role, status, created_at`,
      [id, req.user.workspaceId, name, email.toLowerCase(), hash, role || 'operacional']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'E-mail já cadastrado' });
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.userId !== req.params.id)
      return res.status(403).json({ error: 'Sem permissão' });
    const { name, role, status } = req.body;
    const result = await db.query(
      `UPDATE users SET name=COALESCE($1,name), role=COALESCE($2,role), status=COALESCE($3,status), updated_at=NOW()
       WHERE id=$4 AND workspace_id=$5 RETURNING id, name, email, role, status`,
      [name, role, status, req.params.id, req.user.workspaceId]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erro ao atualizar usuário' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
    if (req.user.userId === req.params.id) return res.status(400).json({ error: 'Não pode excluir sua própria conta' });
    await db.query("UPDATE users SET status='inativo' WHERE id=$1 AND workspace_id=$2", [req.params.id, req.user.workspaceId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erro ao excluir usuário' }); }
});

module.exports = router;
