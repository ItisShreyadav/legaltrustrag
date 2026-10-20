"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, Suspense } from "react";
import { shortRunId } from "@/components/runs/format";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "./theme-toggle";

interface Crumb {
  label: string;
  /** Set for ancestors; the last crumb is the current page. */
  href?: string;
  /** An identifier shown in mono after the label, e.g. a run id. */
  id?: string;
}

const TOP_LEVEL: Record<string, string> = {
  "": "Dashboard",
  analyze: "New analysis",
  runs: "Runs",
  review: "Review",
  settings: "Settings",
};

function crumbsFor(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const [first = "", second] = segments;
  const section = TOP_LEVEL[first] ?? first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, " ");

  if (first === "runs" && second) {
    return [
      { label: section, href: "/runs" },
      { label: "Run", id: shortRunId(second) },
    ];
  }
  return [{ label: section }];
}

/** Breadcrumbs for the current route. Reads the pathname, so it sits behind its own Suspense boundary. */
function HeaderBreadcrumbs() {
  const crumbs = crumbsFor(usePathname());

  return (
    <Breadcrumb className="min-w-0 flex-1">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, index) => (
          <Fragment key={`${index}-${crumb.label}`}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem className="min-w-0">
              {crumb.href ? (
                <BreadcrumbLink asChild>
                  <Link href={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="truncate">
                  {crumb.label}
                  {crumb.id ? <span className="ml-1 font-mono text-[0.8125rem]">{crumb.id}</span> : null}
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** Sticky top bar: sidebar toggle, breadcrumbs for the current route, and the theme switch. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-background/75 md:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-center" />
      <Suspense fallback={<Skeleton aria-hidden className="h-4 w-28" />}>
        <HeaderBreadcrumbs />
      </Suspense>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  );
}
