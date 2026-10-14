#!/usr/bin/env bash
# Cria um projeto novo a partir do template.
#
#   make init NOME=meu-app [PORTA_API=3080 PORTA_DB=5432]
#   ./scripts/init.sh meu-app [porta-api] [porta-db]
#
# 1. Renomeia os identificadores do template (slug, snake_case, título,
#    nomes de container/banco/usuário) nos arquivos listados na saída.
# 2. Ajusta as portas da API e do Postgres nos .env.example (opcional).
# 3. Cria backend/.env e frontend/.env.local a partir dos exemplos (se não
#    existirem) e gera BETTER_AUTH_SECRET com `openssl rand -hex 32`.
#    Dependências, banco e seeds ficam para o `make setup` logo em seguida.
# 4. `git init` se a pasta ainda não for um repositório.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SLUG="${1:-}"
PORTA_API="${2:-}"
PORTA_DB="${3:-}"

erro() { echo "✖ $*" >&2; exit 1; }

[[ -n "$SLUG" ]] || erro "informe o nome: make init NOME=meu-app"
[[ "$SLUG" =~ ^[a-z][a-z0-9-]{1,39}$ ]] || erro "NOME inválido '$SLUG' — use kebab-case: letras minúsculas, dígitos e hífen (ex.: meu-app)"
[[ "$SLUG" != "template-ia" ]] || erro "escolha um nome diferente de template-ia"
[[ -z "$PORTA_API" || "$PORTA_API" =~ ^[0-9]{2,5}$ ]] || erro "PORTA_API inválida: $PORTA_API"
[[ -z "$PORTA_DB"  || "$PORTA_DB"  =~ ^[0-9]{2,5}$ ]] || erro "PORTA_DB inválida: $PORTA_DB"
command -v openssl >/dev/null || erro "openssl não encontrado (necessário para gerar BETTER_AUTH_SECRET)"
command -v perl    >/dev/null || erro "perl não encontrado"

SNAKE="${SLUG//-/_}"
# "meu-app" → "Meu App"
TITULO="$(echo "$SLUG" | tr '-' ' ' | perl -pe 's/\b(\w)/\U$1/g')"

echo "▶ Projeto: $SLUG  (snake: $SNAKE, título: \"$TITULO\")"

# ── 1. Renomear identificadores ───────────────────────────────────────────────
# Ordem importa: os nomes mais específicos (db_template_ia, template-ia-dev)
# antes dos genéricos (db_template, template-ia).
ARQUIVOS="$(grep -rlE 'template-ia|template_ia|Template IA|db_template|user_template|api_template|front_template' . \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=data --exclude-dir=logs \
  --exclude-dir=backup --exclude-dir=.next --exclude-dir=dist --exclude-dir=drizzle \
  --exclude=package-lock.json --exclude=openapi.json --exclude=api.d.ts --exclude='*.png' \
  --exclude=melhorias.html --exclude=relatorio.html --exclude=init.sh --exclude=.env --exclude=.env.local || true)"

if [[ -z "$ARQUIVOS" ]]; then
  echo "  (nenhum identificador do template encontrado — já renomeado?)"
else
  echo "$ARQUIVOS" | while read -r f; do
    perl -pi -e "
      s/db_template_ia/db_${SNAKE}/g;
      s/template-ia-dev/${SLUG}-dev/g;
      s/db_template/db_${SNAKE}/g;
      s/user_template/user_${SNAKE}/g;
      s/api_template/api_${SNAKE}/g;
      s/front_template/front_${SNAKE}/g;
      s/template_ia/${SNAKE}/g;
      s/template-ia/${SLUG}/g;
      s/Template IA/${TITULO}/g;
    " "$f"
    echo "  ~ $f"
  done
fi

# ── 2. Portas ─────────────────────────────────────────────────────────────────
if [[ -n "$PORTA_API" ]]; then
  perl -pi -e "s/localhost:3080/localhost:${PORTA_API}/g; s/^API_PORT=3080/API_PORT=${PORTA_API}/" backend/.env.example
  perl -pi -e "s/localhost:3080/localhost:${PORTA_API}/g" frontend/.env.example
  echo "  ~ porta da API: $PORTA_API (backend/.env.example, frontend/.env.example)"
fi
if [[ -n "$PORTA_DB" ]]; then
  perl -pi -e "s/localhost:5432/localhost:${PORTA_DB}/g; s/^POSTGRES_PORT=5432/POSTGRES_PORT=${PORTA_DB}/" backend/.env.example
  echo "  ~ porta do Postgres: $PORTA_DB (backend/.env.example)"
fi

# ── 3. .env ───────────────────────────────────────────────────────────────────
if [[ -f backend/.env ]]; then
  echo "  = backend/.env já existe — mantido (BETTER_AUTH_SECRET não foi alterado)"
else
  cp backend/.env.example backend/.env
  SEGREDO="$(openssl rand -hex 32)"
  perl -pi -e "s/^BETTER_AUTH_SECRET=.*/BETTER_AUTH_SECRET=${SEGREDO}/" backend/.env
  echo "  + backend/.env criado (BETTER_AUTH_SECRET gerado)"
fi
if [[ -f frontend/.env.local ]]; then
  echo "  = frontend/.env.local já existe — mantido"
else
  cp frontend/.env.example frontend/.env.local
  perl -pi -e "s/^NEXT_PUBLIC_APP_NOME=.*/NEXT_PUBLIC_APP_NOME=${TITULO}/" frontend/.env.local
  echo "  + frontend/.env.local criado (NEXT_PUBLIC_APP_NOME=${TITULO})"
fi

# ── 4. git ────────────────────────────────────────────────────────────────────
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "  = já é um repositório git"
else
  git init -q
  echo "  + git init"
fi

cat <<EOF

✓ Projeto "$SLUG" pronto. Próximos passos:

  1. Revise backend/.env (banco, ADMIN_*, integrações) e frontend/.env.local
  2. make setup        (npm ci nos dois apps, Postgres de dev e db:reset)
  3. make dev-api      (API :3080)  e, em outro terminal,  make dev-front  (painel :3000)
  4. git add -A && git commit -m "chore: projeto $SLUG a partir do template"

Login demo: admin@example.com / 102030fs
EOF
