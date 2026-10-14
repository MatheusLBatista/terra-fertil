"use client";

import { useSyncExternalStore } from "react";
import { ArrowUpIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

const LIMIAR_PX = 300;

// O scroll da janela é um sistema externo: `useSyncExternalStore` em vez de
// useEffect + setState (regra react-hooks/set-state-in-effect). No servidor,
// o botão começa escondido.
function subscribe(onStoreChange: () => void) {
  window.addEventListener("scroll", onStoreChange, { passive: true });
  return () => window.removeEventListener("scroll", onStoreChange);
}

function subirAoTopo() {
  const reduzirMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduzirMovimento ? "auto" : "smooth" });
}

/** Botão flutuante "Voltar ao topo" — aparece depois de 300px de rolagem. */
export function ScrollToTop() {
  const visivel = useSyncExternalStore(
    subscribe,
    () => window.scrollY > LIMIAR_PX,
    () => false,
  );

  if (!visivel) return null;

  return (
    <Button
      variant="outline"
      size="icon-lg"
      aria-label="Voltar ao topo"
      title="Voltar ao topo"
      onClick={subirAoTopo}
      className="fixed right-4 bottom-4 z-40 rounded-full shadow-md print:hidden"
    >
      <ArrowUpIcon />
    </Button>
  );
}
