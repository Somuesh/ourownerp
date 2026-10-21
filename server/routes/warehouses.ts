import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler } from "../auth.ts";
import { db } from "../db/client.ts";
import { nextSequenceNumber } from "../db/sequences.ts";
import { products, stockLevels, stockTransfers, users, warehouses } from "../db/schema.ts";
import { CAPABILITIES, requireCapability } from "../permissions.ts";

const router = Router();

function toWarehouse(w: typeof warehouses.$inferSelect) {
  return {
    _id: w.id,
    name: w.name,
    code: w.code,
    address: w.address,
    isDefault: w.isDefault,
    isActive: w.isActive,
  };
}

router.get(
  "/warehouses",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.INVENTORY_READ);
    const rows = await db.select().from(warehouses).orderBy(desc(warehouses.isDefault), warehouses.name);
    res.json(rows.map(toWarehouse));
  }),
);

router.post(
  "/warehouses",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.INVENTORY_WRITE);
    const { name, code, address } = req.body as { name: string; code?: string; address?: string };
    if (!name?.trim()) throw new AppError(400, "Name is required");
    const finalCode = (code?.trim() || name.trim().slice(0, 4)).toUpperCase();
    try {
      const [row] = await db
        .insert(warehouses)
        .values({ name: name.trim(), code: finalCode, address: address?.trim() || null })
        .returning();
      await recordAudit({
        actorId: user._id,
        action: "create",
        entityType: "warehouse",
        entityId: row.id,
        changes: { name: row.name, code: row.code },
      });
      res.json(toWarehouse(row));
    } catch (e: any) {
      if (e?.code === "23505" || e?.cause?.code === "23505") {
        throw new AppError(400, "A warehouse with that name or code already exists");
      }
      throw e;
    }
  }),
);

router.patch(
  "/warehouses/:id",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.INVENTORY_WRITE);
    const { name, address, isActive } = req.body as {
      name?: string;
      address?: string | null;
      isActive?: boolean;
    };
    const existing = await db.query.warehouses.findFirst({ where: eq(warehouses.id, req.params.id) });
    if (!existing) throw new AppError(404, "Warehouse not found");
    if (existing.isDefault && isActive === false) {
      throw new AppError(400, "The default warehouse cannot be deactivated");
    }
    const patch: Partial<typeof warehouses.$inferInsert> = {};
    if (name !== undefined) patch.name = name.trim();
    if (address !== undefined) patch.address = address?.trim() || null;
    if (isActive !== undefined) patch.isActive = isActive;
    if (Object.keys(patch).length > 0) {
      await db.update(warehouses).set(patch).where(eq(warehouses.id, req.params.id));
    }
    await recordAudit({
      actorId: user._id,
      action: "update",
      entityType: "warehouse",
      entityId: req.params.id,
      changes: patch,
    });
    res.json(null);
  }),
);

/** Stock per product per warehouse. Default warehouse = total - others. */
router.get(
  "/inventory/stock",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.INVENTORY_READ);
    const [whs, prods, levels] = await Promise.all([
      db.select().from(warehouses).orderBy(desc(warehouses.isDefault), warehouses.name),
      db.select().from(products).orderBy(products.name),
      db.select().from(stockLevels),
    ]);
    const defaultWh = whs.find((w) => w.isDefault);
    const byProduct = new Map<string, Map<string, number>>();
    for (const l of levels) {
      if (!byProduct.has(l.productId)) byProduct.set(l.productId, new Map());
      byProduct.get(l.productId)!.set(l.warehouseId, l.quantity);
    }
    res.json({
      warehouses: whs.map(toWarehouse),
      products: prods.map((p) => {
        const m = byProduct.get(p.id) ?? new Map<string, number>();
        const others = [...m.entries()].filter(([id]) => id !== defaultWh?.id).reduce((a, [, q]) => a + q, 0);
        const quantities: Record<string, number> = {};
        for (const w of whs) {
          quantities[w.id] = w.isDefault ? p.stockQuantity - others : (m.get(w.id) ?? 0);
        }
        return {
          _id: p.id,
          name: p.name,
          sku: p.sku,
          total: p.stockQuantity,
          lowStockThreshold: p.lowStockThreshold,
          quantities,
        };
      }),
    });
  }),
);

/** Products at or below their low-stock threshold with a suggested reorder qty. */
router.get(
  "/inventory/reorder",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.INVENTORY_READ);
    const rows = await db
      .select()
      .from(products)
      .where(sql`${products.stockQuantity} <= ${products.lowStockThreshold}`)
      .orderBy(products.name);
    res.json(
      rows.map((p) => ({
        _id: p.id,
        name: p.name,
        sku: p.sku,
        stockQuantity: p.stockQuantity,
        lowStockThreshold: p.lowStockThreshold,
        suggestedReorderQuantity: Math.max(p.lowStockThreshold * 2 - p.stockQuantity, 1),
      })),
    );
  }),
);

router.get(
  "/stock-transfers",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.INVENTORY_READ);
    const rows = await db
      .select({ t: stockTransfers, productName: products.name, sku: products.sku, by: users.name, byEmail: users.email })
      .from(stockTransfers)
      .innerJoin(products, eq(products.id, stockTransfers.productId))
      .innerJoin(users, eq(users.id, stockTransfers.createdBy))
      .orderBy(desc(stockTransfers.createdAt))
      .limit(100);
    const whRows = await db.select().from(warehouses);
    const whName = new Map(whRows.map((w) => [w.id, w.name]));
    res.json(
      rows.map((r) => ({
        _id: r.t.id,
        transferNumber: r.t.transferNumber,
        productId: r.t.productId,
        productName: r.productName,
        sku: r.sku,
        fromWarehouseId: r.t.fromWarehouseId,
        fromWarehouseName: whName.get(r.t.fromWarehouseId) ?? "",
        toWarehouseId: r.t.toWarehouseId,
        toWarehouseName: whName.get(r.t.toWarehouseId) ?? "",
        quantity: r.t.quantity,
        note: r.t.note,
        createdByName: r.by ?? r.byEmail ?? null,
        createdAtIso: r.t.createdAt.toISOString(),
      })),
    );
  }),
);

router.post(
  "/stock-transfers",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.INVENTORY_WRITE);
    const { productId, fromWarehouseId, toWarehouseId, quantity, note } = req.body as {
      productId: string;
      fromWarehouseId: string;
      toWarehouseId: string;
      quantity: number;
      note?: string;
    };
    if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError(400, "Quantity must be a positive whole number");
    if (fromWarehouseId === toWarehouseId) throw new AppError(400, "Source and destination must differ");

    const transferNumber = await nextSequenceNumber("stock_transfer");

    await db.transaction(async (tx) => {
      const product = await tx.query.products.findFirst({ where: eq(products.id, productId) });
      if (!product) throw new AppError(404, "Product not found");
      const whs = await tx
        .select()
        .from(warehouses)
        .where(inArray(warehouses.id, [fromWarehouseId, toWarehouseId]));
      if (whs.length !== 2) throw new AppError(404, "Warehouse not found");
      if (whs.some((w) => !w.isActive)) throw new AppError(400, "Warehouse is inactive");
      const from = whs.find((w) => w.id === fromWarehouseId)!;
      const to = whs.find((w) => w.id === toWarehouseId)!;

      const levels = await tx.select().from(stockLevels).where(eq(stockLevels.productId, productId));
      const defaultWh = await tx.query.warehouses.findFirst({ where: eq(warehouses.isDefault, true) });
      const others = levels
        .filter((l) => l.warehouseId !== defaultWh?.id)
        .reduce((a, l) => a + l.quantity, 0);
      const available = from.isDefault
        ? product.stockQuantity - others
        : (levels.find((l) => l.warehouseId === from.id)?.quantity ?? 0);
      if (available < quantity) {
        throw new AppError(400, `Only ${available} in ${from.name} for ${product.name}`);
      }

      // Default warehouse is implicit — only touch rows for non-default ones.
      if (!from.isDefault) {
        await tx
          .update(stockLevels)
          .set({ quantity: sql`${stockLevels.quantity} - ${quantity}` })
          .where(and(eq(stockLevels.productId, productId), eq(stockLevels.warehouseId, from.id)));
      }
      if (!to.isDefault) {
        await tx
          .insert(stockLevels)
          .values({ productId, warehouseId: to.id, quantity })
          .onConflictDoUpdate({
            target: [stockLevels.productId, stockLevels.warehouseId],
            set: { quantity: sql`${stockLevels.quantity} + ${quantity}` },
          });
      }

      await tx.insert(stockTransfers).values({
        transferNumber,
        productId,
        fromWarehouseId,
        toWarehouseId,
        quantity,
        note: note?.trim() || null,
        createdBy: user._id,
      });
    });

    await recordAudit({
      actorId: user._id,
      action: "create",
      entityType: "stock_transfer",
      entityId: productId,
      changes: { transferNumber, fromWarehouseId, toWarehouseId, quantity },
    });
    res.json({ transferNumber });
  }),
);

export default router;
