import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export const PAGE_SIZE = 10;

const MAX_PAGE_BUTTONS = 5;

const pageNumbers = (current: number, total: number): number[] => {
  if (total <= 0) return [];
  const start = Math.max(1, current - Math.floor(MAX_PAGE_BUTTONS / 2));
  const end = Math.min(total, start + MAX_PAGE_BUTTONS - 1);
  const from = Math.max(1, end - MAX_PAGE_BUTTONS + 1);
  return Array.from({ length: end - from + 1 }, (_, index) => from + index);
};

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  total?: number;
  pageSize?: number;
  disabled?: boolean;
  /** Server-driven lists that do not know the total up front. */
  hasNext?: boolean;
};

export const Pagination = ({
  page,
  totalPages,
  onPageChange,
  total,
  pageSize = PAGE_SIZE,
  disabled = false,
  hasNext,
}: PaginationProps) => {
  const pages = pageNumbers(page, totalPages);
  const canGoNext = hasNext ?? page < totalPages;
  if (totalPages <= 1 && !canGoNext && page <= 1) return null;

  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = total == null ? page * pageSize : Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Σελιδοποίηση"
      className="flex flex-wrap items-center justify-between gap-3 pt-1"
    >
      <p className="text-xs text-muted-foreground">
        {total == null
          ? `Σελίδα ${page}${totalPages > 0 ? ` από ${totalPages}` : ""}`
          : `Εμφάνιση ${rangeStart}–${rangeEnd} από ${total}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Προηγούμενη
        </Button>
        {pages.map((item) => (
          <Button
            key={item}
            variant={item === page ? "default" : "outline"}
            size="sm"
            disabled={disabled}
            onClick={() => onPageChange(item)}
            aria-label={`Σελίδα ${item}`}
            aria-current={item === page ? "page" : undefined}
          >
            {item}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !canGoNext}
          onClick={() => onPageChange(page + 1)}
        >
          Επόμενη
        </Button>
      </div>
    </nav>
  );
};

type PaginatedList<T> = {
  page: number;
  setPage: (page: number) => void;
  pageItems: T[];
  totalPages: number;
  total: number;
  pageSize: number;
};

/**
 * Client-side slicing for lists the API returns in full. Resets to page 1
 * whenever the underlying collection changes (filters, reloads, deletions).
 */
export const usePaginatedList = <T,>(
  items: T[],
  options: { pageSize?: number; resetKey?: string } = {},
): PaginatedList<T> => {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [options.resetKey, total]);

  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );

  return { page: safePage, setPage, pageItems, totalPages, total, pageSize };
};
