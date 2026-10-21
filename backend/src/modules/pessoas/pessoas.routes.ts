import { createRouter } from "../../lib/hono.ts";
import { requireAuth } from "../../middlewares/requireAuth.ts";
import { requirePermission } from "../../middlewares/requirePermission.ts";
import PessoasController from "./pessoas.controller.ts";

const router = createRouter();
const controller = new PessoasController();

router.get("/", requireAuth, requirePermission("read", "Pessoa"), controller.buscar);
router.post("/", requireAuth, requirePermission("create", "Pessoa"), controller.inserir);

export default router;
