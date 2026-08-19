import { useAuth } from "@/hooks/use-auth.ts";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/** Thrown for any non-2xx API response. Mirrors the old `ConvexError` shape
 * closely enough that `catch (error) { ... error.message }` call sites just
 * need `instanceof ConvexError` swapped for `instanceof ApiError`. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request(token: string | undefined, path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? "Request failed");
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Thin fetch wrapper that attaches the signed-in user's ID token. Used
 * directly by react-query `queryFn`/`mutationFn` callbacks.
 *
 * We send the OIDC *ID token* rather than the access token: every
 * OIDC-compliant provider (Google, Auth0, Okta, ...) issues the ID token
 * as a JWT you can verify against the provider's JWKS, whereas access
 * tokens are sometimes opaque (Google's are). See server/auth.ts. */
export function useApiClient() {
  const { user } = useAuth();
  const token = user?.id_token;

  return {
    get: (path: string) => request(token, path),
    post: (path: string, body?: unknown) =>
      request(token, path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
    patch: (path: string, body?: unknown) =>
      request(token, path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
    del: (path: string) => request(token, path, { method: "DELETE" }),
  };
}
