import { cn } from "@/lib/utils";
import { MARCA_BLOCOS, MARCA_FAISCA, MARCA_RAIO_FUNDO, MARCA_VIEWBOX } from "@/lib/marca";

/**
 * Marca da aplicação — o desenho vem de `lib/marca.ts` (o mesmo do
 * `app/apple-icon.tsx` e do `app/icon.svg`). As cores seguem o tema:
 * fundo `--sidebar` (escuro nos dois temas) e blocos `--primary`.
 */
export function Logo({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox={MARCA_VIEWBOX} aria-hidden="true" className={cn("size-7 shrink-0", className)} {...props}>
      <rect width="64" height="64" rx={MARCA_RAIO_FUNDO} fill="var(--sidebar)" />
      {MARCA_BLOCOS.map((b) => (
        <rect key={`${b.x}-${b.y}`} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.r} fill="var(--primary)" />
      ))}
      <path d={MARCA_FAISCA} fill="var(--sidebar-foreground)" />
    </svg>
  );
}
