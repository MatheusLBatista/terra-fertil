#!/usr/bin/env bash
#
# Backup do banco (Postgres) em .zip na pasta backup/.
#
#   ./backup.sh            # ou: make backup
#
# Usa o pg_dump de DENTRO do container do banco — é o único jeito de garantir
# que cliente e servidor tenham a mesma versão maior. Sem o container, cai para
# o pg_dump local com o DATABASE_URL do backend/.env, e aí a versão precisa
# bater: um pg_dump 16 contra um servidor 17 aborta sem gerar nada.
#
# O dump é SQL puro com --clean/--if-exists: o restore.sh recria tudo por cima
# do banco alvo. O bucket de arquivos (Garage) NÃO entra no backup.
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE="backend/.env"
[ -f "$ENV_FILE" ] || { echo "erro: $ENV_FILE não encontrado." >&2; exit 1; }

# Conferido ANTES de gerar o dump: descobrir a falta do zip depois de dumpar
# custa o tempo do dump e ainda deixa um .sql solto na pasta.
command -v zip >/dev/null || {
  echo "erro: 'zip' não está instalado (sudo apt install -y zip)." >&2; exit 1; }

# Não usamos `source`: o .env pode ter valores com espaços e comentários.
env_valor() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//'; }

# Os dois composes nomeiam o container do banco pelo CONTAINER_DB do .env:
# o prod (raiz) acrescenta o sufixo _prod, o dev (backend/) usa o nome puro.
# Com os dois no ar, o prod ganha. PG_CONTAINER sobrescreve (nome exato) para
# quem sobe o Postgres fora dos composes.
resolver_container() {
  local base="${PG_CONTAINER:-$(env_valor CONTAINER_DB)}" nome
  [ -n "$base" ] || return 0
  local em_pe; em_pe="$(docker ps --format '{{.Names}}' 2>/dev/null || true)"
  # PG_CONTAINER é exato; CONTAINER_DB tenta o prod (sufixo _prod do
  # docker-compose.prod.yml) antes do dev (backend/docker-compose.yml).
  if [ -n "${PG_CONTAINER:-}" ]; then
    echo "$em_pe" | grep -qx "$base" && echo "$base"
    return 0
  fi
  for nome in "${base}_prod" "$base"; do
    echo "$em_pe" | grep -qx "$nome" && { echo "$nome"; return 0; }
  done
  return 0
}

CONTAINER="$(resolver_container || true)"
PG_USER="$(env_valor POSTGRES_USER)"
PG_DB="$(env_valor POSTGRES_DB)"

mkdir -p backup
STAMP="$(date +%Y%m%d_%H%M%S)"
SQL="backup/${PG_DB}_${STAMP}.sql"
ZIP="backup/${PG_DB}_${STAMP}.zip"

echo "Gerando dump do banco…"
if [ -n "$CONTAINER" ]; then
  echo "  (pg_dump de dentro do container $CONTAINER)"
  docker exec "$CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" \
    --clean --if-exists --no-owner --no-privileges > "$SQL"
else
  echo "  (container do banco não encontrado — usando o pg_dump do host)" >&2
  DATABASE_URL="${DATABASE_URL:-$(env_valor DATABASE_URL)}"
  [ -n "$DATABASE_URL" ] || { echo "erro: DATABASE_URL ausente no $ENV_FILE." >&2; exit 1; }
  pg_dump "$DATABASE_URL" --clean --if-exists --no-owner --no-privileges -f "$SQL"
fi

# Um dump vazio passaria batido e viraria um zip inútil, que só se descobre na
# hora de restaurar. Melhor falhar aqui.
[ -s "$SQL" ] || { echo "erro: o dump saiu vazio — nada foi gravado." >&2; rm -f "$SQL"; exit 1; }

zip -j -q "$ZIP" "$SQL"
rm -f "$SQL"

echo "Backup criado: $ZIP ($(du -h "$ZIP" | cut -f1 | tr -d ' '))"
