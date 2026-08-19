import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth.ts";
import { useApiClient } from "@/lib/api-client.ts";
import type { Role, User } from "@/lib/types.ts";

/** Convenience hook for the current end user's local `users` record and role. */
export function useCurrentUser() {
  const { isAuthenticated } = useAuth();
  const api = useApiClient();

  const { data: user } = useQuery<User | null>({
    queryKey: ["currentUser"],
    queryFn: () => api.get("/users/me"),
    enabled: isAuthenticated,
  });

  return {
    user,
    isLoading: isAuthenticated && user === undefined,
    isAdmin: user?.role === "admin",
    isStaff: user?.role === "staff",
    isClient: user?.role === "client",
    hasRole: (roles: Array<Role>) => (user ? roles.includes(user.role) : false),
  };
}
