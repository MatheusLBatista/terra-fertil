import { bodyLimit } from "hono/body-limit";
import { createRouter } from "../../lib/hono.ts";
import { errorResponse } from "../../lib/response.ts";
import { MAX_UPLOAD_BYTES } from "../../lib/storage/upload.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import VisitasController from "./visitas.controller.ts";

const router = createRouter();
const controller = new VisitasController();

const ler = [requireAuth, requirePermission("read", "Visita")] as const;
const editar = [requireAuth, requirePermission("update", "Visita")] as const;
// Multipart fica fora do limite global de 1 MB: a rota define o seu (folga para os campos do form)
const limiteUpload = bodyLimit({
  maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
  onError: (c) => c.json(errorResponse("Arquivo muito grande. Tamanho máximo: 20 MB"), 413),
});

// Além da permissão, todo acesso passa pelo ESCOPO do projeto da visita (src/lib/escopo.ts) no service
router.get("/", ...ler, controller.listar);
router.get("/:id", ...ler, controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", "Visita"), controller.inserir);
router.patch("/:id", ...editar, controller.alterar);
router.delete("/:id", requireAuth, requirePermission("delete", "Visita"), controller.excluir);

router.get("/:id/equipe", ...ler, controller.listarEquipe);
router.put("/:id/equipe", ...editar, controller.definirEquipe);

router.get("/:id/anexos", ...ler, controller.listarAnexos);
router.post("/:id/anexos", ...editar, limiteUpload, controller.enviarAnexo);
router.get("/:id/anexos/:anexoId/arquivo", ...ler, controller.baixarAnexo);
router.delete("/:id/anexos/:anexoId", ...editar, controller.excluirAnexo);

router.get("/:id/itens-verificados", ...ler, controller.listarItensVerificados);
router.put("/:id/itens-verificados/:entregaId", ...editar, controller.verificarItem);
router.delete("/:id/itens-verificados/:entregaId", ...editar, controller.desfazerVerificacao);

router.get("/:id/diagnostico", ...ler, controller.diagnostico);
router.put("/:id/diagnostico", ...editar, controller.salvarDiagnostico);

export default router;
