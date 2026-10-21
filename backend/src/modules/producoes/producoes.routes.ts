import { bodyLimit } from "hono/body-limit";
import { createRouter } from "../../lib/hono.ts";
import { AppError } from "../../lib/appError.ts";
import { MAX_UPLOAD_BYTES } from "../../lib/storage/upload.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import ProducoesController from "./producoes.controller.ts";

const router = createRouter();
const controller = new ProducoesController();

// Multipart fica fora do limite global de 1 MB — o upload define o seu (folga para o envelope do form)
const limiteUpload = bodyLimit({
  maxSize: MAX_UPLOAD_BYTES + 1024 * 1024,
  onError: () => {
    throw new AppError(`Arquivo muito grande. Tamanho máximo: ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`, 413);
  },
});

// Além da permissão, todo acesso passa pelo ESCOPO do projeto (src/lib/escopo.ts) no service
router.get("/", requireAuth, requirePermission("read", "Producao"), controller.listar);
router.get("/:id", requireAuth, requirePermission("read", "Producao"), controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", "Producao"), controller.inserir);
router.patch("/:id", requireAuth, requirePermission("update", "Producao"), controller.alterar);
router.delete("/:id", requireAuth, requirePermission("delete", "Producao"), controller.excluir);

// Arquivo privado: entra pela API e sai por proxy autenticado (o cliente nunca fala com o bucket)
router.post(
  "/:id/arquivo",
  requireAuth,
  requirePermission("update", "Producao"),
  limiteUpload,
  controller.enviarArquivo,
);
router.get("/:id/arquivo", requireAuth, requirePermission("read", "Producao"), controller.baixarArquivo);
router.delete(
  "/:id/arquivo",
  requireAuth,
  requirePermission("update", "Producao"),
  controller.removerArquivo,
);

export default router;
