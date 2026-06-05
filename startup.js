require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// JWT fallback
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'cfhome_secret_2026_grow_fallback_key';

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL, owner_user_id UUID,
  plan VARCHAR(50) NOT NULL DEFAULT 'personal', status VARCHAR(20) NOT NULL DEFAULT 'ativo',
  settings JSONB DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'operacional',
  status VARCHAR(20) NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, email)
);
CREATE TABLE IF NOT EXISTS financial_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(255) NOT NULL, year SMALLINT NOT NULL,
  scenario VARCHAR(30) NOT NULL DEFAULT 'real', status VARCHAR(30) NOT NULL DEFAULT 'ativo',
  description TEXT, initial_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  cloned_from_id UUID REFERENCES financial_maps(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS map_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID NOT NULL REFERENCES financial_maps(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL CHECK (type IN ('receita','despesa')),
  description VARCHAR(500) NOT NULL, category VARCHAR(255),
  due_day SMALLINT CHECK (due_day BETWEEN 1 AND 31),
  months NUMERIC(15,2)[] NOT NULL DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::NUMERIC[],
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL, type VARCHAR(30) NOT NULL DEFAULT 'conta_corrente',
  institution VARCHAR(255), opening_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(15,2) NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS credit_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL, institution VARCHAR(255),
  closing_day SMALLINT, due_day SMALLINT, limit_amount NUMERIC(15,2) DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(30) NOT NULL, entity VARCHAR(100) NOT NULL,
  entity_id UUID, old_value JSONB, new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const RECEIPTS = [
  { d:'Jumplabel - Pagamento das Quotas', c:'Pró-labore', dd:null, m:[14000,14000,14000,14000,14000,14000,0,14000,14000,14000,14000,14000], o:1 },
  { d:'GROW - Retirada', c:'Retirada', dd:null, m:[0,0,0,0,0,0,0,10500,10500,10500,10500,10500], o:2 },
  { d:'Nomad - Rendimento USD', c:'Rendimentos', dd:null, m:[29162.85,0,0,4130,37500,19854.27,19854.27,0,0,0,0,0], o:3 },
  { d:'INSS / IRPF Restituição', c:'Restituição', dd:null, m:[3336.27,3466.38,3466.38,3466.38,5199.57,5199.57,5199.57,3466.38,3466.38,3466.38,3466.38,3466.38], o:4 },
  { d:'CDB-DI (Itaú)', c:'Investimentos', dd:null, m:[0,0,0,12000,0,0,0,100000,0,0,0,0], o:5 },
  { d:'Rendimento CDB / Juros', c:'Rendimentos', dd:null, m:[1230,2800,1180,0,0,0,300,1028.20,990.82,853.07,718.94,503.47], o:6 },
  { d:'Admiconta + AMIL', c:'Outros', dd:null, m:[0,0,0,5000,0,8000,8000,8000,8000,8000,8000,0], o:7 },
  { d:'Saldo NU Bank / MP / Itaú', c:'Transferência de Saldo', dd:null, m:[0,3900,0,0,0,0,3612.89,0,0,0,0,0], o:8 },
  { d:'US$ Caixa - Prêmio/Consórcio', c:'Outros', dd:null, m:[0,0,0,34000,7000,2000,2000,0,0,0,0,0], o:9 },
];
const EXPENSES = [
  { d:'Baldomero (condomínio)', c:'Moradia', dd:10, m:[3808.94,4282.66,4282.66,4282.66,4282.66,4282.66,4282.66,13189.66,8907,8907,8907,8907], o:10 },
  { d:'Sabesp (água)', c:'Água', dd:4, m:[112.54,130.57,119.84,106.98,102.22,106.98,0,140,140,140,140,140], o:11 },
  { d:'Ajuda família', c:'Família', dd:1, m:[300,300,300,300,300,300,300,300,300,300,300,300], o:12 },
  { d:'Personal trainer', c:'Saúde', dd:1, m:[1500,1500,2500,1500,1500,1500,0,1500,1500,1500,1500,1500], o:13 },
  { d:'IPVA / DARF / IRPF', c:'Impostos', dd:8, m:[1163,1163,1163.65,1163,1163,20000,0,0,2042.63,2042.63,2042.63,2042.63], o:14 },
  { d:'Cartão Platinum (vcto 10)', c:'Cartão de Crédito', dd:10, m:[8993.28,11615.97,13086.94,12599.73,13143.21,7276.15,7276.15,5000,5000,5000,5000,5000], o:15 },
  { d:'ADMICONTA - Contabilidade', c:'Contabilidade', dd:8, m:[759,810,810,810,810,810,810,0,0,0,0,0], o:16 },
  { d:'Porto Seguros Consórcio Auto $193mil', c:'Consórcios', dd:14, m:[1549.75,1549.22,1550.29,1550.29,1547.62,1550.29,1550.29,1550.29,1550.29,1550.29,1550.29,1550.29], o:17 },
  { d:'Porto Seguros Consórcio $810mil', c:'Consórcios', dd:14, m:[2616.56,2615.83,2617.28,2617.28,2613.64,2617.28,2617.28,0,0,0,0,0], o:18 },
  { d:'Porto Seguro Imóvel 3 cartas', c:'Consórcios', dd:14, m:[0,0,0,0,1646.85,1646.79,1646.79,1646.79,1646.79,1646.79,1646.79,1646.79], o:19 },
  { d:'GUIA INSS (Sandra)', c:'Impostos', dd:12, m:[166.98,166.98,178.31,166.98,166.98,166.98,166.98,166.98,166.98,166.98,166.98,166.98], o:20 },
  { d:'ENEL Brasil (energia)', c:'Energia', dd:14, m:[324.41,158.48,281.99,278.49,324.95,372.3,372.3,372.3,372.3,372.3,372.3,372.3], o:21 },
  { d:'Plano Saúde', c:'Saúde', dd:18, m:[5906,5906,5782,5782,5782,5782,5782,0,0,0,0,0], o:22 },
  { d:'Cartão Itaú Platinum + Black', c:'Cartão de Crédito', dd:15, m:[14208.21,12926.12,9060.46,7164.89,9611.55,7707.48,7707.48,4000,4000,4000,3500,5000], o:23 },
  { d:'Magazine Luiza (parcelado)', c:'Cartão de Crédito', dd:15, m:[176.69,176.69,176.69,176.69,176.69,176.69,176.69,176.69,176.69,176.69,176.69,176.69], o:24 },
  { d:'Cartão Mercado Pago', c:'Cartão de Crédito', dd:18, m:[4111.56,5076.04,3156.35,1509.32,500,692.92,692.92,1500,1500,1500,1500,1500], o:25 },
  { d:'Cartão Porto Seguro Infinite', c:'Cartão de Crédito', dd:15, m:[6250.69,0,4862.62,3774.9,3673.73,3137.66,3137.66,2500,2500,2500,2500,2500], o:26 },
  { d:'Cartão NUBANK', c:'Cartão de Crédito', dd:23, m:[8928.96,3542.44,2514.24,3996.71,3985.02,3500,3500,3000,3000,3000,3000,3000], o:27 },
  { d:'TV Cabo / VIVO (2 linhas)', c:'Internet/Telefone', dd:28, m:[677,677,600,600,600,600,600,600,600,600,600,600], o:28 },
  { d:'Guarda (segurança)', c:'Moradia', dd:15, m:[100,100,100,100,100,100,100,100,100,100,100,100], o:29 },
  { d:'Carrefour / Mercado', c:'Alimentação', dd:23, m:[16.98,16.98,16.98,13,13,2000,2000,13,13,13,13,13], o:30 },
  { d:'Advogados / Perito / Dr. Edison', c:'Jurídico', dd:4, m:[4554,4863,4863,4863,4863,4863,0,4863,4863,4863,4863,4863], o:31 },
  { d:'Anderson (perito) / Professor', c:'Jurídico', dd:15, m:[0,2000,2000,2000,2000,2000,2000,2000,2000,2000,2000,2000], o:32 },
  { d:'Marketing Mari', c:'Marketing', dd:1, m:[0,0,2100,2100,2100,1500,1500,0,0,0,0,0], o:33 },
  { d:'GROW Investimento', c:'Investimentos empresariais', dd:1, m:[7000,5650,3750,0,0,0,0,0,0,0,0,0], o:34 },
  { d:'Empréstimo Mercado Pago', c:'Empréstimos', dd:27, m:[0,0,0,2986,2846,2842.37,2842.37,2842.37,2842.37,2842.37,2842.37,2842.37], o:35 },
  { d:'Empréstimo Itaú', c:'Empréstimos', dd:3, m:[0,0,0,0,4649.88,4649.88,0,4649.88,7293.43,7293.43,7293.43,7293.43], o:36 },
  { d:'C&A - Loja (fatura)', c:'Cartão de Crédito', dd:12, m:[176.96,73.97,8.99,17.98,17.98,17.98,17.98,17.98,17.98,17.98,17.98,17.98], o:37 },
  { d:'Capitalização Caixa Econômica', c:'Investimentos empresariais', dd:12, m:[200,220,200,200,200,200,200,200,200,200,200,200], o:38 },
  { d:'Pagto IRPF 4 Parcelas', c:'Impostos', dd:30, m:[0,10000,10000,4360,0,0,0,0,0,0,0,0], o:39 },
  { d:'Simples Nacional GROW', c:'Impostos', dd:20, m:[0,0,0,1007.51,0,0,0,0,0,0,0,0], o:40 },
  { d:'Evento Buenos Aires / Dra. Pamela', c:'Viagens', dd:null, m:[0,0,9800,1612,0,0,0,0,0,0,0,0], o:41 },
  { d:'Cartão de Crédito GROW', c:'Cartão de Crédito', dd:8, m:[1099.59,960,960,1180,1169.99,1187.26,1187.26,0,0,0,0,0], o:42 },
];

async function initDB() {
  console.log('🔧 Inicializando banco de dados...');
  try {
    await pool.query(SCHEMA);
    console.log('✅ Schema criado/verificado');

    const { rows } = await pool.query("SELECT COUNT(*) FROM users");
    if (parseInt(rows[0].count) > 0) {
      console.log('✅ Dados já existem, pulando seed');
      return;
    }

    console.log('🌱 Populando banco de dados com dados de 2026...');
    const hash1 = await bcrypt.hash('admin123', 10);
    const hash2 = await bcrypt.hash('gestor123', 10);

    const wsRes = await pool.query(
      `INSERT INTO workspaces (id,name,plan,settings) VALUES ('a1b2c3d4-0000-0000-0000-000000000001','Carlos Grow - Home','personal','{"app_name":"Controle Financeiro Home","currency":"BRL","initial_balance":123000}') ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name RETURNING id`
    );
    const wsId = wsRes.rows[0].id;

    await pool.query(`
      INSERT INTO users (id,workspace_id,name,email,password_hash,role,status) VALUES
        ('u1000000-0000-0000-0000-000000000001',$1,'Carlos Grow','carlos@grow.com.br',$2,'admin','ativo'),
        ('u1000000-0000-0000-0000-000000000002',$1,'Maria Silva','maria@grow.com.br',$3,'gestor','ativo')
      ON CONFLICT (workspace_id,email) DO NOTHING
    `, [wsId, hash1, hash2]);

    await pool.query(`UPDATE workspaces SET owner_user_id='u1000000-0000-0000-0000-000000000001' WHERE id=$1`, [wsId]);

    const mapRes = await pool.query(`
      INSERT INTO financial_maps (id,workspace_id,user_id,name,year,scenario,status,description,initial_balance)
      VALUES ('m1000000-0000-0000-0000-000000000001',$1,'u1000000-0000-0000-0000-000000000001','Cenário Real - 2026 Imóvel',2026,'real','ativo','Mapa financeiro real 2026 com foco no imóvel',123000)
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name RETURNING id
    `, [wsId]);
    const mapId = mapRes.rows[0].id;

    await pool.query('DELETE FROM map_items WHERE map_id=$1', [mapId]);

    for (const r of RECEIPTS) {
      await pool.query('INSERT INTO map_items (map_id,type,description,category,due_day,months,display_order) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [mapId,'receita',r.d,r.c,r.dd,r.m,r.o]);
    }
    for (const e of EXPENSES) {
      await pool.query('INSERT INTO map_items (map_id,type,description,category,due_day,months,display_order) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [mapId,'despesa',e.d,e.c,e.dd,e.m,e.o]);
    }
    console.log(`✅ Seed concluído: ${RECEIPTS.length} receitas + ${EXPENSES.length} despesas (2026)`);
    console.log('   👤 carlos@grow.com.br / admin123');
  } catch(err) {
    console.error('❌ Erro na inicialização DB:', err.message);
  }
}

initDB().then(() => {
  pool.end().catch(()=>{});
  require('./server');
});
