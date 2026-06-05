const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM financial_accounts WHERE workspace_id=$1 ORDER BY name', [req.user.workspaceId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erro ao buscar contas' }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, type, institution, openingBalance, notes } = req.body;
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO financial_accounts (id, workspace_id, name, type, institution, opening_balance, current_balance, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7) RETURNING *`,
      [id, req.user.workspaceId, name, type||'conta_corrente', institution, parseFloat(openingBalance)||0, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erro ao criar conta' }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, institution, currentBalance, isActive, notes } = req.body;
    const result = await db.query(
      `UPDATE financial_accounts SET name=COALESCE($1,name), institution=COALESCE($2,institution),
       current_balance=COALESCE($3,current_balance), is_active=COALESCE($4,is_active),
       notes=COALESCE($5,notes), updated_at=NOW()
       WHERE id=$6 AND workspace_id=$7 RETURNING *`,
      [name, institution, currentBalance, isActive, notes, req.params.id, req.user.workspaceId]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erro ao atualizar conta' }); }
});

module.exports = router;
