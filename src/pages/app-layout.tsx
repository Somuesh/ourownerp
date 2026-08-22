import { Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth.ts";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Building2 } from "lucide-react";
import AppSidebar from "./_components/app-sidebar.tsx";

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Building2 className="size-7" />
        </div>
        <div className="space-y-2">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            Our ERP
          </h1>
          <p className="max-w-sm text-muted-foreground">
            Sign in to manage your contacts, inventory, invoices, and more
            in one place.
          </p>
        </div>
        <SignInButton size="lg" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-medium text-muted-foreground">
            Our ERP
          </span>
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
