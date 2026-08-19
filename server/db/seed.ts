import { db } from "./client.ts";
import { rolePermissions } from "./schema.ts";
import { DEFAULT_GRANTS } from "../permissions.ts";

/** Populates `role_permissions` with the default grants the first time the
 * server boots against an empty table. Safe to call on every startup —
 * it's a no-op once rows exist (see server/index.ts). */
export async function seedPermissions(): Promise<void> {
  const existing = await db.select({ role: rolePermissions.role }).from(rolePermissions).limit(1);
  if (existing.length > 0) return;

  const rows = Object.entries(DEFAULT_GRANTS).flatMap(([role, capabilities]) =>
    capabilities.map((capability) => ({
      role: role as "admin" | "staff" | "client",
      capability,
      granted: true,
    })),
  );

  if (rows.length > 0) {
    await db.insert(rolePermissions).values(rows).onConflictDoNothing();
  }
  console.log(`Seeded ${rows.length} default role permission grants.`);
}
