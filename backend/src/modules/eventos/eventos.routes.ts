import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import EventosController from "./eventos.controller.ts";

const router = createRouter();
const controller = new EventosController();

// Além da permissão, todo acesso passa pelo ESCOPO do projeto (src/lib/escopo.ts) no service
router.get("/", requireAuth, requirePermission("read", "Evento"), controller.listar);
router.get("/:id", requireAuth, requirePermission("read", "Evento"), controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", "Evento"), controller.inserir);
router.patch("/:id", requireAuth, requirePermission("update", "Evento"), controller.alterar);
router.delete("/:id", requireAuth, requirePermission("delete", "Evento"), controller.excluir);

// Lista de presença — faz parte do evento (substituída inteira pelo PUT)
router.get(
  "/:id/participantes",
  requireAuth,
  requirePermission("read", "Evento"),
  controller.listarParticipantes,
);
router.put(
  "/:id/participantes",
  requireAuth,
  requirePermission("update", "Evento"),
  controller.substituirParticipantes,
);

export default router;
