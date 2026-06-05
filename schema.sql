-- ============================================================
-- CONTROLE FINANCEIRO HOME — Schema PostgreSQL v2
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- WORKSPACES (tenants)
CREATE TABLE IF NOT EXISTS workspaces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  owner_user_id UUID,
  plan          VARCHAR(50) NOT NULL DEFAULT 'personal',
  status        VARCHAR(20) NOT NULL DEFAULT 'ativo',
  settings      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'operacional' CHECK (role IN ('admin','gestor','operacional')),
  status        VARCHAR(20) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo','bloqueado')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, email)
);

ALTER TABLE workspaces ADD CONSTRAINT fk_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) DEFERRABLE;

-- FINANCIAL MAPS
CREATE TABLE IF NOT EXISTS financial_maps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id),
  name            VARCHAR(255) NOT NULL,
  year            SMALLINT NOT NULL,
  scenario        VARCHAR(30) NOT NULL DEFAULT 'real',
  status          VARCHAR(30) NOT NULL DEFAULT 'ativo',
  description     TEXT,
  initial_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  cloned_from_id  UUID REFERENCES financial_maps(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- MAP ITEMS (linhas da planilha — cada item tem 12 valores mensais em array)
CREATE TABLE IF NOT EXISTS map_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id        UUID NOT NULL REFERENCES financial_maps(id) ON DELETE CASCADE,
  type          VARCHAR(10) NOT NULL CHECK (type IN ('receita','despesa')),
  description   VARCHAR(500) NOT NULL,
  category      VARCHAR(255),
  due_day       SMALLINT CHECK (due_day BETWEEN 1 AND 31),
  months        NUMERIC(15,2)[] NOT NULL DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::NUMERIC[],
  actual_months NUMERIC(15,2)[],
  status_months VARCHAR(20)[],
  display_order INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_map_items_map ON map_items(map_id);
CREATE INDEX IF NOT EXISTS idx_map_items_type ON map_items(map_id, type);

-- FINANCIAL ACCOUNTS
CREATE TABLE IF NOT EXISTS financial_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  type            VARCHAR(30) NOT NULL DEFAULT 'conta_corrente',
  institution     VARCHAR(255),
  opening_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CREDIT CARDS
CREATE TABLE IF NOT EXISTS credit_cards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  institution  VARCHAR(255),
  closing_day  SMALLINT,
  due_day      SMALLINT,
  limit_amount NUMERIC(15,2) DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  action       VARCHAR(30) NOT NULL,
  entity       VARCHAR(100) NOT NULL,
  entity_id    UUID,
  old_value    JSONB,
  new_value    JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_ws ON audit_logs(workspace_id, created_at DESC);

-- MONTHLY CLOSINGS
CREATE TABLE IF NOT EXISTS monthly_closings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  map_id          UUID NOT NULL REFERENCES financial_maps(id) ON DELETE CASCADE,
  month           SMALLINT NOT NULL,
  year            SMALLINT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'aberto',
  closing_balance NUMERIC(15,2),
  closed_by       UUID REFERENCES users(id),
  closed_at       TIMESTAMPTZ,
  UNIQUE(map_id, year, month)
);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['workspaces','users','financial_maps','map_items','financial_accounts'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_upd ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_upd BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t);
  END LOOP;
END $$;
