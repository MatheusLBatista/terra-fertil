import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import ItensController from "./itens.controller.ts";

const router = createRouter();
const controller = new ItensController();

// Catálogo global (sem projeto, sem escopo)
router.get("/", requireAuth, requirePermission("read", "Item"), controller.listar);
router.get("/:id", requireAuth, requirePermission("read", "Item"), controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", "Item"), controller.inserir);
router.patch("/:id", requireAuth, requirePermission("update", "Item"), controller.alterar);
router.delete("/:id", requireAuth, requirePermission("delete", "Item"), controller.excluir);

export default router;
