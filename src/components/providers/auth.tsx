import { useMemo } from "react";
import { AuthProvider as OidcAuthProvider, type AuthProviderProps } from "react-oidc-context";

// Defined outside the component so it's a stable reference across every
// render — an inline arrow function here was causing react-oidc-context
// to occasionally re-process a redirect mid-flight and lose track of the
// pending `state` in sessionStorage ("No matching state found in storage").
function onSigninCallback() {
  window.history.replaceState({}, document.title, window.location.pathname);
}

/**
 * Generic OIDC provider (works with Google, Auth0, Okta, or any
 * standards-compliant OIDC issuer) via react-oidc-context.
 *
 * Configure via env vars:
 *   VITE_OIDC_AUTHORITY   e.g. https://accounts.google.com or your Auth0/Okta domain
 *   VITE_OIDC_CLIENT_ID   the client/application ID registered with your provider
 *   VITE_OIDC_SCOPE       optional, defaults to "openid profile email"
 *
 * This provider sits outside the router (see App.tsx), so
 * `onSigninCallback` only strips the `?code=&state=` params the provider
 * appended to the URL — it doesn't navigate. The `/auth/callback` page
 * itself (src/pages/auth/Callback.tsx) handles redirecting to "/" once
 * the user is confirmed signed in.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Memoized so the whole settings object keeps the same reference across
  // re-renders too — same reasoning as onSigninCallback above.
  const oidcConfig: AuthProviderProps = useMemo(
    () => ({
      authority: import.meta.env.VITE_OIDC_AUTHORITY!,
      client_id: import.meta.env.VITE_OIDC_CLIENT_ID!,
      client_secret: import.meta.env.VITE_OIDC_CLIENT_SECRET,
      redirect_uri:
        import.meta.env.VITE_OIDC_REDIRECT_URI ??
        `${window.location.origin}/auth/callback`,
      response_type: "code",
      scope: import.meta.env.VITE_OIDC_SCOPE ?? "openid profile email",
      onSigninCallback,
    }),
    [],
  );

  return <OidcAuthProvider {...oidcConfig}>{children}</OidcAuthProvider>;
}
