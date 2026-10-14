import { cn } from "@/lib/utils";
import { env } from "@/lib/env";

/**
 * Pílula fixa no canto superior direito avisando em que ambiente a tela está.
 * Lê `NEXT_PUBLIC_AMBIENTE` (embutida no build); em produção (ou em branco)
 * não renderiza nada.
 */
const AMBIENTES: Record<string, { rotulo: string; classe: string }> = {
  development: { rotulo: "Ambiente de desenvolvimento", classe: "bg-red-600 text-white" },
  staging: { rotulo: "Ambiente de QA", classe: "bg-amber-500 text-black" },
  preview: { rotulo: "Ambiente de preview", classe: "bg-blue-600 text-white" },
};

const AMBIENTE = env.AMBIENTE ?? "";

/** `true` quando a pílula aparece — o ToastContainer desce para não ficar embaixo dela. */
export const AMBIENTE_PILL_VISIVEL = Object.hasOwn(AMBIENTES, AMBIENTE);

export function AmbientePill() {
  const ambiente = AMBIENTES[AMBIENTE];
  if (!ambiente) return null;

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none fixed top-3 right-3 z-[60] flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium shadow-md print:hidden",
        ambiente.classe,
      )}
    >
      <span className="relative flex size-2" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      {ambiente.rotulo}
    </div>
  );
}
