"use client";

import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const PAGE_SIZES = [10, 20, 50] as const;

interface Props {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/** Table footer: rows-per-page select, "Page n of m" and first / previous / next / last buttons. */
export function DataTablePagination({ pageIndex, pageCount, pageSize, onPageChange, onPageSizeChange }: Props) {
  const sizeLabelId = useId();
  const pages = Math.max(pageCount, 1);
  const canPrevious = pageIndex > 0;
  const canNext = pageIndex < pages - 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex items-center gap-2">
        <span id={sizeLabelId} className="text-sm text-muted-foreground">
          Rows per page
        </span>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger size="sm" aria-labelledby={sizeLabelId} className="w-[4.5rem]">
            {/* Explicit children so the server render shows the size before Radix mounts. */}
            <SelectValue>{pageSize}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-4">
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          Page {pageIndex + 1} of {pages}
        </p>
        <Pagination aria-label="Table pages" className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="First page"
                disabled={!canPrevious}
                onClick={() => onPageChange(0)}
                className="hidden sm:inline-flex"
              >
                <ChevronsLeftIcon aria-hidden="true" />
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Previous page"
                disabled={!canPrevious}
                onClick={() => onPageChange(pageIndex - 1)}
              >
                <ChevronLeftIcon aria-hidden="true" />
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Next page"
                disabled={!canNext}
                onClick={() => onPageChange(pageIndex + 1)}
              >
                <ChevronRightIcon aria-hidden="true" />
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Last page"
                disabled={!canNext}
                onClick={() => onPageChange(pages - 1)}
                className="hidden sm:inline-flex"
              >
                <ChevronsRightIcon aria-hidden="true" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
