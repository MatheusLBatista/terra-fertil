import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import TiposDocumentoController from "./tiposDocumento.controller.ts";

const router = createRouter();
const controller = new TiposDocumentoController();

// Catálogo global (sem projeto, sem escopo)
router.get("/", requireAuth, requirePermission("read", "TipoDocumento"), controller.listar);
router.get("/:id", requireAuth, requirePermission("read", "TipoDocumento"), controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", "TipoDocumento"), controller.inserir);
router.patch("/:id", requireAuth, requirePermission("update", "TipoDocumento"), controller.alterar);
router.delete("/:id", requireAuth, requirePermission("delete", "TipoDocumento"), controller.excluir);

export default router;
