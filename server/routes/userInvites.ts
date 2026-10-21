import { and, desc, eq, isNull } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler, requireAdmin } from "../auth.ts";
import { isEmailConfigured } from "../email/client.ts";
import { sendMail } from "../email/send.ts";
import { inviteEmailTemplate } from "../email/templates.ts";
import { db } from "../db/client.ts";
import { userInvites, users } from "../db/schema.ts";

const router = Router();

function rowToInvite(row: typeof userInvites.$inferSelect, inviterName: string | null) {
  return {
    _id: row.id,
    email: row.email,
    role: row.role,
    invitedByName: inviterName,
    createdAtIso: row.createdAt.toISOString(),
    acceptedAtIso: row.acceptedAt?.toISOString() ?? null,
    revokedAtIso: row.revokedAt?.toISOString() ?? null,
  };
}

router.get(
  "/user-invites",
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    const rows = await db
      .select({ invite: userInvites, inviterName: users.name, inviterEmail: users.email })
      .from(userInvites)
      .leftJoin(users, eq(users.id, userInvites.invitedBy))
      .orderBy(desc(userInvites.createdAt));
    res.json(rows.map((r) => rowToInvite(r.invite, r.inviterName ?? r.inviterEmail)));
  }),
);

router.post(
  "/user-invites",
  asyncHandler(async (req, res) => {
    const admin = await requireAdmin(req);
    const { email, role } = req.body as { email: string; role: "admin" | "staff" | "client" };
    if (!email?.trim()) throw new AppError(400, "Email is required");
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await db.query.users.findFirst({ where: eq(users.email, normalizedEmail) });
    if (existingUser) throw new AppError(409, "This email already has an account");

    const existingInvite = await db.query.userInvites.findFirst({
      where: and(
        eq(userInvites.email, normalizedEmail),
        isNull(userInvites.acceptedAt),
        isNull(userInvites.revokedAt),
      ),
    });
    if (existingInvite) throw new AppError(409, "This email already has a pending invite");

    const [created] = await db
      .insert(userInvites)
      .values({ email: normalizedEmail, role, invitedBy: admin._id })
      .returning();

    await recordAudit({
      actorId: admin._id,
      action: "create",
      entityType: "user_invite",
      entityId: created.id,
      changes: { email: normalizedEmail, role },
    });

    let emailSent = false;
    if (isEmailConfigured()) {
      try {
        const { subject, html, text } = inviteEmailTemplate({
          appUrl: process.env.APP_URL ?? "http://localhost:5173",
          role,
          inviterName: admin.name ?? "An admin",
        });
        await sendMail({ to: normalizedEmail, subject, html, text });
        emailSent = true;
      } catch (error) {
        console.error("Failed to send invite email:", error);
      }
    }

    res.json({ ...rowToInvite(created, admin.name), emailSent });
  }),
);

/** Revokes a pending invite (kept as a row with revokedAt set, not deleted
 * outright, for the same audit-trail reasoning as everywhere else). */
router.delete(
  "/user-invites/:id",
  asyncHandler(async (req, res) => {
    const admin = await requireAdmin(req);
    const [updated] = await db
      .update(userInvites)
      .set({ revokedAt: new Date() })
      .where(eq(userInvites.id, req.params.id))
      .returning({ id: userInvites.id });
    if (!updated) throw new AppError(404, "Invite not found");

    await recordAudit({
      actorId: admin._id,
      action: "delete",
      entityType: "user_invite",
      entityId: req.params.id,
    });

    res.json(null);
  }),
);

export default router;
