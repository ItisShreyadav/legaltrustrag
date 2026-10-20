import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppSidebar, NavUserPlaceholder, ReviewQueueBadge } from "@/components/layout/app-sidebar";
import { NavUser } from "@/components/layout/nav-user";
import { SiteHeader } from "@/components/layout/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getSessionUser } from "@/lib/auth";
import { queuedReviewCount } from "@/lib/review";

/*
 * The session cookie and the review queue are read in these two slots, so they
 * stream in behind their own Suspense boundaries (cacheComponents) while the
 * sidebar chrome renders immediately. Pages still call requireUser(); a missing
 * session here just leaves the account section empty.
 */
async function SessionUserFooter() {
  const user = await getSessionUser();
  if (!user) return null;
  return <NavUser name={user.name} email={user.email} />;
}

async function QueuedReviewBadge() {
  const user = await getSessionUser();
  if (!user) return null;
  return <ReviewQueueBadge count={queuedReviewCount(user.id)} />;
}

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <SidebarProvider>
      <a
        href="#main"
        className="sr-only rounded-md bg-background px-3 py-2 text-sm font-medium shadow-md ring-1 ring-ring focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <AppSidebar
        footer={
          <Suspense fallback={<NavUserPlaceholder />}>
            <SessionUserFooter />
          </Suspense>
        }
        reviewBadge={
          <Suspense fallback={null}>
            <QueuedReviewBadge />
          </Suspense>
        }
      />
      <SidebarInset className="min-w-0">
        <SiteHeader />
        {/* SidebarInset is the <main> landmark; this is the skip-link target. */}
        <div id="main" tabIndex={-1} className="flex flex-1 flex-col gap-6 p-4 outline-none md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
