import { createRouter } from "../../lib/hono.ts";
import EstadosController from "./estados.controller.ts";

const router = createRouter();
const controller = new EstadosController();

// Dados de referência do IBGE — leitura pública (alimenta comboboxes)
router.get("/", controller.listar);

export default router;
