import { Comet } from "loading-dev";

import { cn } from "@/lib/utils";

function Spinner({ className, size = 16, ...props }: React.ComponentProps<"span"> & { size?: number }) {
  return (
    <span
      data-slot="spinner"
      role="status"
      aria-label="Carregando"
      className={cn("inline-flex shrink-0", className)}
      {...props}
    >
      <Comet size={size} />
    </span>
  );
}

export { Spinner };
