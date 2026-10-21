import { bodyLimit } from "hono/body-limit";
import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import { MAX_UPLOAD_BYTES } from "../../lib/storage/upload.ts";
import EntregasController from "./entregas.controller.ts";

const router = createRouter();
const controller = new EntregasController();

// Além da permissão, todo acesso passa pelo ESCOPO de projetos (src/lib/escopo.ts) no service
router.get("/", requireAuth, requirePermission("read", "Entrega"), controller.listar);
router.get("/:id", requireAuth, requirePermission("read", "Entrega"), controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", "Entrega"), controller.inserir);
router.patch("/:id", requireAuth, requirePermission("update", "Entrega"), controller.alterar);
router.delete("/:id", requireAuth, requirePermission("delete", "Entrega"), controller.excluir);

// Termo de uso — arquivo privado; o download passa pela API (proxy autenticado)
router.post(
  "/:id/termo-uso",
  requireAuth,
  requirePermission("update", "Entrega"),
  // multipart fica fora do limite global de 1 MB: o limite do upload é este
  bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024 }),
  controller.enviarTermoUso,
);
router.get("/:id/termo-uso", requireAuth, requirePermission("read", "Entrega"), controller.baixarTermoUso);
router.delete(
  "/:id/termo-uso",
  requireAuth,
  requirePermission("update", "Entrega"),
  controller.removerTermoUso,
);

export default router;
