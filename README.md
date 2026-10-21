# template-ia

API (`backend/`) e painel (`frontend/`) para novos projetos. Pré-requisitos: Bun, Node 24 e Docker.

## 1. Editar o `.env` do backend

```bash
cp backend/.env.example backend/.env
```

O `backend/.env.example` explica cada variável. O essencial:

- `BETTER_AUTH_SECRET`: gere com `openssl rand -hex 32`
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` e `POSTGRES_PORT`: banco de dev (`docker-compose.yml` da raiz)
- `API_URL` e `FRONTEND_URL`: URLs da API e do painel
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `ADMIN_NAME`: conta admin do seed. Em branco, vale `fslab.vilhena@ifro.edu.br` / `102030fs`.

Integrações opcionais (Google, Garage/S3, FS-Mail, OpenObserve) ficam em branco para ficarem desligadas.

## 2. Editar o `.env` do frontend

```bash
cp frontend/.env.example frontend/.env.local
```

- `NEXT_PUBLIC_API_URL`: URL da API (ex.: `http://localhost:3080`)
- `NEXT_PUBLIC_APP_URL`: URL do painel (ex.: `http://localhost:3000`)
- Opcionais: nome do app, ambiente, tema, fuso e tamanhos de página (veja `frontend/.env.example`).

## 3. Usar os comandos do `package.json`

Rode na raiz:

| Comando | O que faz |
|---|---|
| `bun run setup` | Instala os dois apps, sobe o Postgres e recria o banco (migrations + seeds) |
| `bun run dev:api` | API em `:3080` (docs em `/docs`) |
| `bun run dev:front` | Painel em `:3000` |
| `bun run db:up` / `bun run db:down` | Sobe ou derruba o Postgres de dev e o de testes (dados em `data/`) |
| `bun run db:reset` | Recria o banco de dev |
| `bun run check` | Typecheck, lint e testes unitários |
| `bun run types` | Regenera `backend/openapi.json` e `frontend/types/api.d.ts` |
| `bun run test:integration` | Testes de integração (antes: `bun run db:test:up`) |
| `bun run e2e` / `bun run ui:verify` | Testes ponta a ponta e verificação visual (API e painel no ar) |
