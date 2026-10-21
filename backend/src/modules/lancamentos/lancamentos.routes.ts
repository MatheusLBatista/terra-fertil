import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import LancamentosController from "./lancamentos.controller.ts";

const router = createRouter();
const controller = new LancamentosController();

// Além da permissão, todo acesso passa pelo ESCOPO do projeto (no service)
const S = "LancamentoFinanceiro";
router.get("/", requireAuth, requirePermission("read", S), controller.listar);
router.get("/:id", requireAuth, requirePermission("read", S), controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", S), controller.inserir);
router.patch("/:id", requireAuth, requirePermission("update", S), controller.alterar);
router.delete("/:id", requireAuth, requirePermission("delete", S), controller.excluir);

export default router;
