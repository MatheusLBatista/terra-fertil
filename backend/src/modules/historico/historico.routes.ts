import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import HistoricoController from "./historico.controller.ts";

const router = createRouter();
const controller = new HistoricoController();

router.get("/", requireAuth, requirePermission("read", "HistoricoAlteracao"), controller.listar);
router.get(
  "/tabelas",
  requireAuth,
  requirePermission("read", "HistoricoAlteracao"),
  controller.listarTabelas,
);

export default router;
