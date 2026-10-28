import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import DashboardController from "./dashboard.controller.ts";

const router = createRouter();
const controller = new DashboardController();

// Sem subject próprio: a gestão lê as metas do projeto; o técnico, as visitas dele.
// O escopo de projetos vale nos dois (service).
router.get("/gestao", requireAuth, requirePermission("read", "Meta"), controller.gestao);
router.get("/tecnico", requireAuth, requirePermission("read", "Visita"), controller.tecnico);

export default router;
