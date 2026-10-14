import { z } from "zod";
import { OpenAPIRegistry, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

/**
 * Registry global do OpenAPI. Cada módulo registra seus schemas e paths no
 * próprio `<entidade>.schema.ts`, e o `app.ts` importa os módulos por efeito
 * colateral antes de gerar o documento.
 */
export const registry = new OpenAPIRegistry();
