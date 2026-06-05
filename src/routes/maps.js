const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, year, scenario, status, description, initial_balance, cloned_from_id, created_at
       FROM financial_maps WHERE workspace_id = $1 ORDER BY year DESC, created_at DESC`,
      [req.user.workspaceId]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao buscar mapas' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM financial_maps WHERE id = $1 AND workspace_id = $2',
      [req.params.id, req.user.workspaceId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Mapa não encontrado' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erro ao buscar mapa' }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, year, scenario, status, description, initialBalance } = req.body;
    if (!name || !year) return res.status(400).json({ error: 'Nome e ano são obrigatórios' });
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO financial_maps (id, workspace_id, user_id, name, year, scenario, status, description, initial_balance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, req.user.workspaceId, req.user.userId, name, year,
       scenario || 'real', status || 'ativo', description, initialBalance || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao criar mapa' }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, year, scenario, status, description, initialBalance } = req.body;
    const result = await db.query(
      `UPDATE financial_maps SET name=$1, year=$2, scenario=$3, status=$4, description=$5,
       initial_balance=$6, updated_at=NOW() WHERE id=$7 AND workspace_id=$8 RETURNING *`,
      [name, year, scenario, status, description, initialBalance, req.params.id, req.user.workspaceId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Mapa não encontrado' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erro ao atualizar mapa' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
    await db.query('DELETE FROM financial_maps WHERE id=$1 AND workspace_id=$2', [req.params.id, req.user.workspaceId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erro ao excluir mapa' }); }
});

router.post('/:id/clone', async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { name, year, scenario, adjReceitas = 0, adjDespesas = 0 } = req.body;
    const mapRes = await client.query('SELECT * FROM financial_maps WHERE id=$1 AND workspace_id=$2',
      [req.params.id, req.user.workspaceId]);
    if (!mapRes.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Mapa não encontrado' }); }
    const orig = mapRes.rows[0];
    const newId = uuidv4();
    const newMapRes = await client.query(
      `INSERT INTO financial_maps (id, workspace_id, user_id, name, year, scenario, status, description, initial_balance, cloned_from_id)
       VALUES ($1,$2,$3,$4,$5,$6,'ativo',$7,$8,$9) RETURNING *`,
      [newId, req.user.workspaceId, req.user.userId, name || `Cópia de ${orig.name}`,
       year || orig.year, scenario || orig.scenario, orig.description, orig.initial_balance, orig.id]
    );
    const items = await client.query('SELECT * FROM map_items WHERE map_id=$1', [orig.id]);
    for (const item of items.rows) {
      const adj = item.type === 'receita' ? (1 + adjReceitas/100) : (1 + adjDespesas/100);
      const newMonths = item.months.map(v => parseFloat((v * adj).toFixed(2)));
      await client.query(
        `INSERT INTO map_items (id, map_id, type, description, category, due_day, months, display_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [uuidv4(), newMapRes.rows[0].id, item.type, item.description, item.category, item.due_day, newMonths, item.display_order]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(newMapRes.rows[0]);
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Erro ao clonar mapa' }); }
  finally { client.release(); }
});

router.get('/:id/summary', async (req, res) => {
  try {
    const mapRes = await db.query('SELECT * FROM financial_maps WHERE id=$1 AND workspace_id=$2', [req.params.id, req.user.workspaceId]);
    if (!mapRes.rows[0]) return res.status(404).json({ error: 'Mapa não encontrado' });
    const map = mapRes.rows[0];
    const items = await db.query('SELECT * FROM map_items WHERE map_id=$1 ORDER BY display_order, created_at', [req.params.id]);
    const receipts = items.rows.filter(i => i.type === 'receita');
    const expenses = items.rows.filter(i => i.type === 'despesa');
    const tR = Array(12).fill(0); const tD = Array(12).fill(0);
    receipts.forEach(r => r.months.forEach((v, m) => tR[m] += parseFloat(v)||0));
    expenses.forEach(e => e.months.forEach((v, m) => tD[m] += parseFloat(v)||0));
    const resultado = tR.map((r, m) => r - tD[m]);
    const saldo = []; let prev = parseFloat(map.initial_balance)||0;
    for (let m=0;m<12;m++){const s=prev+resultado[m];saldo.push(s);prev=s;}
    res.json({ map, receipts, expenses, summary: { tR, tD, resultado, saldo } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao calcular resumo' }); }
});

module.exports = router;
