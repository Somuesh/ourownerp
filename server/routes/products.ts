import { eq } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler, requireStaffOrAdmin } from "../auth.ts";
import { db } from "../db/client.ts";
import { products, stockAdjustments } from "../db/schema.ts";

const router = Router();

function rowToProduct(row: typeof products.$inferSelect) {
  return {
    _id: row.id,
    name: row.name,
    sku: row.sku,
    price: Number(row.price),
    stockQuantity: row.stockQuantity,
    lowStockThreshold: row.lowStockThreshold,
    category: row.category,
    createdBy: row.createdBy,
  };
}

router.get(
  "/products",
  asyncHandler(async (req, res) => {
    await requireStaffOrAdmin(req);
    const rows = await db.query.products.findMany({ orderBy: (p, { asc }) => asc(p.name) });
    res.json(rows.map(rowToProduct));
  }),
);

router.get(
  "/products/:id",
  asyncHandler(async (req, res) => {
    await requireStaffOrAdmin(req);
    const row = await db.query.products.findFirst({ where: eq(products.id, req.params.id) });
    res.json(row ? rowToProduct(row) : null);
  }),
);

router.post(
  "/products",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const { name, sku, price, stockQuantity, lowStockThreshold, category } = req.body as {
      name: string;
      sku: string;
      price: number;
      stockQuantity: number;
      lowStockThreshold: number;
      category?: string;
    };

    const existing = await db.query.products.findFirst({ where: eq(products.sku, sku) });
    if (existing) throw new AppError(409, "A product with this SKU already exists");

    const [created] = await db
      .insert(products)
      .values({
        name,
        sku,
        price: String(price),
        stockQuantity,
        lowStockThreshold,
        category: category ?? null,
        createdBy: user._id,
      })
      .returning({ id: products.id });

    await recordAudit({
      actorId: user._id,
      action: "create",
      entityType: "product",
      entityId: created.id,
      changes: { name, sku, price, stockQuantity, lowStockThreshold, category },
    });

    res.json({ _id: created.id });
  }),
);

router.patch(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const product = await db.query.products.findFirst({ where: eq(products.id, req.params.id) });
    if (!product) throw new AppError(404, "Product not found");

    const { name, sku, price, lowStockThreshold, category } = req.body as {
      name: string;
      sku: string;
      price: number;
      lowStockThreshold: number;
      category?: string;
    };

    if (sku !== product.sku) {
      const existing = await db.query.products.findFirst({ where: eq(products.sku, sku) });
      if (existing) throw new AppError(409, "A product with this SKU already exists");
    }

    await db
      .update(products)
      .set({ name, sku, price: String(price), lowStockThreshold, category: category ?? null })
      .where(eq(products.id, req.params.id));

    await recordAudit({
      actorId: user._id,
      action: "update",
      entityType: "product",
      entityId: req.params.id,
      changes: { name, sku, price, lowStockThreshold, category },
    });

    res.json(null);
  }),
);

router.delete(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    await db.delete(stockAdjustments).where(eq(stockAdjustments.productId, req.params.id));
    await db.delete(products).where(eq(products.id, req.params.id));

    await recordAudit({
      actorId: user._id,
      action: "delete",
      entityType: "product",
      entityId: req.params.id,
    });

    res.json(null);
  }),
);

export default router;
