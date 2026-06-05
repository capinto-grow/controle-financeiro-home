require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

const RECEIPTS = [
  { description: 'Jumplabel - Pagamento das Quotas', category: 'Pró-labore', dueDay: null, months: [14000,14000,14000,14000,14000,14000,0,14000,14000,14000,14000,14000], order: 1 },
  { description: 'GROW - Retirada', category: 'Retirada', dueDay: null, months: [0,0,0,0,0,0,0,10500,10500,10500,10500,10500], order: 2 },
  { description: 'Nomad - Rendimento USD', category: 'Rendimentos', dueDay: null, months: [29162.85,0,0,4130,37500,19854.27,19854.27,0,0,0,0,0], order: 3 },
  { description: 'INSS / IRPF Restituição', category: 'Restituição', dueDay: null, months: [3336.27,3466.38,3466.38,3466.38,5199.57,5199.57,5199.57,3466.38,3466.38,3466.38,3466.38,3466.38], order: 4 },
  { description: 'CDB-DI (Itaú)', category: 'Investimentos', dueDay: null, months: [0,0,0,12000,0,0,0,100000,0,0,0,0], order: 5 },
  { description: 'Rendimento CDB / Juros', category: 'Rendimentos', dueDay: null, months: [1230,2800,1180,0,0,0,300,1028.20,990.82,853.07,718.94,503.47], order: 6 },
  { description: 'Admiconta + AMIL (Simulação)', category: 'Outros', dueDay: null, months: [0,0,0,5000,0,8000,8000,8000,8000,8000,8000,0], order: 7 },
  { description: 'Saldo NU Bank / MP / Itaú', category: 'Transferência de Saldo', dueDay: null, months: [0,3900,0,0,0,0,3612.89,0,0,0,0,0], order: 8 },
  { description: 'US$ Caixa - Prêmio/Consórcio', category: 'Outros', dueDay: null, months: [0,0,0,34000,7000,2000,2000,0,0,0,0,0], order: 9 },
];

const EXPENSES = [
  { description: 'Baldomero (condomínio)', category: 'Moradia', dueDay: 10, months: [3808.94,4282.66,4282.66,4282.66,4282.66,4282.66,4282.66,13189.66,8907,8907,8907,8907], order: 10 },
  { description: 'Sabesp (água)', category: 'Água', dueDay: 4, months: [112.54,130.57,119.84,106.98,102.22,106.98,0,140,140,140,140,140], order: 11 },
  { description: 'Ajuda família', category: 'Família', dueDay: 1, months: [300,300,300,300,300,300,300,300,300,300,300,300], order: 12 },
  { description: 'Personal trainer', category: 'Saúde', dueDay: 1, months: [1500,1500,2500,1500,1500,1500,0,1500,1500,1500,1500,1500], order: 13 },
  { description: 'IPVA / DARF / IRPF', category: 'Impostos', dueDay: 8, months: [1163,1163,1163.65,1163,1163,20000,0,0,2042.63,2042.63,2042.63,2042.63], order: 14 },
  { description: 'Cartão Platinum (vcto 10)', category: 'Cartão de Crédito', dueDay: 10, months: [8993.28,11615.97,13086.94,12599.73,13143.21,7276.15,7276.15,5000,5000,5000,5000,5000], order: 15 },
  { description: 'ADMICONTA - Contabilidade', category: 'Contabilidade', dueDay: 8, months: [759,810,810,810,810,810,810,0,0,0,0,0], order: 16 },
  { description: 'Porto Seguros Consórcio Auto $193mil', category: 'Consórcios', dueDay: 14, months: [1549.75,1549.22,1550.29,1550.29,1547.62,1550.29,1550.29,1550.29,1550.29,1550.29,1550.29,1550.29], order: 17 },
  { description: 'Porto Seguros Consórcio $810mil', category: 'Consórcios', dueDay: 14, months: [2616.56,2615.83,2617.28,2617.28,2613.64,2617.28,2617.28,0,0,0,0,0], order: 18 },
  { description: 'Porto Seguro Imóvel 3 cartas', category: 'Consórcios', dueDay: 14, months: [0,0,0,0,1646.85,1646.79,1646.79,1646.79,1646.79,1646.79,1646.79,1646.79], order: 19 },
  { description: 'GUIA INSS (Sandra)', category: 'Impostos', dueDay: 12, months: [166.98,166.98,178.31,166.98,166.98,166.98,166.98,166.98,166.98,166.98,166.98,166.98], order: 20 },
  { description: 'ENEL Brasil (energia)', category: 'Energia', dueDay: 14, months: [324.41,158.48,281.99,278.49,324.95,372.3,372.3,372.3,372.3,372.3,372.3,372.3], order: 21 },
  { description: 'Plano Saúde', category: 'Saúde', dueDay: 18, months: [5906,5906,5782,5782,5782,5782,5782,0,0,0,0,0], order: 22 },
  { description: 'Cartão Itaú Platinum + Black', category: 'Cartão de Crédito', dueDay: 15, months: [14208.21,12926.12,9060.46,7164.89,9611.55,7707.48,7707.48,4000,4000,4000,3500,5000], order: 23 },
  { description: 'Magazine Luiza (parcelado)', category: 'Cartão de Crédito', dueDay: 15, months: [176.69,176.69,176.69,176.69,176.69,176.69,176.69,176.69,176.69,176.69,176.69,176.69], order: 24 },
  { description: 'Cartão Mercado Pago', category: 'Cartão de Crédito', dueDay: 18, months: [4111.56,5076.04,3156.35,1509.32,500,692.92,692.92,1500,1500,1500,1500,1500], order: 25 },
  { description: 'Cartão Porto Seguro Infinite', category: 'Cartão de Crédito', dueDay: 15, months: [6250.69,0,4862.62,3774.9,3673.73,3137.66,3137.66,2500,2500,2500,2500,2500], order: 26 },
  { description: 'Cartão NUBANK', category: 'Cartão de Crédito', dueDay: 23, months: [8928.96,3542.44,2514.24,3996.71,3985.02,3500,3500,3000,3000,3000,3000,3000], order: 27 },
  { description: 'TV Cabo / VIVO (2 linhas)', category: 'Internet/Telefone', dueDay: 28, months: [677,677,600,600,600,600,600,600,600,600,600,600], order: 28 },
  { description: 'Guarda (segurança)', category: 'Moradia', dueDay: 15, months: [100,100,100,100,100,100,100,100,100,100,100,100], order: 29 },
  { description: 'Capitalização Caixa Econômica', category: 'Investimentos empresariais', dueDay: 12, months: [200,220,200,200,200,200,200,200,200,200,200,200], order: 30 },
  { description: 'Carrefour / Mercado', category: 'Alimentação', dueDay: 23, months: [16.98,16.98,16.98,13,13,2000,2000,13,13,13,13,13], order: 31 },
  { description: 'Advogados / Perito / Dr. Edison', category: 'Jurídico', dueDay: 4, months: [4554,4863,4863,4863,4863,4863,0,4863,4863,4863,4863,4863], order: 32 },
  { description: 'Anderson (perito) / Professor', category: 'Jurídico', dueDay: 15, months: [0,2000,2000,2000,2000,2000,2000,2000,2000,2000,2000,2000], order: 33 },
  { description: 'C&A - Loja (fatura)', category: 'Cartão de Crédito', dueDay: 12, months: [176.96,73.97,8.99,17.98,17.98,17.98,17.98,17.98,17.98,17.98,17.98,17.98], order: 34 },
  { description: 'Marketing Mari', category: 'Marketing', dueDay: 1, months: [0,0,2100,2100,2100,1500,1500,0,0,0,0,0], order: 35 },
  { description: 'GROW Investimento', category: 'Investimentos empresariais', dueDay: 1, months: [7000,5650,3750,0,0,0,0,0,0,0,0,0], order: 36 },
  { description: 'Cartão de Crédito GROW', category: 'Cartão de Crédito', dueDay: 8, months: [1099.59,960,960,1180,1169.99,1187.26,1187.26,0,0,0,0,0], order: 37 },
  { description: 'Evento Buenos Aires / Dra. Pamela', category: 'Viagens', dueDay: null, months: [0,0,9800,1612,0,0,0,0,0,0,0,0], order: 38 },
  { description: 'Empréstimo Mercado Pago', category: 'Empréstimos', dueDay: 27, months: [0,0,0,2986,2846,2842.37,2842.37,2842.37,2842.37,2842.37,2842.37,2842.37], order: 39 },
  { description: 'Empréstimo Itaú', category: 'Empréstimos', dueDay: 3, months: [0,0,0,0,4649.88,4649.88,0,4649.88,7293.43,7293.43,7293.43,7293.43], order: 40 },
  { description: 'Simples Nacional GROW', category: 'Impostos', dueDay: 20, months: [0,0,0,1007.51,0,0,0,0,0,0,0,0], order: 41 },
  { description: 'Pagto IRPF 4 Parcelas', category: 'Impostos', dueDay: 30, months: [0,10000,10000,4360,0,0,0,0,0,0,0,0], order: 42 },
];

async function seed() {
  console.log('🌱 Iniciando seed do banco de dados...');
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Workspace
    const wsRes = await client.query(`
      INSERT INTO workspaces (id, name, plan, settings)
      VALUES ('a1b2c3d4-0000-0000-0000-000000000001','Carlos Grow - Home','personal',
        '{"app_name":"Controle Financeiro Home","currency":"BRL","initial_balance":123000}')
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name RETURNING id
    `);
    const wsId = wsRes.rows[0].id;

    // Admin user
    const hash = await bcrypt.hash('admin123', 12);
    const hash2 = await bcrypt.hash('gestor123', 12);
    const hash3 = await bcrypt.hash('op123', 12);

    await client.query(`
      INSERT INTO users (id, workspace_id, name, email, password_hash, role, status) VALUES
        ('u1000000-0000-0000-0000-000000000001',$1,'Carlos Grow','carlos@grow.com.br',$2,'admin','ativo'),
        ('u1000000-0000-0000-0000-000000000002',$1,'Maria Silva','maria@grow.com.br',$3,'gestor','ativo'),
        ('u1000000-0000-0000-0000-000000000003',$1,'João Operacional','joao@grow.com.br',$4,'operacional','ativo')
      ON CONFLICT (workspace_id, email) DO NOTHING
    `, [wsId, hash, hash2, hash3]);

    await client.query(`UPDATE workspaces SET owner_user_id='u1000000-0000-0000-0000-000000000001' WHERE id=$1`, [wsId]);

    // Financial map
    const mapRes = await client.query(`
      INSERT INTO financial_maps (id, workspace_id, user_id, name, year, scenario, status, description, initial_balance)
      VALUES ('m1000000-0000-0000-0000-000000000001',$1,'u1000000-0000-0000-0000-000000000001',
              'Cenário Real - 2026 Imóvel',2026,'real','ativo',
              'Mapa financeiro real do ano de 2026 com foco no imóvel',123000)
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name RETURNING id
    `, [wsId]);
    const mapId = mapRes.rows[0].id;

    // Clear existing items to avoid duplicates
    await client.query('DELETE FROM map_items WHERE map_id=$1', [mapId]);

    // Insert receipts
    for (const r of RECEIPTS) {
      await client.query(
        'INSERT INTO map_items (map_id, type, description, category, due_day, months, display_order) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [mapId, 'receita', r.description, r.category, r.dueDay, r.months, r.order]
      );
    }
    // Insert expenses
    for (const e of EXPENSES) {
      await client.query(
        'INSERT INTO map_items (map_id, type, description, category, due_day, months, display_order) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [mapId, 'despesa', e.description, e.category, e.dueDay, e.months, e.order]
      );
    }

    // Financial accounts
    await client.query(`
      INSERT INTO financial_accounts (workspace_id, name, type, institution, opening_balance, current_balance) VALUES
        ($1,'Conta Itaú Corrente','conta_corrente','Itaú',45000,45000),
        ($1,'NuBank Digital','carteira_digital','NuBank',8500,8500),
        ($1,'CDB-DI Itaú','investimento','Itaú',320000,320000),
        ($1,'Nomad USD','conta_corrente','Nomad',15000,15000),
        ($1,'Bradesco Poupança','poupanca','Bradesco',12000,12000)
      ON CONFLICT DO NOTHING
    `, [wsId]);

    // Credit cards
    await client.query(`
      INSERT INTO credit_cards (workspace_id, name, institution, closing_day, due_day, limit_amount) VALUES
        ($1,'Itaú Platinum','Itaú',10,17,30000),
        ($1,'Itaú Black','Itaú',10,17,50000),
        ($1,'NuBank','NuBank',16,23,20000),
        ($1,'Porto Seguro Infinite','Porto Seguro',8,15,25000),
        ($1,'Cartão Platinum','Bradesco',3,10,15000),
        ($1,'Mercado Pago','Mercado Pago',16,23,10000)
      ON CONFLICT DO NOTHING
    `, [wsId]);

    await client.query('COMMIT');
    console.log('✅ Seed concluído com sucesso!');
    console.log('   👤 Admin: carlos@grow.com.br / admin123');
    console.log('   👤 Gestor: maria@grow.com.br / gestor123');
    console.log('   📊 Mapa: Cenário Real 2026 Imóvel (42 itens)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro no seed:', err.message);
    throw err;
  } finally {
    client.release();
    process.exit(0);
  }
}

seed().catch(console.error);
