import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Ícone do domínio; sem ele, só o texto. */
  icon?: LucideIcon;
  title: string;
  /**
   * Elemento do título. Padrão `p` (estado vazio dentro de uma tela que já tem o `h1`
   * do `PageLayout`); telas sem outro título (404, error boundaries públicos) passam
   * `"h1"` para a página ter o seu cabeçalho de nível 1.
   */
  titleAs?: "p" | "h1" | "h2";
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

// Estado vazio padrão da plataforma — ícone do domínio num círculo suave + mensagem.
export function EmptyState({
  icon: Icon,
  title,
  titleAs: Titulo = "p",
  description,
  action,
  className,
}: Props) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-4 py-14 text-center", className)}>
      {Icon && (
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border ring-inset">
          <Icon className="size-7" strokeWidth={1.75} />
        </div>
      )}
      <div className="space-y-1">
        <Titulo className="text-sm font-medium text-foreground">{title}</Titulo>
        {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
