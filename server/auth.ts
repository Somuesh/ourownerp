import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import { db } from "./db/client.ts";
import { users } from "./db/schema.ts";

/** Thrown anywhere in a route handler; the error middleware in index.ts turns
 * this into a JSON response with the right status code. */
export class AppError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Wraps an async Express handler so rejected promises reach the error
 * middleware instead of crashing the process. */
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

const authority = process.env.OIDC_AUTHORITY;
const audience = process.env.OIDC_CLIENT_ID;
const devBypass = process.env.DEV_AUTH_BYPASS === "true";

// Lazily-created JWKS fetcher for verifying the OIDC provider's ID tokens
// (Google, Auth0, Okta, or any standards-compliant issuer). Only needed
// when DEV_AUTH_BYPASS is not enabled.
const JWKS =
  authority && !devBypass
    ? createRemoteJWKSet(new URL(`${authority}/.well-known/jwks.json`))
    : null;

interface Identity {
  sub: string;
  name?: string;
  email?: string;
}

async function verifyToken(req: Request): Promise<Identity> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    throw new AppError(401, "User not logged in");
  }

  // DEV_AUTH_BYPASS=true skips *signature* verification, but still treats
  // a real JWT (e.g. a real Google/Auth0/Okta ID token, if you've already
  // configured VITE_OIDC_* on the frontend) as that provider's stable
  // identity by reading its `sub` claim — not the raw token string, which
  // changes every login and would otherwise create a new user each time.
  // Only a genuinely non-JWT string (e.g. `Bearer test-user-1` from curl)
  // falls back to using the literal string as the identity. Never enable
  // DEV_AUTH_BYPASS in production either way — it skips signature checks.
  if (devBypass) {
    if (token.split(".").length === 3) {
      try {
        const payload = decodeJwt(token);
        return {
          sub: payload.sub!,
          name: typeof payload.name === "string" ? payload.name : undefined,
          email: typeof payload.email === "string" ? payload.email : undefined,
        };
      } catch {
        // Fall through to raw-string identity below.
      }
    }
    return { sub: token };
  }

  if (!JWKS || !authority) {
    throw new AppError(
      500,
      "Auth is not configured. Set OIDC_AUTHORITY (and OIDC_CLIENT_ID), " +
        "or set DEV_AUTH_BYPASS=true for local development.",
    );
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: authority,
      audience,
    });
    return {
      sub: payload.sub!,
      name: typeof payload.name === "string" ? payload.name : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  } catch {
    throw new AppError(401, "Invalid or expired session");
  }
}

export interface AuthUser {
  _id: string;
  name: string | null;
  email: string | null;
  role: "admin" | "staff" | "client";
  contactId: string | null;
}

/** The verified token identity, without requiring a matching `users` row.
 * Used by /users/sync (which creates the row on first sign-in) and
 * /users/me (which returns null instead of 404 if sync hasn't run yet). */
export async function getIdentity(req: Request): Promise<Identity> {
  return verifyToken(req);
}

export async function getCurrentUser(req: Request): Promise<AuthUser | null> {
  const identity = await verifyToken(req);
  const row = await db.query.users.findFirst({
    where: eq(users.tokenIdentifier, identity.sub),
  });
  if (!row) return null;
  return {
    _id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    contactId: row.contactId,
  };
}

async function requireUser(req: Request): Promise<AuthUser> {
  const user = await getCurrentUser(req);
  if (!user) {
    throw new AppError(401, "User not logged in");
  }
  return user;
}

export async function requireAdmin(req: Request): Promise<AuthUser> {
  const user = await requireUser(req);
  if (user.role !== "admin") {
    throw new AppError(403, "Admins only");
  }
  return user;
}

export async function requireStaffOrAdmin(req: Request): Promise<AuthUser> {
  const user = await requireUser(req);
  if (user.role !== "admin" && user.role !== "staff") {
    throw new AppError(403, "Staff or admin only");
  }
  return user;
}

export async function requireClientWithContact(
  req: Request,
): Promise<AuthUser & { contactId: string }> {
  const user = await requireUser(req);
  if (user.role !== "client" || !user.contactId) {
    throw new AppError(
      403,
      "Your account isn't linked to a contact yet. Ask an admin to link it.",
    );
  }
  return user as AuthUser & { contactId: string };
}
