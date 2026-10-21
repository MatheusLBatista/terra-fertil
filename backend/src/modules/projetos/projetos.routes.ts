import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import ProjetosController from "./projetos.controller.ts";

const router = createRouter();
const controller = new ProjetosController();

// Além da permissão, todo acesso passa pelo ESCOPO (src/lib/escopo.ts) no service
router.get("/", requireAuth, requirePermission("read", "Projeto"), controller.listar);
router.get("/:id", requireAuth, requirePermission("read", "Projeto"), controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", "Projeto"), controller.inserir);
router.patch("/:id", requireAuth, requirePermission("update", "Projeto"), controller.alterar);
router.delete("/:id", requireAuth, requirePermission("delete", "Projeto"), controller.excluir);

// Equipe — define quem enxerga o projeto
router.get("/:id/equipe", requireAuth, requirePermission("read", "Projeto"), controller.listarEquipe);
router.post("/:id/equipe", requireAuth, requirePermission("update", "Projeto"), controller.incluirMembro);
router.patch(
  "/:id/equipe/:membroId",
  requireAuth,
  requirePermission("update", "Projeto"),
  controller.alterarMembro,
);
router.delete(
  "/:id/equipe/:membroId",
  requireAuth,
  requirePermission("update", "Projeto"),
  controller.excluirMembro,
);

// Adesões — dado da associação no projeto (o técnico registra junto com a associação)
router.get(
  "/:id/associacoes",
  requireAuth,
  requirePermission("read", "Associacao"),
  controller.listarAdesoes,
);
router.post(
  "/:id/associacoes",
  requireAuth,
  requirePermission("update", "Associacao"),
  controller.incluirAdesao,
);
router.patch(
  "/:id/associacoes/:adesaoId",
  requireAuth,
  requirePermission("update", "Associacao"),
  controller.alterarAdesao,
);
router.delete(
  "/:id/associacoes/:adesaoId",
  requireAuth,
  requirePermission("update", "Associacao"),
  controller.excluirAdesao,
);

export default router;
