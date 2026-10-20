import { Scale } from "lucide-react";
import { cn } from "@/lib/utils";

/** The product mark: a scale in a rounded primary square. Decorative; pair it with the product name. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground",
        className,
      )}
    >
      <Scale className="size-4" />
    </span>
  );
}
