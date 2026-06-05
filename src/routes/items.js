const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// GET /api/maps/:mapId/items
router.get('/maps/:mapId/items', async (req, res) => {
  try {
    const mapCheck = await db.query(
      'SELECT id FROM financial_maps WHERE id=$1 AND workspace_id=$2',
      [req.params.mapId, req.user.workspaceId]
    );
    if (!mapCheck.rows[0]) return res.status(404).json({ error: 'Mapa não encontrado' });

    const result = await db.query(
      'SELECT * FROM map_items WHERE map_id=$1 ORDER BY display_order ASC, type ASC, created_at ASC',
      [req.params.mapId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar itens' });
  }
});

// POST /api/maps/:mapId/items — criar item
router.post('/maps/:mapId/items', async (req, res) => {
  try {
    const { type, description, category, dueDay, months, displayOrder } = req.body;
    if (!type || !description) return res.status(400).json({ error: 'Tipo e descrição são obrigatórios' });
    const monthArr = Array.isArray(months) && months.length === 12
      ? months.map(v => parseFloat(v) || 0)
      : Array(12).fill(0);

    const result = await db.query(
      `INSERT INTO map_items (map_id, type, description, category, due_day, months, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.mapId, type, description, category || null, dueDay || null, monthArr, displayOrder || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar item' });
  }
});

// PUT /api/items/:id — atualizar item completo
router.put('/items/:id', async (req, res) => {
  try {
    const { description, category, dueDay, months, displayOrder } = req.body;
    const monthArr = Array.isArray(months) ? months.map(v => parseFloat(v) || 0) : undefined;

    const result = await db.query(
      `UPDATE map_items SET
         description = COALESCE($1, description),
         category    = COALESCE($2, category),
         due_day     = $3,
         months      = COALESCE($4, months),
         display_order = COALESCE($5, display_order),
         updated_at  = NOW()
       WHERE id = $6 RETURNING *`,
      [description, category, dueDay || null, monthArr, displayOrder, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Item não encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar item' });
  }
});

// PATCH /api/items/:id/month — atualizar apenas um mês (edição inline da planilha)
router.patch('/items/:id/month', async (req, res) => {
  try {
    const { monthIndex, value } = req.body;
    if (monthIndex < 0 || monthIndex > 11) return res.status(400).json({ error: 'Mês inválido (0-11)' });

    // Atualiza o índice do array PostgreSQL (1-based)
    const result = await db.query(
      `UPDATE map_items
         SET months[$1] = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [monthIndex + 1, parseFloat(value) || 0, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Item não encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar mês' });
  }
});

// DELETE /api/items/:id
router.delete('/items/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM map_items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir item' });
  }
});

module.exports = router;
