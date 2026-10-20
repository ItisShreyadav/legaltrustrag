"use client";

import { ChevronsUpDown, LogOut, Settings, SunMoon } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { THEME_OPTIONS } from "./theme-options";
import { useSignOut } from "./use-sign-out";
import { useThemeChoice } from "./use-theme-choice";
import { userInitials } from "./user-initials";

export interface NavUserProps {
  name: string;
  email: string;
}

function UserSummary({ name, email }: NavUserProps) {
  return (
    <>
      <Avatar className="size-8 rounded-lg after:rounded-lg" aria-hidden>
        <AvatarFallback className="rounded-lg bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground">
          {userInitials(name, email)}
        </AvatarFallback>
      </Avatar>
      <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{email}</span>
      </span>
    </>
  );
}

/** Sidebar footer: who is signed in, with settings, theme and sign out in a menu. */
export function NavUser({ name, email }: NavUserProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const { theme, setTheme } = useThemeChoice();
  const { signOut, pending } = useSignOut();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
            >
              <UserSummary name={name} email={email} />
              <ChevronsUpDown className="ml-auto" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-foreground">
                <UserSummary name={name} email={email} />
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/settings" onClick={() => setOpenMobile(false)}>
                  <Settings aria-hidden />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <SunMoon aria-hidden />
                  Theme
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="min-w-36">
                    <DropdownMenuRadioGroup value={theme ?? ""} onValueChange={setTheme}>
                      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                        <DropdownMenuRadioItem key={value} value={value}>
                          <Icon aria-hidden />
                          {label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={pending}
              onSelect={(event) => {
                // Keep the menu open so the pending state stays visible.
                event.preventDefault();
                void signOut();
              }}
            >
              {pending ? <Spinner aria-hidden /> : <LogOut aria-hidden />}
              {pending ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
