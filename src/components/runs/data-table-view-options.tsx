"use client";

import { Settings2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The slice of a TanStack column (with columnVisibilityFeature) the menu needs. */
export interface ToggleableColumn {
  id: string;
  label: string;
  getCanHide: () => boolean;
  getIsVisible: () => boolean;
  toggleVisibility: (value?: boolean) => void;
}

/** "View" menu: show or hide the optional columns. */
export function DataTableViewOptions({ columns }: { columns: ToggleableColumn[] }) {
  const hideable = columns.filter((column) => column.getCanHide());
  if (hideable.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="ml-auto">
          <Settings2Icon aria-hidden="true" data-icon="inline-start" />
          View
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hideable.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            onCheckedChange={(value) => column.toggleVisibility(value === true)}
            // Keep the menu open while toggling several columns.
            onSelect={(event) => event.preventDefault()}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
