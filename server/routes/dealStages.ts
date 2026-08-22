import { asc, eq } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler, requireStaffOrAdmin } from "../auth.ts";
import { db } from "../db/client.ts";
import { deals, dealStages } from "../db/schema.ts";

const router = Router();

function rowToStage(row: typeof dealStages.$inferSelect) {
  return {
    _id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    isWon: row.isWon,
    isLost: row.isLost,
  };
}

router.get(
  "/deal-stages",
  asyncHandler(async (req, res) => {
    await requireStaffOrAdmin(req);
    const rows = await db.query.dealStages.findMany({ orderBy: asc(dealStages.sortOrder) });
    res.json(rows.map(rowToStage));
  }),
);

router.post(
  "/deal-stages",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const { name } = req.body as { name: string };
    if (!name?.trim()) throw new AppError(400, "Stage name is required");

    const existing = await db.query.dealStages.findMany();
    const nextOrder = existing.length > 0 ? Math.max(...existing.map((r) => r.sortOrder)) + 1 : 0;

    const [created] = await db
      .insert(dealStages)
      .values({ name: name.trim(), sortOrder: nextOrder })
      .returning();

    await recordAudit({
      actorId: user._id,
      action: "create",
      entityType: "deal_stage",
      entityId: created.id,
      changes: { name },
    });

    res.json(rowToStage(created));
  }),
);

/** Rename, or mark/unmark as the Won or Lost stage. At most one stage can
 * be `isWon` and one `isLost` at a time — setting either flag on a stage
 * clears it from whichever other stage previously had it, so the dashboard
 * always has an unambiguous "which stages close a deal" answer. */
router.patch(
  "/deal-stages/:id",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const stage = await db.query.dealStages.findFirst({ where: eq(dealStages.id, req.params.id) });
    if (!stage) throw new AppError(404, "Stage not found");

    const { name, isWon, isLost } = req.body as {
      name?: string;
      isWon?: boolean;
      isLost?: boolean;
    };

    await db.transaction(async (tx) => {
      if (isWon) {
        await tx.update(dealStages).set({ isWon: false }).where(eq(dealStages.isWon, true));
      }
      if (isLost) {
        await tx.update(dealStages).set({ isLost: false }).where(eq(dealStages.isLost, true));
      }
      await tx
        .update(dealStages)
        .set({
          ...(name !== undefined ? { name: name.trim() } : {}),
          ...(isWon !== undefined ? { isWon } : {}),
          ...(isLost !== undefined ? { isLost } : {}),
        })
        .where(eq(dealStages.id, req.params.id));
    });

    await recordAudit({
      actorId: user._id,
      action: "update",
      entityType: "deal_stage",
      entityId: req.params.id,
      changes: { name, isWon, isLost },
    });

    res.json(null);
  }),
);

/** Only deletable while empty — move or delete the deals in it first, same
 * reasoning as everywhere else deletion is blocked on referenced records. */
router.delete(
  "/deal-stages/:id",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const [dealInStage] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(eq(deals.stageId, req.params.id))
      .limit(1);
    if (dealInStage) {
      throw new AppError(409, "Move or delete the deals in this stage first");
    }

    const remaining = await db.query.dealStages.findMany();
    if (remaining.length <= 1) {
      throw new AppError(409, "At least one stage is required");
    }

    await db.delete(dealStages).where(eq(dealStages.id, req.params.id));

    await recordAudit({
      actorId: user._id,
      action: "delete",
      entityType: "deal_stage",
      entityId: req.params.id,
    });

    res.json(null);
  }),
);

export default router;
