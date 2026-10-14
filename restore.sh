#!/usr/bin/env bash
#
# Restaura um backup gerado pelo backup.sh por cima do banco.
#
#   ./restore.sh                          # usa o .zip mais recente de backup/
#   ./restore.sh backup/db_template_20260923_120000.zip
#   ./restore.sh -y [arquivo.zip]         # sem confirmação (uso em script)
#
# O dump é --clean: TUDO no banco alvo é dropado e recriado. As conexões
# abertas (API rodando) são derrubadas antes, senão os DROPs ficariam presos.
# Para restaurar em OUTRO banco da mesma instância, defina RESTORE_DB=<nome>.
#
# Como o backup.sh, usa o psql de DENTRO do container do banco quando ele está
# de pé; senão, o psql local — que precisa ter a mesma versão maior do servidor.
set -euo pipefail
cd "$(dirname "$0")"

CONFIRMADO="nao"
if [ "${1:-}" = "-y" ]; then CONFIRMADO="sim"; shift; fi

ZIP="${1:-}"
if [ -z "$ZIP" ]; then
  ZIP="$(ls -t backup/*.zip 2>/dev/null | head -1 || true)"
  [ -n "$ZIP" ] || { echo "erro: nenhum .zip em backup/ — rode ./backup.sh antes." >&2; exit 1; }
fi
[ -f "$ZIP" ] || { echo "erro: arquivo '$ZIP' não encontrado." >&2; exit 1; }

command -v unzip >/dev/null || {
  echo "erro: 'unzip' não está instalado (sudo apt install -y unzip)." >&2; exit 1; }

ENV_FILE="backend/.env"
[ -f "$ENV_FILE" ] || { echo "erro: $ENV_FILE não encontrado." >&2; exit 1; }
env_valor() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//'; }

# Mesmo critério do backup.sh: CONTAINER_DB_prod, depois CONTAINER_DB (ou PG_CONTAINER exato).
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
PG_DB="${RESTORE_DB:-$(env_valor POSTGRES_DB)}"

if [ "$CONFIRMADO" != "sim" ]; then
  echo "Restaurar '$ZIP' por cima do banco '$PG_DB'."
  echo "TODOS os dados atuais desse banco serão substituídos."
  read -r -p "Digite 'sim' para continuar: " RESPOSTA
  [ "$RESPOSTA" = "sim" ] || { echo "Cancelado."; exit 1; }
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
unzip -q "$ZIP" -d "$TMP"
DUMP="$(ls "$TMP"/*.sql | head -1)"
[ -n "$DUMP" ] || { echo "erro: o zip não contém um .sql." >&2; exit 1; }

DERRUBAR_CONEXOES="select pg_terminate_backend(pid) from pg_stat_activity
  where datname = '$PG_DB' and pid <> pg_backend_pid();"

echo "Restaurando…"
if [ -n "$CONTAINER" ]; then
  echo "  (psql de dentro do container $CONTAINER)"
  docker exec "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -q \
    -c "$DERRUBAR_CONEXOES" >/dev/null
  docker exec -i "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -q \
    -v ON_ERROR_STOP=1 -f - < "$DUMP" >/dev/null
else
  DATABASE_URL="${DATABASE_URL:-$(env_valor DATABASE_URL)}"
  psql "$DATABASE_URL" -q -c "$DERRUBAR_CONEXOES" >/dev/null
  psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$DUMP" >/dev/null
fi

echo "Restauração concluída a partir de: $ZIP"
