import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users2,
  Boxes,
  Receipt,
  ShoppingCart,
  FileText,
  Settings,
  Mic,
  Building2,
  UserCircle,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import { Avatar, AvatarFallback } from "@/components/ui/avatar.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { useCurrentUser } from "@/hooks/use-current-user.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { ThemeToggle } from "@/components/theme/theme-toggle.tsx";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "staff"] as const },
  { to: "/crm", label: "CRM", icon: Users2, roles: ["admin", "staff"] as const },
  { to: "/inventory", label: "Inventory", icon: Boxes, roles: ["admin", "staff"] as const },
  { to: "/sales", label: "Sales", icon: Receipt, roles: ["admin", "staff"] as const },
  { to: "/purchasing", label: "Purchasing", icon: ShoppingCart, roles: ["admin", "staff"] as const },
  { to: "/invoices", label: "Invoices", icon: FileText, roles: ["admin", "staff"] as const },
  { to: "/portal", label: "My portal", icon: UserCircle, roles: ["client"] as const },
];

const roleLabel: Record<string, string> = {
  admin: "Admin",
  staff: "Staff",
  client: "Client",
};

export default function AppSidebar() {
  const location = useLocation();
  const { user, isAdmin, hasRole } = useCurrentUser();
  const { user: authUser } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) =>
    hasRole(item.roles as unknown as Array<"admin" | "staff" | "client">),
  );

  const initials = (user?.name ?? authUser?.profile.name ?? "U")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Building2 className="size-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-serif text-sm font-semibold">Our ERP</span>
            <span className="text-[11px] text-sidebar-foreground/60">Business Suite</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.to}
                    tooltip={item.label}
                  >
                    <Link to={item.to}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {isAdmin && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={location.pathname === "/settings/users"}>
                <Link to="/settings/users">
                  <Settings />
                  <span>Team & roles</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={location.pathname === "/settings/voice-activity"}>
                <Link to="/settings/voice-activity">
                  <Mic />
                  <span>Voice activity</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar className="size-7">
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium">
              {user?.name ?? authUser?.profile.name ?? "User"}
            </span>
            <span className="truncate text-[11px] text-sidebar-foreground/60">
              {user?.email ?? authUser?.profile.email}
            </span>
          </div>
          <div className="shrink-0 group-data-[collapsible=icon]:hidden">
            <ThemeToggle />
          </div>
          {user && (
            <Badge
              variant="secondary"
              className="shrink-0 bg-sidebar-accent text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
            >
              {roleLabel[user.role]}
            </Badge>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
