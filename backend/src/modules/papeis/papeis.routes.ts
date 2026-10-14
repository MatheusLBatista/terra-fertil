import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import PapeisController from "./papeis.controller.ts";

const router = createRouter();
const controller = new PapeisController();

// Administração do RBAC — no seed, apenas o admin tem permissões sobre "Papel"
router.get("/", requireAuth, requirePermission("read", "Papel"), controller.listar);
router.get("/:id", requireAuth, requirePermission("read", "Papel"), controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", "Papel"), controller.inserir);
router.patch("/:id", requireAuth, requirePermission("update", "Papel"), controller.alterar);
router.put(
  "/:id/permissoes",
  requireAuth,
  requirePermission("update", "Papel"),
  controller.substituirPermissoes,
);
router.post("/:id/reativar", requireAuth, requirePermission("update", "Papel"), controller.reativar);
router.delete("/:id", requireAuth, requirePermission("delete", "Papel"), controller.excluir);

export default router;
