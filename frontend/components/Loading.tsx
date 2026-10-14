import { Comet } from "loading-dev";

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Carregando"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-xs"
    >
      <Comet size={48} color="var(--primary)" />
    </div>
  );
}
