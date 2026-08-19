import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth.ts";
import { useApiClient } from "@/lib/api-client.ts";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Button } from "@/components/ui/button.tsx";

/**
 * Landing page for the OIDC redirect_uri. `AuthProvider` (see
 * providers/auth.tsx) processes the ?code=&state= params automatically;
 * this page just waits for that to finish, registers the user with our
 * own API (POST /users/sync), and sends them on to the app.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const auth = useAuth();
  const api = useApiClient();
  const syncUser = useMutation({ mutationFn: () => api.post("/users/sync") });
  const handled = useRef(false);

  useEffect(() => {
    if (auth.isLoading || auth.error || handled.current) return;

    if (!auth.isAuthenticated) {
      navigate("/", { replace: true });
      return;
    }

    handled.current = true;
    syncUser
      .mutateAsync()
      .then(() => navigate("/", { replace: true }))
      .catch(() => {
        handled.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.isLoading, auth.isAuthenticated, auth.error]);

  if (auth.error) {
    return (
      <div className="flex flex-col items-center justify-center h-svh gap-6 px-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-destructive font-medium">Something went wrong</p>
          <p className="text-sm text-muted-foreground max-w-md">
            {auth.error.message}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => navigate("/", { replace: true })}>
            Return home
          </Button>
          <Button onClick={() => auth.signinRedirect()}>Try again</Button>
        </div>
      </div>
    );
  }

  if (syncUser.isError) {
    return (
      <div className="flex flex-col items-center justify-center h-svh gap-6 px-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-destructive font-medium">Couldn't finish signing you in</p>
          <p className="text-sm text-muted-foreground max-w-md">
            {syncUser.error instanceof Error ? syncUser.error.message : "Please try again."}
          </p>
        </div>
        <Button
          onClick={() => {
            handled.current = false;
            syncUser.mutate();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-svh gap-4">
      <Spinner className="size-8" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}
