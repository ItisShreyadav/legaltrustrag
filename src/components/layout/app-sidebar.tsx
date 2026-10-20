"use client";

import { ClipboardCheck, FilePlus2, History, LayoutDashboard, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandMark } from "./brand-mark";

interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

const WORKSPACE_ITEMS: readonly NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "New analysis", href: "/analyze", icon: FilePlus2 },
  { title: "Runs", href: "/runs", icon: History },
  { title: "Review", href: "/review", icon: ClipboardCheck },
];

const ACCOUNT_ITEMS: readonly NavItem[] = [{ title: "Settings", href: "/settings", icon: Settings }];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/*
 * The sidebar itself renders synchronously so it hydrates with the server's
 * desktop markup before the viewport check flips to mobile. Anything that needs
 * the session (the user footer, the review-queue badge) streams in as a slot
 * from the server layout, each behind its own Suspense boundary.
 */
export interface AppSidebarProps {
  /** Signed-in user footer (streams in); null renders an empty footer. */
  footer: ReactNode;
  /** Badge for the Review item, e.g. the queued count (streams in). */
  reviewBadge: ReactNode;
}

interface NavMenuProps {
  items: readonly NavItem[];
  reviewBadge: ReactNode;
}

function NavMenu({ items, reviewBadge, pathname }: NavMenuProps & { pathname: string | null }) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenu>
      {items.map(({ title, href, icon: Icon }) => {
        const active = pathname !== null && isActive(pathname, href);
        return (
          <SidebarMenuItem key={href}>
            <SidebarMenuButton asChild isActive={active} tooltip={title}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (isMobile) setOpenMobile(false);
                }}
              >
                <Icon aria-hidden />
                <span>{title}</span>
              </Link>
            </SidebarMenuButton>
            {href === "/review" ? reviewBadge : null}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

/** Queued-count badge on the Review item. Rendered by the server layout once the session has loaded. */
export function ReviewQueueBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <SidebarMenuBadge className="bg-primary/10 text-primary peer-hover/menu-button:text-primary peer-data-active/menu-button:text-primary">
      <span aria-hidden>{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{count} queued</span>
    </SidebarMenuBadge>
  );
}

/** usePathname() suspends while prerendering routes with unknown params (e.g. /runs/[id]), hence the boundary. */
function ActiveNavMenu(props: NavMenuProps) {
  return <NavMenu {...props} pathname={usePathname()} />;
}

function NavGroup({ label, ...props }: NavMenuProps & { label: string }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <Suspense fallback={<NavMenu {...props} pathname={null} />}>
          <ActiveNavMenu {...props} />
        </Suspense>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function NavUserPlaceholder() {
  return (
    <div aria-hidden className="flex h-12 items-center gap-2 p-2 group-data-[collapsible=icon]:p-0">
      <Skeleton className="size-8 shrink-0 rounded-lg bg-sidebar-accent" />
      <div className="grid flex-1 gap-1.5 group-data-[collapsible=icon]:hidden">
        <Skeleton className="h-3 w-24 bg-sidebar-accent" />
        <Skeleton className="h-3 w-36 bg-sidebar-accent" />
      </div>
    </div>
  );
}

/** The dashboard sidebar: brand, workspace and account navigation, and the signed-in user. Collapses to icons. */
export function AppSidebar({ footer, reviewBadge }: AppSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link
                href="/"
                onClick={() => {
                  if (isMobile) setOpenMobile(false);
                }}
              >
                <BrandMark className="bg-sidebar-primary text-sidebar-primary-foreground" />
                <span className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">LegalTrustRAG</span>
                  <span className="truncate text-xs text-muted-foreground">Contract review</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main" className="flex flex-col">
          <NavGroup label="Workspace" items={WORKSPACE_ITEMS} reviewBadge={reviewBadge} />
          <NavGroup label="Account" items={ACCOUNT_ITEMS} reviewBadge={null} />
        </nav>
      </SidebarContent>
      <SidebarFooter>{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
