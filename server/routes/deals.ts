import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler, requireStaffOrAdmin } from "../auth.ts";
import { db } from "../db/client.ts";
import { companies, contacts, deals, dealStages } from "../db/schema.ts";

const router = Router();

function rowToDeal(row: typeof deals.$inferSelect) {
  return {
    _id: row.id,
    title: row.title,
    value: Number(row.value),
    stageId: row.stageId,
    contactId: row.contactId,
    companyId: row.companyId,
    createdBy: row.createdBy,
  };
}

router.get(
  "/deals",
  asyncHandler(async (req, res) => {
    await requireStaffOrAdmin(req);
    const rows = await db
      .select({
        deal: deals,
        contactName: contacts.name,
        companyName: companies.name,
        stageName: dealStages.name,
      })
      .from(deals)
      .leftJoin(contacts, eq(contacts.id, deals.contactId))
      .leftJoin(companies, eq(companies.id, deals.companyId))
      .leftJoin(dealStages, eq(dealStages.id, deals.stageId))
      .orderBy(desc(deals.createdAt));
    res.json(
      rows.map((r) => ({
        ...rowToDeal(r.deal),
        contactName: r.contactName,
        companyName: r.companyName,
        stageName: r.stageName,
      })),
    );
  }),
);

router.post(
  "/deals",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const { title, value, stageId, contactId, companyId } = req.body as {
      title: string;
      value: number;
      stageId: string;
      contactId?: string;
      companyId?: string;
    };
    if (!stageId) throw new AppError(400, "A stage is required");

    const [created] = await db
      .insert(deals)
      .values({
        title,
        value: String(value),
        stageId,
        contactId: contactId ?? null,
        companyId: companyId ?? null,
        createdBy: user._id,
      })
      .returning({ id: deals.id });

    await recordAudit({
      actorId: user._id,
      action: "create",
      entityType: "deal",
      entityId: created.id,
      changes: { title, value, stageId, contactId, companyId },
    });

    res.json({ _id: created.id });
  }),
);

router.patch(
  "/deals/:id",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const { title, value, contactId, companyId } = req.body as {
      title: string;
      value: number;
      contactId?: string;
      companyId?: string;
    };
    const [updated] = await db
      .update(deals)
      .set({
        title,
        value: String(value),
        contactId: contactId ?? null,
        companyId: companyId ?? null,
      })
      .where(eq(deals.id, req.params.id))
      .returning({ id: deals.id });
    if (!updated) throw new AppError(404, "Deal not found");

    await recordAudit({
      actorId: user._id,
      action: "update",
      entityType: "deal",
      entityId: req.params.id,
      changes: { title, value, contactId, companyId },
    });

    res.json(null);
  }),
);

router.patch(
  "/deals/:id/stage",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const { stageId } = req.body as { stageId: string };
    if (!stageId) throw new AppError(400, "A stage is required");

    const stage = await db.query.dealStages.findFirst({ where: eq(dealStages.id, stageId) });
    if (!stage) throw new AppError(404, "Stage not found");

    const [updated] = await db
      .update(deals)
      .set({ stageId })
      .where(eq(deals.id, req.params.id))
      .returning({ id: deals.id });
    if (!updated) throw new AppError(404, "Deal not found");

    await recordAudit({
      actorId: user._id,
      action: "status_change",
      entityType: "deal",
      entityId: req.params.id,
      changes: { stageId, stageName: stage.name },
    });

    res.json(null);
  }),
);

router.delete(
  "/deals/:id",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    await db.delete(deals).where(eq(deals.id, req.params.id));

    await recordAudit({
      actorId: user._id,
      action: "delete",
      entityType: "deal",
      entityId: req.params.id,
    });

    res.json(null);
  }),
);

export default router;
