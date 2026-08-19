import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler, requireStaffOrAdmin } from "../auth.ts";
import { db } from "../db/client.ts";
import { companies, contacts, deals } from "../db/schema.ts";

const router = Router();

function rowToDeal(row: typeof deals.$inferSelect) {
  return {
    _id: row.id,
    title: row.title,
    value: Number(row.value),
    stage: row.stage,
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
      .select({ deal: deals, contactName: contacts.name, companyName: companies.name })
      .from(deals)
      .leftJoin(contacts, eq(contacts.id, deals.contactId))
      .leftJoin(companies, eq(companies.id, deals.companyId))
      .orderBy(desc(deals.createdAt));
    res.json(
      rows.map((r) => ({
        ...rowToDeal(r.deal),
        contactName: r.contactName,
        companyName: r.companyName,
      })),
    );
  }),
);

router.post(
  "/deals",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const { title, value, stage, contactId, companyId } = req.body as {
      title: string;
      value: number;
      stage: "new" | "qualified" | "proposal" | "won" | "lost";
      contactId?: string;
      companyId?: string;
    };
    const [created] = await db
      .insert(deals)
      .values({
        title,
        value: String(value),
        stage,
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
      changes: { title, value, stage, contactId, companyId },
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
    const { stage } = req.body as { stage: string };
    const [updated] = await db
      .update(deals)
      .set({ stage: stage as "new" | "qualified" | "proposal" | "won" | "lost" })
      .where(eq(deals.id, req.params.id))
      .returning({ id: deals.id });
    if (!updated) throw new AppError(404, "Deal not found");

    await recordAudit({
      actorId: user._id,
      action: "status_change",
      entityType: "deal",
      entityId: req.params.id,
      changes: { stage },
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
