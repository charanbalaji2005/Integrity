import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronsUpDown, LogOut, Settings as SettingsIcon, UserRound, type LucideIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "./ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import imgLogo from "../../imports/LoginPortalIntegrityOs/assessment_integrity_logo.png";

/**
 * One navigation shell for every portal (student, faculty, support, admin),
 * built on the shadcn/ui Sidebar: collapsible to an icon rail on desktop
 * (⌘/Ctrl+B), an off-canvas sheet on mobile, tooltips when collapsed.
 */

export interface PortalNavItem {
  id: string;
  label: string;
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
  badge?: number | string | null;
}

export interface PortalNavGroup {
  label?: string;
  items: PortalNavItem[];
}

interface PortalSidebarProps {
  /** e.g. "Student workspace", "Faculty portal". */
  portalLabel: string;
  groups: PortalNavGroup[];
  active: string;
  onSelect: (id: string) => void;
  user: { name?: string | null; email?: string | null; image?: string | null; roleLabel?: string };
  onSignOut: () => void;
  /** Optional control in the header (e.g. the admin notification bell). */
  headerAction?: React.ReactNode;
  onOpenSettings?: () => void;
  /** Show a visible "Sign out" entry in the footer (in addition to the account menu). */
  showSignOutItem?: boolean;
}

const initials = (name?: string | null) =>
  (name || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/** Profile images can be avatar URLs or registered face scans (data URLs). */
const avatarSrc = (image?: string | null) =>
  image && (/^https?:\/\//.test(image) || /^data:image\//.test(image)) ? image : undefined;

export function PortalSidebar({
  portalLabel,
  groups,
  active,
  onSelect,
  user,
  onSignOut,
  headerAction,
  onOpenSettings,
  showSignOutItem = false,
}: PortalSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const reduceMotion = useReducedMotion();

  const select = (id: string) => {
    onSelect(id);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="gap-0 px-2 pb-2 pt-3">
        <div className="flex items-center gap-2.5 px-1.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-sidebar-border bg-white p-1 shadow-xs">
            <img src={imgLogo} alt="" aria-hidden="true" className="size-full object-contain" />
          </span>
          <div className="min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <p className="truncate text-[15px] font-bold tracking-tight text-sidebar-foreground">IntegrityOS</p>
            <p className="truncate text-[11px] font-medium text-muted-foreground">{portalLabel}</p>
          </div>
          {headerAction && <div className="shrink-0 group-data-[collapsible=icon]:hidden">{headerAction}</div>}
        </div>
      </SidebarHeader>

      <SidebarSeparator className="mx-0" />

      <SidebarContent>
        {groups.map((group, gi) => (
          <SidebarGroup key={group.label ?? gi}>
            {group.label && <SidebarGroupLabel className="uppercase tracking-wider text-[10.5px]">{group.label}</SidebarGroupLabel>}
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      onClick={() => select(item.id)}
                      aria-current={isActive ? "page" : undefined}
                      className="relative isolate h-9 font-medium transition-colors duration-200 data-[active=true]:bg-transparent data-[active=true]:text-white data-[active=true]:hover:bg-transparent data-[active=true]:hover:text-white [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:scale-110"
                    >
                      {isActive && (
                        // Active highlight glides between items when navigating.
                        <motion.span
                          aria-hidden="true"
                          layoutId={reduceMotion ? undefined : `portal-nav-active-${portalLabel}`}
                          transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.8 }}
                          className="absolute inset-0 -z-10 rounded-md bg-zinc-950 shadow-sm"
                        />
                      )}
                      <Icon className="size-4 shrink-0" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.badge != null && item.badge !== 0 && item.badge !== "" && (
                      <SidebarMenuBadge
                        className={
                          isActive
                            ? "bg-white text-zinc-950 peer-data-[active=true]/menu-button:text-zinc-950"
                            : "bg-amber-100 text-amber-800"
                        }
                      >
                        {item.badge}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {showSignOutItem && (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Sign out"
                onClick={onSignOut}
                className="h-9 font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 active:bg-rose-100 active:text-rose-700"
              >
                <LogOut className="size-4 shrink-0" />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={user.name || "Account"} className="data-[state=open]:bg-sidebar-accent">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarImage src={avatarSrc(user.image)} alt="" className="object-cover" />
                    <AvatarFallback className="rounded-lg bg-zinc-950 text-[11px] font-bold text-white">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate text-[13px] font-semibold">{user.name || "Account"}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{user.roleLabel || user.email}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={8}
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-xl"
              >
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-semibold">{user.name}</p>
                  {user.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent("open-profile-drawer"))}>
                  <UserRound className="size-4" /> Profile
                </DropdownMenuItem>
                {onOpenSettings && (
                  <DropdownMenuItem onSelect={onOpenSettings}>
                    <SettingsIcon className="size-4" /> Settings
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onSignOut}>
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
