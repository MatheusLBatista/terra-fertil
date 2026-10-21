import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import OpcoesDiagnosticoController from "./opcoesDiagnostico.controller.ts";

const router = createRouter();
const controller = new OpcoesDiagnosticoController();

// Catálogo global (sem projeto, sem escopo)
router.get("/", requireAuth, requirePermission("read", "OpcaoDiagnostico"), controller.listar);
router.get("/:id", requireAuth, requirePermission("read", "OpcaoDiagnostico"), controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", "OpcaoDiagnostico"), controller.inserir);
router.patch("/:id", requireAuth, requirePermission("update", "OpcaoDiagnostico"), controller.alterar);
router.delete("/:id", requireAuth, requirePermission("delete", "OpcaoDiagnostico"), controller.excluir);

export default router;
