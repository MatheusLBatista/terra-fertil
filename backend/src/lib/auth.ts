import { betterAuth } from "better-auth";
import { admin, openAPI } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.ts";
import { env } from "./env.ts";
import { sendEmail } from "./mail/fsmail.ts";

const isProd = env.NODE_ENV === "production";

// Login social com Google — só registrado quando as credenciais existem
// (em branco no .env = recurso desligado, como as demais integrações).
const googleHabilitado = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

// Cadastro público (AUTH_SIGNUP_ENABLED): vale para e-mail/senha e para o
// primeiro login social. Desligado, contas só nascem pelo admin (plugin admin)
// ou pelo seed — usuário que já existe continua logando normalmente.
const cadastroBloqueado = !env.AUTH_SIGNUP_ENABLED;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),

  socialProviders: googleHabilitado
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
          disableSignUp: cadastroBloqueado,
        },
      }
    : {},

  // Login com email e senha — política de senha explícita (o front valida o
  // mesmo mínimo; a mensagem PASSWORD_TOO_SHORT é traduzida em lib/authErros.ts)
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    disableSignUp: cadastroBloqueado,
    requireEmailVerification: false,
    autoSignIn: true,
    sendResetPassword: async ({ user, token }) => {
      await sendEmail({
        to: user.email,
        subject: "Defina sua senha de acesso",
        text: `Clique no link para definir sua senha: ${env.FRONTEND_URL}/definir-senha?token=${token}`,
      });
    },
  },

  // Política de sessão: 7 dias de validade, renovada quando usada após 1 dia.
  // cookieCache: a sessão/usuário vai num cookie assinado por 5 min — o
  // `getSession` do requireAuth não toca o banco dentro desse prazo (troca de
  // papel/ban leva até 5 min para refletir; revogação imediata: revokeSession).
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  cookies: {
    sessionToken: {
      name: "better-auth.session_token",
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? ("none" as const) : ("lax" as const),
      domain: env.COOKIE_DOMAIN, // ex: ".meuapp.fslab.dev"
      path: "/",
    },
  },

  plugins: [
    admin({
      adminRoles: ["admin"],
      // user.role tem FK para papeis.nome — o papel default de novos cadastros
      // precisa existir no seed (o default do plugin seria "user", que não existe)
      defaultRole: "usuario",
    }),
    openAPI(),
  ],

  trustedOrigins: env.TRUSTED_ORIGINS
    ? env.TRUSTED_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:3000"],

  advanced: {
    disableCSRFCheck: !isProd,
  },

  basePath: "/auth",
});
