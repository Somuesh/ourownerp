import { eq, sql } from "drizzle-orm";
import { AppError } from "../auth.ts";
import { db } from "./client.ts";
import { products, stockLevels, warehouses } from "./schema.ts";

// The transaction handle passed to db.transaction callbacks.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Resolves the warehouse to use: the requested one (must be active), else the default. */
export async function resolveWarehouse(tx: Tx, warehouseId?: string | null) {
  const wh = warehouseId
    ? await tx.query.warehouses.findFirst({ where: eq(warehouses.id, warehouseId) })
    : await tx.query.warehouses.findFirst({ where: eq(warehouses.isDefault, true) });
  if (!wh) throw new AppError(404, warehouseId ? "Warehouse not found" : "No default warehouse configured");
  if (!wh.isActive) throw new AppError(400, `Warehouse "${wh.name}" is inactive`);
  return wh;
}

/** Quantity of a product held in a given warehouse (default warehouse is implicit). */
export async function availableIn(
  tx: Tx,
  product: { id: string; stockQuantity: number },
  wh: { id: string; isDefault: boolean },
): Promise<number> {
  const levels = await tx.select().from(stockLevels).where(eq(stockLevels.productId, product.id));
  if (!wh.isDefault) return levels.find((l) => l.warehouseId === wh.id)?.quantity ?? 0;
  const others = levels.reduce((a, l) => a + l.quantity, 0); // only non-default rows exist
  return product.stockQuantity - others;
}

/**
 * Applies a stock change (delta, +/-) to one warehouse and to the product total.
 * Throws 400 if the warehouse would go below zero. Must run inside a transaction.
 */
export async function applyStockChange(
  tx: Tx,
  product: { id: string; name: string; stockQuantity: number },
  wh: { id: string; name: string; isDefault: boolean },
  delta: number,
) {
  if (delta < 0) {
    const have = await availableIn(tx, product, wh);
    if (have + delta < 0) {
      throw new AppError(
        400,
        `Not enough stock for "${product.name}" in ${wh.name} (have ${have}, need ${Math.abs(delta)})`,
      );
    }
  }
  if (!wh.isDefault) {
    await tx
      .insert(stockLevels)
      .values({ productId: product.id, warehouseId: wh.id, quantity: delta })
      .onConflictDoUpdate({
        target: [stockLevels.productId, stockLevels.warehouseId],
        set: { quantity: sql`${stockLevels.quantity} + ${delta}` },
      });
  }
  await tx
    .update(products)
    .set({ stockQuantity: sql`${products.stockQuantity} + ${delta}` })
    .where(eq(products.id, product.id));
}
