#!/usr/bin/env bash
#
# Troca as imagens do QA. Roda NA VM, mandado por ssh pelo job `deploy-qa` do
# .gitlab-ci.yml, que antes copia o docker-compose.qa.yml para ~/$DEPLOY_DIR e faz o
# `docker login` no Harbor.
#
#   IMAGE_TAG=<commit curto> DEPLOY_DIR=template-ia REGISTRY=registry.fslab.dev \
#     IMAGENS=registry.fslab.dev/template-ia-qa bash -s < ci/deploy-qa.sh
#
# 1. Backup do banco (pg_dump de dentro do container, gzip) em backup/pre-deploy-*.sql.gz,
#    guardando os 10 últimos — restaurar: gunzip -c <arquivo> | docker exec -i <db> psql ...
# 2. Pull das imagens do commit e `up -d`: o `migrate` aplica migrations, trigger e seeds
#    antes da API subir.
# 3. Espera a API ficar saudável; registra a versão em VERSAO e apaga as imagens de commits
#    anteriores (na VM ficam só o compose, o .env, o banco e os backups).
set -euo pipefail
: "${IMAGE_TAG:?informe IMAGE_TAG}" "${DEPLOY_DIR:?informe DEPLOY_DIR}"
: "${REGISTRY:?informe REGISTRY}" "${IMAGENS:?informe IMAGENS}"
export IMAGE_TAG IMAGENS
cd ~/"$DEPLOY_DIR"
test -f backend/.env || { echo "Falta ~/$DEPLOY_DIR/backend/.env na VM" >&2; exit 1; }

COMPOSE="docker compose --env-file backend/.env -f docker-compose.qa.yml"
passo() { printf '\n▶ %s\n' "$*"; }

# As credenciais do Harbor não ficam na VM depois do deploy
trap 'docker logout "$REGISTRY" >/dev/null 2>&1 || true' EXIT
trap 'echo; echo "✖ Falhou — últimos logs:"; $COMPOSE logs --tail=60 migrate api 2>/dev/null || true' ERR

passo "Backup do banco"
mkdir -p backup
DB_ID=$($COMPOSE ps -q db 2>/dev/null || true)
if [ -n "$DB_ID" ]; then
  ARQ="backup/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ)-$IMAGE_TAG.sql.gz"
  docker exec "$DB_ID" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' | gzip > "$ARQ"
  echo "  $ARQ ($(du -h "$ARQ" | cut -f1))"
  ls -1t backup/pre-deploy-*.sql.gz | tail -n +11 | xargs -r rm -f
else
  echo "  banco fora do ar — sem backup (primeira subida?)"
fi

passo "Imagens $IMAGE_TAG"
$COMPOSE pull --quiet

passo "Subindo (o migrate roda antes da API)"
$COMPOSE up -d --remove-orphans

passo "Esperando a API"
API_ID=$($COMPOSE ps -q api)
ESTADO=""
for _ in $(seq 1 60); do
  ESTADO=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$API_ID")
  [ "$ESTADO" = "healthy" ] && break
  sleep 5
done
[ "$ESTADO" = "healthy" ] || { echo "  API não ficou saudável (estado: $ESTADO)"; false; }
echo "  API saudável"

echo "$IMAGE_TAG $(date -u +%Y-%m-%dT%H:%M:%SZ) (imagens do Harbor)" > VERSAO
# Só as imagens do commit no ar ficam na VM; voltar a uma anterior é um pull do Harbor
docker images --format '{{.Repository}}:{{.Tag}}' | grep "^$IMAGENS/" |
  grep -v ":$IMAGE_TAG\$" | xargs -r docker rmi >/dev/null || true
docker image prune -f >/dev/null
$COMPOSE ps --format 'table {{.Name}}\t{{.Image}}\t{{.Status}}'
