import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import PedidosCompraController from "./pedidosCompra.controller.ts";

const router = createRouter();
const controller = new PedidosCompraController();

// Além da permissão, todo acesso passa pelo ESCOPO de projetos (src/lib/escopo.ts) no service
router.get("/", requireAuth, requirePermission("read", "PedidoCompra"), controller.listar);
router.get("/:id", requireAuth, requirePermission("read", "PedidoCompra"), controller.listarPorId);
router.post("/", requireAuth, requirePermission("create", "PedidoCompra"), controller.inserir);
router.patch("/:id", requireAuth, requirePermission("update", "PedidoCompra"), controller.alterar);
router.delete("/:id", requireAuth, requirePermission("delete", "PedidoCompra"), controller.excluir);

export default router;
