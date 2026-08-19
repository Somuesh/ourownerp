import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler, requireStaffOrAdmin } from "../auth.ts";
import { db } from "../db/client.ts";
import { products, stockAdjustments, users } from "../db/schema.ts";

const router = Router();

router.get(
  "/products/:productId/adjustments",
  asyncHandler(async (req, res) => {
    await requireStaffOrAdmin(req);
    const rows = await db
      .select({
        adjustment: stockAdjustments,
        createdByName: users.name,
        createdByEmail: users.email,
      })
      .from(stockAdjustments)
      .innerJoin(users, eq(users.id, stockAdjustments.createdBy))
      .where(eq(stockAdjustments.productId, req.params.productId))
      .orderBy(desc(stockAdjustments.createdAt))
      .limit(50);

    res.json(
      rows.map((r) => ({
        _id: r.adjustment.id,
        productId: r.adjustment.productId,
        quantityChange: r.adjustment.quantityChange,
        reason: r.adjustment.reason,
        createdBy: r.adjustment.createdBy,
        createdAtIso: r.adjustment.createdAt.toISOString(),
        createdByName: r.createdByName ?? r.createdByEmail ?? null,
      })),
    );
  }),
);

router.post(
  "/products/:productId/adjustments",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const { quantityChange, reason } = req.body as { quantityChange: number; reason: string };

    await db.transaction(async (tx) => {
      const product = await tx.query.products.findFirst({
        where: eq(products.id, req.params.productId),
      });
      if (!product) throw new AppError(404, "Product not found");

      const newQuantity = product.stockQuantity + quantityChange;
      if (newQuantity < 0) {
        throw new AppError(400, "Stock quantity cannot go below zero");
      }

      await tx
        .update(products)
        .set({ stockQuantity: newQuantity })
        .where(eq(products.id, req.params.productId));

      await tx.insert(stockAdjustments).values({
        productId: req.params.productId,
        quantityChange,
        reason,
        createdBy: user._id,
      });
    });

    await recordAudit({
      actorId: user._id,
      action: "create",
      entityType: "stock_adjustment",
      entityId: req.params.productId,
      changes: { quantityChange, reason },
    });

    res.json(null);
  }),
);

export default router;
