import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DataPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "ellipsis", total];
  if (current >= total - 3) return [1, "ellipsis", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", total];
}

/**
 * Paginação com botões de verdade (não `<a href="#">`): desabilitados nas
 * pontas, `aria-current="page"` na página atual e, no celular, só o contador
 * "3 / 25" no lugar da fileira de números.
 */
export function DataPagination({ page, totalPages, onPageChange, className }: DataPaginationProps) {
  if (totalPages <= 1) return null;

  const pageNumbers = getPageNumbers(page, totalPages);
  const naPrimeira = page <= 1;
  const naUltima = page >= totalPages;

  return (
    <nav aria-label="Paginação" className={cn("flex items-center gap-0.5", className)}>
      <Button
        variant="ghost"
        size="sm"
        disabled={naPrimeira}
        aria-label="Página anterior"
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeftIcon data-icon="inline-start" />
        <span className="hidden sm:inline">Anterior</span>
      </Button>

      {/* Celular: contador compacto no lugar dos números. */}
      <span className="px-2 text-xs text-muted-foreground tabular-nums sm:hidden">
        {page} / {totalPages}
      </span>

      <ul className="hidden items-center gap-0.5 sm:flex">
        {pageNumbers.map((p, i) =>
          p === "ellipsis" ? (
            <li key={`ellipsis-${i}`} aria-hidden className="flex size-8 items-center justify-center">
              <MoreHorizontalIcon className="size-4 text-muted-foreground" />
            </li>
          ) : (
            <li key={p}>
              <Button
                variant={p === page ? "outline" : "ghost"}
                size="icon"
                aria-label={`Página ${p}`}
                aria-current={p === page ? "page" : undefined}
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            </li>
          ),
        )}
      </ul>

      <Button
        variant="ghost"
        size="sm"
        disabled={naUltima}
        aria-label="Próxima página"
        onClick={() => onPageChange(page + 1)}
      >
        <span className="hidden sm:inline">Próxima</span>
        <ChevronRightIcon data-icon="inline-end" />
      </Button>
    </nav>
  );
}
