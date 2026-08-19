import { eq } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler, requireStaffOrAdmin } from "../auth.ts";
import { db } from "../db/client.ts";
import { companies, contacts } from "../db/schema.ts";

const router = Router();

function rowToContact(row: typeof contacts.$inferSelect) {
  return {
    _id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    companyId: row.companyId,
    createdBy: row.createdBy,
  };
}

router.get(
  "/contacts",
  asyncHandler(async (req, res) => {
    await requireStaffOrAdmin(req);
    const rows = await db
      .select({ contact: contacts, companyName: companies.name })
      .from(contacts)
      .leftJoin(companies, eq(companies.id, contacts.companyId))
      .orderBy(contacts.name);
    res.json(rows.map((r) => ({ ...rowToContact(r.contact), companyName: r.companyName })));
  }),
);

router.get(
  "/contacts/:id",
  asyncHandler(async (req, res) => {
    await requireStaffOrAdmin(req);
    const [row] = await db
      .select({ contact: contacts, companyName: companies.name })
      .from(contacts)
      .leftJoin(companies, eq(companies.id, contacts.companyId))
      .where(eq(contacts.id, req.params.id))
      .limit(1);
    if (!row) {
      res.json(null);
      return;
    }
    res.json({ ...rowToContact(row.contact), companyName: row.companyName });
  }),
);

router.post(
  "/contacts",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const { name, email, phone, companyId } = req.body as {
      name: string;
      email?: string;
      phone?: string;
      companyId?: string;
    };
    const [created] = await db
      .insert(contacts)
      .values({
        name,
        email: email ?? null,
        phone: phone ?? null,
        companyId: companyId ?? null,
        createdBy: user._id,
      })
      .returning({ id: contacts.id });

    await recordAudit({
      actorId: user._id,
      action: "create",
      entityType: "contact",
      entityId: created.id,
      changes: { name, email, phone, companyId },
    });

    res.json({ _id: created.id });
  }),
);

router.patch(
  "/contacts/:id",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const { name, email, phone, companyId } = req.body as {
      name: string;
      email?: string;
      phone?: string;
      companyId?: string;
    };
    const [updated] = await db
      .update(contacts)
      .set({ name, email: email ?? null, phone: phone ?? null, companyId: companyId ?? null })
      .where(eq(contacts.id, req.params.id))
      .returning({ id: contacts.id });
    if (!updated) throw new AppError(404, "Contact not found");

    await recordAudit({
      actorId: user._id,
      action: "update",
      entityType: "contact",
      entityId: req.params.id,
      changes: { name, email, phone, companyId },
    });

    res.json(null);
  }),
);

router.delete(
  "/contacts/:id",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    await db.delete(contacts).where(eq(contacts.id, req.params.id));

    await recordAudit({
      actorId: user._id,
      action: "delete",
      entityType: "contact",
      entityId: req.params.id,
    });

    res.json(null);
  }),
);

export default router;
