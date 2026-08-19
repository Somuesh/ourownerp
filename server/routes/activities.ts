import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler, requireStaffOrAdmin } from "../auth.ts";
import { db } from "../db/client.ts";
import { activities, contacts, users } from "../db/schema.ts";

const router = Router();

router.get(
  "/contacts/:contactId/activities",
  asyncHandler(async (req, res) => {
    await requireStaffOrAdmin(req);
    const rows = await db
      .select({
        activity: activities,
        authorName: users.name,
        authorEmail: users.email,
      })
      .from(activities)
      .innerJoin(users, eq(users.id, activities.authorId))
      .where(eq(activities.contactId, req.params.contactId))
      .orderBy(desc(activities.createdAt));

    res.json(
      rows.map((r) => ({
        _id: r.activity.id,
        contactId: r.activity.contactId,
        authorId: r.activity.authorId,
        note: r.activity.note,
        createdAtIso: r.activity.createdAt.toISOString(),
        authorName: r.authorName ?? r.authorEmail ?? null,
      })),
    );
  }),
);

router.post(
  "/contacts/:contactId/activities",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const contact = await db.query.contacts.findFirst({
      where: eq(contacts.id, req.params.contactId),
    });
    if (!contact) throw new AppError(404, "Contact not found");

    const { note } = req.body as { note: string };
    const [created] = await db
      .insert(activities)
      .values({ contactId: req.params.contactId, authorId: user._id, note })
      .returning({ id: activities.id });

    await recordAudit({
      actorId: user._id,
      action: "create",
      entityType: "activity",
      entityId: created.id,
      changes: { contactId: req.params.contactId, note },
    });

    res.json({ _id: created.id });
  }),
);

router.delete(
  "/activities/:id",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    await db.delete(activities).where(eq(activities.id, req.params.id));

    await recordAudit({
      actorId: user._id,
      action: "delete",
      entityType: "activity",
      entityId: req.params.id,
    });

    res.json(null);
  }),
);

export default router;
