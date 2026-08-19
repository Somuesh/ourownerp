import type { Request } from "express";
import { AppError, getCurrentUser, type AuthUser } from "./auth.ts";
import { db } from "./db/client.ts";
import { rolePermissions } from "./db/schema.ts";

/**
 * Fine-grained capability framework, additive to the existing
 * requireAdmin/requireStaffOrAdmin role checks (left as-is on today's
 * routes to avoid touching working code during the DB migration).
 * New modules (Sales, Purchasing, ...) should gate their routes with
 * `requireCapability(req, "sales:write")` etc. instead of hardcoding role
 * names, so permissions can later be edited per-role from Settings without
 * a code change — this file is the seam that makes that possible.
 */
export const CAPABILITIES = {
  CRM_READ: "crm:read",
  CRM_WRITE: "crm:write",
  INVENTORY_READ: "inventory:read",
  INVENTORY_WRITE: "inventory:write",
  INVOICES_READ: "invoices:read",
  INVOICES_WRITE: "invoices:write",
  USERS_MANAGE: "users:manage",
  // Reserved for later phases — seeded now so the permissions table already
  // has rows to edit once those modules land.
  SALES_READ: "sales:read",
  SALES_WRITE: "sales:write",
  PURCHASING_READ: "purchasing:read",
  PURCHASING_WRITE: "purchasing:write",
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];
export type Role = "admin" | "staff" | "client";

/** Source of truth for `role_permissions` on first boot (see seedPermissions
 * in server/db/seed.ts). Editing these constants only changes what gets
 * seeded into an *empty* table — once seeded, the DB rows are authoritative,
 * so change existing grants via the `role_permissions` table, not here. */
export const DEFAULT_GRANTS: Record<Role, Capability[]> = {
  admin: Object.values(CAPABILITIES),
  staff: [
    CAPABILITIES.CRM_READ,
    CAPABILITIES.CRM_WRITE,
    CAPABILITIES.INVENTORY_READ,
    CAPABILITIES.INVENTORY_WRITE,
    CAPABILITIES.INVOICES_READ,
    CAPABILITIES.INVOICES_WRITE,
    CAPABILITIES.SALES_READ,
    CAPABILITIES.SALES_WRITE,
    CAPABILITIES.PURCHASING_READ,
    CAPABILITIES.PURCHASING_WRITE,
  ],
  client: [],
};

export async function hasCapability(role: Role, capability: Capability): Promise<boolean> {
  const row = await db.query.rolePermissions.findFirst({
    where: (rp, { and, eq: eqOp }) => and(eqOp(rp.role, role), eqOp(rp.capability, capability)),
  });
  if (row) return row.granted;
  // Table not seeded yet (fresh DB before first boot's seed ran) — fall
  // back to defaults rather than locking everyone out.
  return DEFAULT_GRANTS[role]?.includes(capability) ?? false;
}

export async function requireCapability(req: Request, capability: Capability): Promise<AuthUser> {
  const user = await getCurrentUser(req);
  if (!user) throw new AppError(401, "User not logged in");
  if (!(await hasCapability(user.role, capability))) {
    throw new AppError(403, `Missing capability: ${capability}`);
  }
  return user;
}

export async function grantCapability(role: Role, capability: Capability, granted: boolean) {
  await db
    .insert(rolePermissions)
    .values({ role, capability, granted })
    .onConflictDoUpdate({
      target: [rolePermissions.role, rolePermissions.capability],
      set: { granted },
    });
}
