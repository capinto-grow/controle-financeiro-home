#!/usr/bin/env python3
"""
=======================================================
CONTROLE FINANCEIRO HOME — Script de Deploy Automático
=======================================================
Este script:
  1. Cria o repositório no GitHub
  2. Faz o upload de todos os arquivos
  3. Exibe o link para deploy no Railway

COMO EXECUTAR:
  1. Abra o Terminal (Cmd+Espaço → "Terminal")
  2. Arraste esta pasta para o Terminal (ou cd até ela)
  3. Execute: python3 DEPLOY.py
=======================================================
"""

import os, json, base64, urllib.request, urllib.error, getpass, sys

GITHUB_USER = "capinto-grow"
REPO_NAME   = "controle-financeiro-home"

BANNER = """
╔══════════════════════════════════════════════════╗
║     CONTROLE FINANCEIRO HOME — DEPLOY v2.0       ║
║     GitHub: capinto-grow                         ║
╚══════════════════════════════════════════════════╝
"""

def gh_request(path, method="GET", data=None, token=None):
    url = f"https://api.github.com{path}"
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "CFH-Deploy/1.0",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read()), r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:    return json.loads(body), e.code
        except: return {"message": body}, e.code

def encode_file(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

def main():
    print(BANNER)
    print("Este script vai:")
    print("  ✅ Criar o repositório 'controle-financeiro-home' no seu GitHub")
    print("  ✅ Fazer upload de todos os arquivos do projeto")
    print("  ✅ Exibir o link para deploy no Railway (gratuito)\n")

    # ── Step 1: GitHub Token ─────────────────────────────────────
    print("=" * 52)
    print("PASSO 1: Token de Acesso do GitHub")
    print("=" * 52)
    print("\nVocê precisa criar um Personal Access Token no GitHub.")
    print("Abra este link no navegador:\n")
    print("  👉 https://github.com/settings/tokens/new")
    print("\nConfigurações do token:")
    print("  • Note: CFH Deploy")
    print("  • Expiration: 90 days")
    print("  • Scopes: marque ✅ 'repo' (primeira opção)")
    print("\nClique em 'Generate token' e COPIE o token (começa com ghp_)")
    print()
    token = getpass.getpass("Cole aqui o seu token (não aparece ao digitar): ").strip()

    if not token or not token.startswith("ghp_"):
        print("\n⚠️  Token inválido. Deve começar com 'ghp_'")
        print("Tente novamente executando: python3 DEPLOY.py")
        sys.exit(1)

    # Verifica token
    print("\n🔍 Verificando token...")
    user_data, status = gh_request("/user", token=token)
    if status != 200:
        print(f"❌ Token inválido: {user_data.get('message','')}")
        sys.exit(1)
    print(f"✅ Autenticado como: {user_data['login']}")

    # ── Step 2: Criar repositório ────────────────────────────────
    print("\n" + "=" * 52)
    print("PASSO 2: Criando repositório no GitHub")
    print("=" * 52)

    repo_data, status = gh_request(
        f"/repos/{GITHUB_USER}/{REPO_NAME}", token=token
    )
    if status == 200:
        print(f"ℹ️  Repositório já existe: {repo_data['html_url']}")
        repo_url = repo_data["html_url"]
    else:
        print(f"📁 Criando: {GITHUB_USER}/{REPO_NAME}...")
        new_repo, status = gh_request("/user/repos", method="POST", token=token, data={
            "name": REPO_NAME,
            "description": "Controle Financeiro Home — Sistema financeiro pessoal/familiar SaaS-ready",
            "private": False,
            "auto_init": False,
        })
        if status not in (200, 201):
            print(f"❌ Erro ao criar repositório: {new_repo.get('message','')}")
            sys.exit(1)
        repo_url = new_repo["html_url"]
        print(f"✅ Repositório criado: {repo_url}")

    # ── Step 3: Upload dos arquivos ──────────────────────────────
    print("\n" + "=" * 52)
    print("PASSO 3: Enviando arquivos para o GitHub")
    print("=" * 52)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    IGNORE = {"node_modules", ".git", ".DS_Store", "__pycache__", ".env", "package-lock.json"}
    IGNORE_EXT = {".pyc"}

    files_to_upload = []
    for root, dirs, files in os.walk(script_dir):
        dirs[:] = [d for d in dirs if d not in IGNORE]
        for fname in files:
            if fname in IGNORE or fname.endswith(tuple(IGNORE_EXT)): continue
            if fname == "DEPLOY.py": continue
            full = os.path.join(root, fname)
            rel  = os.path.relpath(full, script_dir)
            files_to_upload.append((rel, full))

    print(f"📦 {len(files_to_upload)} arquivos para enviar...\n")
    ok = 0
    for rel_path, full_path in files_to_upload:
        rel_path = rel_path.replace(os.sep, "/")
        try:
            content = encode_file(full_path)
        except Exception as e:
            print(f"  ⚠️  Ignorando {rel_path}: {e}")
            continue

        # Check if file exists to get SHA
        existing, _ = gh_request(f"/repos/{GITHUB_USER}/{REPO_NAME}/contents/{rel_path}", token=token)
        sha = existing.get("sha") if isinstance(existing, dict) else None

        payload = {
            "message": f"feat: add {rel_path}",
            "content": content,
        }
        if sha:
            payload["sha"] = sha

        _, st = gh_request(
            f"/repos/{GITHUB_USER}/{REPO_NAME}/contents/{rel_path}",
            method="PUT", token=token, data=payload
        )
        status_icon = "✅" if st in (200, 201) else "❌"
        print(f"  {status_icon} {rel_path}")
        if st in (200, 201): ok += 1

    print(f"\n✅ {ok}/{len(files_to_upload)} arquivos enviados!")

    # ── Step 4: Instruções Railway ───────────────────────────────
    print("\n" + "=" * 52)
    print("PASSO 4: Deploy no Railway (PostgreSQL + Hosting GRÁTIS)")
    print("=" * 52)
    print(f"""
Seu código está em: {repo_url}

Agora siga estes 6 passos no Railway:

1. Acesse: https://railway.app
2. Clique em "Start a New Project"
3. Escolha "Deploy from GitHub repo"
4. Conecte sua conta GitHub (capinto-grow)
5. Selecione o repositório: {REPO_NAME}
6. Clique em "+ New" → "Database" → "Add PostgreSQL"

⚙️  Após o deploy, configure as variáveis de ambiente:
   Settings → Variables → Add Variable:
   
   DATABASE_URL  → (copiado do PostgreSQL, já fica automático!)
   JWT_SECRET    → cfhome_super_secret_2026_!@#
   NODE_ENV      → production

7. Vá em "Settings" → "Domains" → "Generate Domain"
   → Você receberá uma URL como: controle-financeiro-home.up.railway.app

8. Após o primeiro deploy, execute o seed (uma única vez):
   No Railway, clique em "New Service" → "Command"
   Execute: node src/seed.js

📌 URL do seu repositório: {repo_url}
🚀 URL do Railway: https://railway.app/new
    """)
    print("=" * 52)
    print("🎉 CONCLUÍDO! Siga os passos acima no Railway.")
    print("=" * 52)

if __name__ == "__main__":
    main()
