import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import RecomendacoesController from "./recomendacoes.controller.ts";

const router = createRouter();
const controller = new RecomendacoesController();

// Recomendação é parte do atendimento: mesmo subject da visita. O escopo vem do projeto da visita (service)
router.get("/", requireAuth, requirePermission("read", "Visita"), controller.listar);
router.get("/:id", requireAuth, requirePermission("read", "Visita"), controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", "Visita"), controller.inserir);
router.patch("/:id", requireAuth, requirePermission("update", "Visita"), controller.alterar);
router.delete("/:id", requireAuth, requirePermission("delete", "Visita"), controller.excluir);

export default router;
