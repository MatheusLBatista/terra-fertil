import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import MetasController from "./metas.controller.ts";

const router = createRouter();
const controller = new MetasController();

// Além da permissão, todo acesso passa pelo ESCOPO do projeto da meta (no service).
// Rotas estáticas antes de "/:id".
router.get("/", requireAuth, requirePermission("read", "Meta"), controller.listar);
router.get("/chaves", requireAuth, requirePermission("read", "Meta"), controller.chaves);

// Indicadores e etapas (contam como alteração da meta)
router.patch(
  "/indicadores/:indicadorId",
  requireAuth,
  requirePermission("update", "Meta"),
  controller.alterarIndicador,
);
router.delete(
  "/indicadores/:indicadorId",
  requireAuth,
  requirePermission("update", "Meta"),
  controller.excluirIndicador,
);
router.post(
  "/indicadores/:indicadorId/etapas",
  requireAuth,
  requirePermission("update", "Meta"),
  controller.inserirEtapa,
);
router.patch("/etapas/:etapaId", requireAuth, requirePermission("update", "Meta"), controller.alterarEtapa);
router.put(
  "/etapas/:etapaId/quantidade",
  requireAuth,
  requirePermission("update", "Meta"),
  controller.registrarQuantidade,
);
router.delete("/etapas/:etapaId", requireAuth, requirePermission("update", "Meta"), controller.excluirEtapa);

router.get("/:id", requireAuth, requirePermission("read", "Meta"), controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", "Meta"), controller.inserir);
router.patch("/:id", requireAuth, requirePermission("update", "Meta"), controller.alterar);
router.delete("/:id", requireAuth, requirePermission("delete", "Meta"), controller.excluir);
router.post(
  "/:id/indicadores",
  requireAuth,
  requirePermission("update", "Meta"),
  controller.inserirIndicador,
);

export default router;
