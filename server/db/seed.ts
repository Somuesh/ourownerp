import { db } from "./client.ts";
import { dealStages, rolePermissions, warehouses } from "./schema.ts";
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

/** Populates `deal_stages` with a starter pipeline the first time the
 * server boots against an empty table — same idempotent pattern as
 * seedPermissions. Users can rename, reorder (via sortOrder), add, and
 * delete these freely from the Deals kanban afterward; this only seeds an
 * empty table, it never overwrites existing stages. */
export async function seedDealStages(): Promise<void> {
  const existing = await db.select({ id: dealStages.id }).from(dealStages).limit(1);
  if (existing.length > 0) return;

  await db.insert(dealStages).values([
    { name: "New", sortOrder: 0 },
    { name: "Qualified", sortOrder: 1 },
    { name: "Proposal", sortOrder: 2 },
    { name: "Won", sortOrder: 3, isWon: true },
    { name: "Lost", sortOrder: 4, isLost: true },
  ]);
  console.log("Seeded default deal stages.");
}

/** Creates the default "Main Warehouse" on first boot. All pre-existing stock
 * is implicitly held there (see schema.ts note on stock_levels). */
export async function seedWarehouses(): Promise<void> {
  const existing = await db.select({ id: warehouses.id }).from(warehouses).limit(1);
  if (existing.length > 0) return;
  await db.insert(warehouses).values({ name: "Main Warehouse", code: "MAIN", isDefault: true });
}
