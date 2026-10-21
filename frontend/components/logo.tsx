import { cn } from "@/lib/utils";

/**
 * Marca do Projeto Terra Fértil. Os PNGs (brancos, com transparência) saem do
 * `ID-Projeto-Terra-Fertil-Branco-952x1536.png` da raiz e entram como
 * `mask-image`, então a cor vem do tema (`bg-*` de quem usa):
 * - `public/marca-terra-fertil.png` — só o símbolo (broto + campo);
 * - `public/logo-terra-fertil.png` — a assinatura vertical completa.
 * `app/icon.png` e `app/apple-icon.png` são o símbolo sobre o verde `#589E3A`.
 */
function mascara(src: string): React.CSSProperties {
  return {
    maskImage: `url(${src})`,
    maskSize: "contain",
    maskRepeat: "no-repeat",
    maskPosition: "center",
  };
}

/** Símbolo em ladrilho verde — menu lateral e cabeçalhos (mesmo desenho do favicon). */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary",
        className,
      )}
    >
      <span className="size-[72%] bg-white" style={mascara("/marca-terra-fertil.png")} />
    </span>
  );
}

/** Assinatura vertical completa ("Projeto Terra Fértil"), na cor primária. */
export function LogoCompleto({ className, titulo }: { className?: string; titulo: string }) {
  return (
    <span
      role="img"
      aria-label={titulo}
      className={cn("block aspect-[952/1536] h-36 bg-primary", className)}
      style={mascara("/logo-terra-fertil.png")}
    />
  );
}
