import { Navigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useCurrentUser } from "@/hooks/use-current-user.ts";

/** Redirects users without one of the allowed roles away from the page. */
export default function RequireRole({
  roles,
  children,
  redirectTo = "/",
}: {
  roles: Array<"admin" | "staff" | "client">;
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const { user, isLoading, hasRole } = useCurrentUser();

  if (isLoading || user === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!hasRole(roles)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
