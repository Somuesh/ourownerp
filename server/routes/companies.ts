import { eq } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler, requireStaffOrAdmin } from "../auth.ts";
import { db } from "../db/client.ts";
import { companies } from "../db/schema.ts";

const router = Router();

function rowToCompany(row: typeof companies.$inferSelect) {
  return {
    _id: row.id,
    name: row.name,
    website: row.website,
    industry: row.industry,
    createdBy: row.createdBy,
  };
}

router.get(
  "/companies",
  asyncHandler(async (req, res) => {
    await requireStaffOrAdmin(req);
    const rows = await db.query.companies.findMany({
      orderBy: (c, { asc }) => asc(c.name),
    });
    res.json(rows.map(rowToCompany));
  }),
);

router.post(
  "/companies",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const { name, website, industry } = req.body as {
      name: string;
      website?: string;
      industry?: string;
    };
    const [created] = await db
      .insert(companies)
      .values({ name, website: website ?? null, industry: industry ?? null, createdBy: user._id })
      .returning({ id: companies.id });

    await recordAudit({
      actorId: user._id,
      action: "create",
      entityType: "company",
      entityId: created.id,
      changes: { name, website, industry },
    });

    res.json({ _id: created.id });
  }),
);

router.patch(
  "/companies/:id",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const { name, website, industry } = req.body as {
      name: string;
      website?: string;
      industry?: string;
    };
    const [updated] = await db
      .update(companies)
      .set({ name, website: website ?? null, industry: industry ?? null })
      .where(eq(companies.id, req.params.id))
      .returning({ id: companies.id });
    if (!updated) throw new AppError(404, "Company not found");

    await recordAudit({
      actorId: user._id,
      action: "update",
      entityType: "company",
      entityId: req.params.id,
      changes: { name, website, industry },
    });

    res.json(null);
  }),
);

router.delete(
  "/companies/:id",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    await db.delete(companies).where(eq(companies.id, req.params.id));

    await recordAudit({
      actorId: user._id,
      action: "delete",
      entityType: "company",
      entityId: req.params.id,
    });

    res.json(null);
  }),
);

export default router;
