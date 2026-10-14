import { createRouter } from "../../lib/hono.ts";
import MunicipiosController from "./municipios.controller.ts";

const router = createRouter();
const controller = new MunicipiosController();

// Dados de referência do IBGE — leitura pública (alimenta comboboxes)
router.get("/", controller.listar);

export default router;
