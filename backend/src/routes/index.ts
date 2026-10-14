import { createRouter } from "../lib/hono.ts";
import { MODULOS } from "../modules/index.ts";

// Monta cada módulo registrado em src/modules/index.ts (módulo novo entra lá)
const router = createRouter();
for (const { path, routes } of MODULOS) router.route(path, routes);

export default router;
