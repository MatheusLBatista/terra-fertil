import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { env } from "@/lib/env";

export const authClient = createAuthClient({
  baseURL: env.API_URL,
  basePath: "/auth",
  plugins: [
    // Espelha o plugin `admin` do backend: lista/cria/bane usuários e troca o
    // papel (`user.role`, FK para `papeis.nome`) na tela /usuarios.
    adminClient(),
  ],
});
