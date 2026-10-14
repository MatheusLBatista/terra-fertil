import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { env } from "@/lib/env";
import { QueryProvider } from "@/components/queryProvider";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import ReactToastContainer from "@/components/ReactToastContainer";
import { ThemeProvider } from "@/components/theme-provider";
import { AmbientePill } from "@/components/ambiente-pill";
import { ErrorReporter } from "@/components/error-reporter";
import { APP_DESCRICAO, APP_NOME } from "@/lib/app";

// Fontes do painel (self-hosted pelo next/font). Trocar a fonte é trocar aqui
// e manter as variáveis `--font-sans` / `--font-mono` (globals.css mapeia
// `--font-heading` para a sans).
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: APP_NOME, template: `%s · ${APP_NOME}` },
  description: APP_DESCRICAO,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={cn("h-full", "antialiased", "font-sans", inter.variable, jetbrainsMono.variable)}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <QueryProvider>
          <NuqsAdapter>
            <ThemeProvider
              attribute="class"
              defaultTheme={env.TEMA_PADRAO}
              enableSystem={env.TEMA_PADRAO === "system"}
            >
              <ErrorReporter />
              {children}
              <AmbientePill />
              <ReactToastContainer />
            </ThemeProvider>
          </NuqsAdapter>
        </QueryProvider>
      </body>
    </html>
  );
}
