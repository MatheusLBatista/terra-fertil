import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import ProdutoresController from "./produtores.controller.ts";

const router = createRouter();
const controller = new ProdutoresController();

// Dado compartilhado entre projetos: o service limita pelo escopo (associação das
// propriedades) ou por quem cadastrou
router.get("/", requireAuth, requirePermission("read", "Produtor"), controller.listar);
router.get("/:id", requireAuth, requirePermission("read", "Produtor"), controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", "Produtor"), controller.inserir);
router.patch("/:id", requireAuth, requirePermission("update", "Produtor"), controller.alterar);
router.post("/:id/reativar", requireAuth, requirePermission("update", "Produtor"), controller.reativar);
router.delete("/:id", requireAuth, requirePermission("delete", "Produtor"), controller.excluir);

export default router;
