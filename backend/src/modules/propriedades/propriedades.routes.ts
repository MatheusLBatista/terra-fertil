import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import PropriedadesController from "./propriedades.controller.ts";

const router = createRouter();
const controller = new PropriedadesController();

// Dado compartilhado entre projetos: o service limita pelo escopo da associação
router.get("/", requireAuth, requirePermission("read", "Propriedade"), controller.listar);
router.get("/:id", requireAuth, requirePermission("read", "Propriedade"), controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", "Propriedade"), controller.inserir);
router.patch("/:id", requireAuth, requirePermission("update", "Propriedade"), controller.alterar);
router.delete("/:id", requireAuth, requirePermission("delete", "Propriedade"), controller.excluir);

export default router;
