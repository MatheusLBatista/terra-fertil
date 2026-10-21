import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * ESLint (flat config): só correção — regras de estilo são do Prettier.
 * `bun run lint` / `bun run lint:fix`.
 */
export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "drizzle/", "logs/", "data/", "openapi.json"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.js"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // `_x` marca parâmetro/variável intencionalmente não usados
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // Import só de tipo evita ciclo em runtime (ex.: hono.ts ↔ auth.ts)
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    },
  },
);
