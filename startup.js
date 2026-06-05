require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Garante JWT_SECRET mesmo sem variável de ambiente
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'cfhome_secret_2026_grow_xK9mP3qL';
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Cria cada tabela separadamente para tolerar falhas parciais
const TABLES = [
  `CREATE TABLE IF NOT EXISTS workspaces (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL, owner_user_id VARCHAR(36),
    plan VARCHAR(50) NOT NULL DEFAULT 'personal',
    status VARCHAR(20) NOT NULL DEFAULT 'ativo',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'operacional',
    status VARCHAR(20) NOT NULL DEFAULT 'ativo',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, email)
  )`,
  `CREATE TABLE IF NOT EXISTS financial_maps (
    id VARCHAR(36) PRIMARY KEY,
    workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL, year SMALLINT NOT NULL,
    scenario VARCHAR(30) NOT NULL DEFAULT 'real',
    status VARCHAR(30) NOT NULL DEFAULT 'ativo',
    description TEXT, initial_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
    cloned_from_id VARCHAR(36), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS map_items (
    id VARCHAR(36) PRIMARY KEY,
    map_id VARCHAR(36) NOT NULL REFERENCES financial_maps(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL CHECK (type IN ('receita','despesa')),
    description VARCHAR(500) NOT NULL, category VARCHAR(255),
    due_day SMALLINT, display_order INTEGER DEFAULT 0,
    months NUMERIC(15,2)[] NOT NULL DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::NUMERIC[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS financial_accounts (
    id VARCHAR(36) PRIMARY KEY,
    workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, type VARCHAR(30) NOT NULL DEFAULT 'conta_corrente',
    institution VARCHAR(255), opening_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
    current_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE, notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    workspace_id VARCHAR(36), user_id VARCHAR(36),
    action VARCHAR(30) NOT NULL, entity VARCHAR(100) NOT NULL,
    entity_id VARCHAR(36), old_value JSONB, new_value JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
];

const RECEIPTS = [
  ['Jumplabel - Pagamento das Quotas','Pró-labore',null,[14000,14000,14000,14000,14000,14000,0,14000,14000,14000,14000,14000],1],
  ['GROW - Retirada','Retirada',null,[0,0,0,0,0,0,0,10500,10500,10500,10500,10500],2],
  ['Nomad - Rendimento USD','Rendimentos',null,[29162.85,0,0,4130,37500,19854.27,19854.27,0,0,0,0,0],3],
  ['INSS / IRPF Restituição','Restituição',null,[3336.27,3466.38,3466.38,3466.38,5199.57,5199.57,5199.57,3466.38,3466.38,3466.38,3466.38,3466.38],4],
  ['CDB-DI (Itaú)','Investimentos',null,[0,0,0,12000,0,0,0,100000,0,0,0,0],5],
  ['Rendimento CDB / Juros','Rendimentos',null,[1230,2800,1180,0,0,0,300,1028.20,990.82,853.07,718.94,503.47],6],
  ['Admiconta + AMIL','Outros',null,[0,0,0,5000,0,8000,8000,8000,8000,8000,8000,0],7],
  ['Saldo NU Bank / MP / Itaú','Transferência de Saldo',null,[0,3900,0,0,0,0,3612.89,0,0,0,0,0],8],
  ['US$ Caixa - Prêmio/Consórcio','Outros',null,[0,0,0,34000,7000,2000,2000,0,0,0,0,0],9],
];
const EXPENSES = [
  ['Baldomero (condomínio)','Moradia',10,[3808.94,4282.66,4282.66,4282.66,4282.66,4282.66,4282.66,13189.66,8907,8907,8907,8907],10],
  ['Sabesp (água)','Água',4,[112.54,130.57,119.84,106.98,102.22,106.98,0,140,140,140,140,140],11],
  ['Ajuda família','Família',1,[300,300,300,300,300,300,300,300,300,300,300,300],12],
  ['Personal trainer','Saúde',1,[1500,1500,2500,1500,1500,1500,0,1500,1500,1500,1500,1500],13],
  ['IPVA / DARF / IRPF','Impostos',8,[1163,1163,1163.65,1163,1163,20000,0,0,2042.63,2042.63,2042.63,2042.63],14],
  ['Cartão Platinum (vcto 10)','Cartão de Crédito',10,[8993.28,11615.97,13086.94,12599.73,13143.21,7276.15,7276.15,5000,5000,5000,5000,5000],15],
  ['ADMICONTA - Contabilidade','Contabilidade',8,[759,810,810,810,810,810,810,0,0,0,0,0],16],
  ['Porto Seguros Consórcio Auto $193mil','Consórcios',14,[1549.75,1549.22,1550.29,1550.29,1547.62,1550.29,1550.29,1550.29,1550.29,1550.29,1550.29,1550.29],17],
  ['Porto Seguros Consórcio $810mil','Consórcios',14,[2616.56,2615.83,2617.28,2617.28,2613.64,2617.28,2617.28,0,0,0,0,0],18],
  ['Porto Seguro Imóvel 3 cartas','Consórcios',14,[0,0,0,0,1646.85,1646.79,1646.79,1646.79,1646.79,1646.79,1646.79,1646.79],19],
  ['GUIA INSS (Sandra)','Impostos',12,[166.98,166.98,178.31,166.98,166.98,166.98,166.98,166.98,166.98,166.98,166.98,166.98],20],
  ['ENEL Brasil (energia)','Energia',14,[324.41,158.48,281.99,278.49,324.95,372.3,372.3,372.3,372.3,372.3,372.3,372.3],21],
  ['Plano Saúde','Saúde',18,[5906,5906,5782,5782,5782,5782,5782,0,0,0,0,0],22],
  ['Cartão Itaú Platinum + Black','Cartão de Crédito',15,[14208.21,12926.12,9060.46,7164.89,9611.55,7707.48,7707.48,4000,4000,4000,3500,5000],23],
  ['Magazine Luiza','Cartão de Crédito',15,[176.69,176.69,176.69,176.69,176.69,176.69,176.69,176.69,176.69,176.69,176.69,176.69],24],
  ['Cartão Mercado Pago','Cartão de Crédito',18,[4111.56,5076.04,3156.35,1509.32,500,692.92,692.92,1500,1500,1500,1500,1500],25],
  ['Cartão Porto Seguro Infinite','Cartão de Crédito',15,[6250.69,0,4862.62,3774.9,3673.73,3137.66,3137.66,2500,2500,2500,2500,2500],26],
  ['Cartão NUBANK','Cartão de Crédito',23,[8928.96,3542.44,2514.24,3996.71,3985.02,3500,3500,3000,3000,3000,3000,3000],27],
  ['TV Cabo / VIVO (2 linhas)','Internet/Telefone',28,[677,677,600,600,600,600,600,600,600,600,600,600],28],
  ['Guarda (segurança)','Moradia',15,[100,100,100,100,100,100,100,100,100,100,100,100],29],
  ['Carrefour / Mercado','Alimentação',23,[16.98,16.98,16.98,13,13,2000,2000,13,13,13,13,13],30],
  ['Advogados / Perito','Jurídico',4,[4554,4863,4863,4863,4863,4863,0,4863,4863,4863,4863,4863],31],
  ['Anderson (perito) / Professor','Jurídico',15,[0,2000,2000,2000,2000,2000,2000,2000,2000,2000,2000,2000],32],
  ['Marketing Mari','Marketing',1,[0,0,2100,2100,2100,1500,1500,0,0,0,0,0],33],
  ['GROW Investimento','Investimentos empresariais',1,[7000,5650,3750,0,0,0,0,0,0,0,0,0],34],
  ['Empréstimo Mercado Pago','Empréstimos',27,[0,0,0,2986,2846,2842.37,2842.37,2842.37,2842.37,2842.37,2842.37,2842.37],35],
  ['Empréstimo Itaú','Empréstimos',3,[0,0,0,0,4649.88,4649.88,0,4649.88,7293.43,7293.43,7293.43,7293.43],36],
  ['C&A - Loja','Cartão de Crédito',12,[176.96,73.97,8.99,17.98,17.98,17.98,17.98,17.98,17.98,17.98,17.98,17.98],37],
  ['Capitalização Caixa Econômica','Investimentos empresariais',12,[200,220,200,200,200,200,200,200,200,200,200,200],38],
  ['Pagto IRPF 4 Parcelas','Impostos',30,[0,10000,10000,4360,0,0,0,0,0,0,0,0],39],
  ['Simples Nacional GROW','Impostos',20,[0,0,0,1007.51,0,0,0,0,0,0,0,0],40],
  ['Evento Buenos Aires / Dra. Pamela','Viagens',null,[0,0,9800,1612,0,0,0,0,0,0,0,0],41],
  ['Cartão de Crédito GROW','Cartão de Crédito',8,[1099.59,960,960,1180,1169.99,1187.26,1187.26,0,0,0,0,0],42],
];

async function initDB() {
  console.log('🔧 [CFH] Inicializando banco de dados...');
  // Cria tabelas individualmente — tolerante a falhas
  for (const sql of TABLES) {
    try { await pool.query(sql); }
    catch(e) { console.error('Tabela:', e.message.split('\n')[0]); }
  }
  console.log('✅ [CFH] Tabelas verificadas');

  // Verifica usuários
  let hasUsers = false;
  try {
    const { rows } = await pool.query("SELECT COUNT(*) FROM users");
    hasUsers = parseInt(rows[0].count) > 0;
    if (hasUsers) console.log(`✅ [CFH] Usuários já existem: ${rows[0].count}`);
  } catch(e) {
    console.error('❌ [CFH] Erro ao verificar users:', e.message);
    return;
  }

  // Verifica items — pode ter users mas sem items (seed parcial anterior)
  let hasItems = false;
  try {
    const { rows } = await pool.query("SELECT COUNT(*) FROM map_items");
    hasItems = parseInt(rows[0].count) > 0;
    if (hasItems) { console.log(`✅ [CFH] Items já existem: ${rows[0].count}`); return; }
  } catch(e) {
    console.error('❌ [CFH] Erro ao verificar items:', e.message);
  }

  if (hasUsers && hasItems) return;
  console.log('🌱 [CFH] Inserindo dados de 2026...');
  try {
    const h1 = await bcrypt.hash('admin123', 10);
    const h2 = await bcrypt.hash('gestor123', 10);

    const WS_ID = 'a1b2c3d4000000000000000000000001';
    const U_ID  = 'u1000000000000000000000000000001';
    const MAP_ID= 'm1000000000000000000000000000001';

    await pool.query(
      `INSERT INTO workspaces (id,name,plan,settings) VALUES ($1,'Carlos Grow - Home','personal','{"app_name":"Controle Financeiro Home","currency":"BRL","initial_balance":123000}') ON CONFLICT (id) DO NOTHING`,
      [WS_ID]
    );
    await pool.query(
      `INSERT INTO users (id,workspace_id,name,email,password_hash,role,status) VALUES ($1,$2,'Carlos Grow','carlos@grow.com.br',$3,'admin','ativo') ON CONFLICT (workspace_id,email) DO NOTHING`,
      [U_ID, WS_ID, h1]
    );
    await pool.query(
      `INSERT INTO users (id,workspace_id,name,email,password_hash,role,status) VALUES ($1,$2,'Maria Silva','maria@grow.com.br',$3,'gestor','ativo') ON CONFLICT (workspace_id,email) DO NOTHING`,
      ['u2000000000000000000000000000002', WS_ID, h2]
    );
    await pool.query(`UPDATE workspaces SET owner_user_id=$1 WHERE id=$2`, [U_ID, WS_ID]);
    await pool.query(
      `INSERT INTO financial_maps (id,workspace_id,user_id,name,year,scenario,status,description,initial_balance) VALUES ($1,$2,$3,'Cenário Real - 2026 Imóvel',2026,'real','ativo','Mapa financeiro real 2026 com foco no imóvel',123000) ON CONFLICT (id) DO NOTHING`,
      [MAP_ID, WS_ID, U_ID]
    );
    await pool.query('DELETE FROM map_items WHERE map_id=$1', [MAP_ID]);
    for (const [d,c,dd,m,o] of RECEIPTS) {
      const mR = `{${m.join(',')}}`;
      await pool.query('INSERT INTO map_items (id,map_id,type,description,category,due_day,months,display_order) VALUES ($1,$2,$3,$4,$5,$6,$7::NUMERIC[],$8)',
        [uuidv4(),MAP_ID,'receita',d,c,dd,mR,o]);
    }
    for (const [d,c,dd,m,o] of EXPENSES) {
      const mE = `{${m.join(',')}}`;
      await pool.query('INSERT INTO map_items (id,map_id,type,description,category,due_day,months,display_order) VALUES ($1,$2,$3,$4,$5,$6,$7::NUMERIC[],$8)',
        [uuidv4(),MAP_ID,'despesa',d,c,dd,mE,o]);
    }
    console.log(`✅ [CFH] Seed OK: ${RECEIPTS.length} receitas + ${EXPENSES.length} despesas`);
    console.log('   👤 carlos@grow.com.br / admin123');
  } catch(e) {
    console.error('❌ [CFH] Erro no seed:', e.message);
  }
}

initDB()
  .catch(e => console.error('❌ [CFH] initDB falhou:', e.message))
  .finally(() => pool.end().catch(()=>{}))
  .then(() => require('./server'));
