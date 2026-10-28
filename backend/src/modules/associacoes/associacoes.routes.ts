import { bodyLimit } from "hono/body-limit";
import { createRouter } from "../../lib/hono.ts";
import { errorResponse } from "../../lib/response.ts";
import { MAX_UPLOAD_BYTES } from "../../lib/storage/upload.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import AssociacoesController from "./associacoes.controller.ts";
import { limiteAssinatura } from "../assinaturas/assinaturas.controller.ts";

const router = createRouter();
const controller = new AssociacoesController();

const ler = [requireAuth, requirePermission("read", "Associacao")] as const;
const editar = [requireAuth, requirePermission("update", "Associacao")] as const;
const limiteUpload = bodyLimit({
  maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
  onError: (c) => c.json(errorResponse("Arquivo muito grande. Tamanho máximo: 20 MB"), 413),
});

// Além da permissão, todo acesso passa pelo ESCOPO (src/lib/escopo.ts) no service
router.get("/", ...ler, controller.listar);
router.get("/:id", ...ler, controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", "Associacao"), controller.inserir);
router.patch("/:id", ...editar, controller.alterar);
router.delete("/:id", requireAuth, requirePermission("delete", "Associacao"), controller.excluir);

router.get("/:id/contatos", ...ler, controller.listarContatos);
router.post("/:id/contatos", ...editar, controller.incluirContato);
router.patch("/:id/contatos/:contatoId", ...editar, controller.alterarContato);
router.delete("/:id/contatos/:contatoId", ...editar, controller.excluirContato);

router.get("/:id/documentos", ...ler, controller.listarDocumentos);
router.post("/:id/documentos", ...editar, controller.incluirDocumento);
router.patch("/:id/documentos/:documentoId", ...editar, controller.alterarDocumento);
router.delete("/:id/documentos/:documentoId", ...editar, controller.excluirDocumento);
router.put("/:id/documentos/:documentoId/arquivo", ...editar, limiteUpload, controller.enviarArquivo);
router.get("/:id/documentos/:documentoId/arquivo", ...ler, controller.baixarArquivo);
router.get("/:id/documentos/:documentoId/assinatura", ...ler, controller.assinatura);
router.post("/:id/documentos/:documentoId/assinatura", ...editar, limiteAssinatura, controller.assinar);
router.get("/:id/documentos/:documentoId/assinatura/assinantes", ...ler, controller.assinantes);
router.get("/:id/documentos/:documentoId/assinatura/imagem", ...ler, controller.imagemAssinatura);
router.delete("/:id/documentos/:documentoId/assinatura", ...editar, controller.removerAssinatura);

router.get("/:id/diagnostico", ...ler, controller.diagnostico);
router.put("/:id/diagnostico", ...editar, controller.salvarDiagnostico);

export default router;
