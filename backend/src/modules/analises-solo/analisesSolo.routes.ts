import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import AnalisesSoloController from "./analisesSolo.controller.ts";

const router = createRouter();
const controller = new AnalisesSoloController();

// Além da permissão, todo acesso passa pelo ESCOPO de projetos (src/lib/escopo.ts) no service
router.get("/", requireAuth, requirePermission("read", "AnaliseSolo"), controller.listar);
router.get("/:id", requireAuth, requirePermission("read", "AnaliseSolo"), controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", "AnaliseSolo"), controller.inserir);
router.patch("/:id", requireAuth, requirePermission("update", "AnaliseSolo"), controller.alterar);
router.put("/:id/laudo", requireAuth, requirePermission("update", "AnaliseSolo"), controller.registrarLaudo);
router.delete("/:id", requireAuth, requirePermission("delete", "AnaliseSolo"), controller.excluir);

export default router;
