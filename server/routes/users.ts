import { and, eq, isNull } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler, getCurrentUser, getIdentity, requireAdmin } from "../auth.ts";
import { db } from "../db/client.ts";
import { userInvites, users } from "../db/schema.ts";

const router = Router();

function rowToUser(row: typeof users.$inferSelect) {
  return {
    _id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    contactId: row.contactId,
  };
}

/** Called once right after login. Creates the local `users` row for this
 * identity the first time it's seen.
 *
 * Security note: this used to auto-create a "staff" account for ANY
 * successfully authenticated OIDC identity — meaning anyone with a Google
 * account (or whatever your OIDC provider is) could sign in and get real
 * access. OIDC login only proves *who* someone is, not that they're
 * allowed in. Fixed here: the very first user ever becomes admin
 * (bootstrap, so you can get started at all); after that, signing in only
 * creates an account if there's a matching, unused invite for that email
 * (see server/routes/userInvites.ts) — everyone else is rejected. */
router.post(
  "/users/sync",
  asyncHandler(async (req, res) => {
    const identity = await getIdentity(req);
    const existing = await db.query.users.findFirst({
      where: eq(users.tokenIdentifier, identity.sub),
    });
    if (existing) {
      res.json({ _id: existing.id });
      return;
    }

    const [anyUser] = await db.select({ id: users.id }).from(users).limit(1);

    if (!anyUser) {
      const [created] = await db
        .insert(users)
        .values({
          tokenIdentifier: identity.sub,
          name: identity.name ?? null,
          email: identity.email ?? null,
          role: "admin",
        })
        .returning({ id: users.id });

      await recordAudit({
        actorId: created.id,
        action: "create",
        entityType: "user",
        entityId: created.id,
        changes: { role: "admin", email: identity.email ?? null, bootstrap: true },
      });

      res.json({ _id: created.id });
      return;
    }

    if (!identity.email) {
      throw new AppError(
        403,
        "Your account doesn't expose an email address we can match to an invite.",
      );
    }
    const normalizedEmail = identity.email.toLowerCase();

    const invite = await db.query.userInvites.findFirst({
      where: and(
        eq(userInvites.email, normalizedEmail),
        isNull(userInvites.acceptedAt),
        isNull(userInvites.revokedAt),
      ),
    });

    if (!invite) {
      throw new AppError(
        403,
        "Your account isn't invited to Our ERP yet. Ask an admin to invite you, then sign in again.",
      );
    }

    const [created] = await db
      .insert(users)
      .values({
        tokenIdentifier: identity.sub,
        name: identity.name ?? null,
        email: identity.email,
        role: invite.role,
      })
      .returning({ id: users.id });

    await db.update(userInvites).set({ acceptedAt: new Date() }).where(eq(userInvites.id, invite.id));

    await recordAudit({
      actorId: created.id,
      action: "create",
      entityType: "user",
      entityId: created.id,
      changes: { role: invite.role, email: identity.email, fromInvite: invite.id },
    });

    res.json({ _id: created.id });
  }),
);

router.get(
  "/users/me",
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser(req);
    res.json(user);
  }),
);

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    const rows = await db.query.users.findMany({ orderBy: (u, { asc }) => asc(u.name) });
    res.json(rows.map(rowToUser));
  }),
);

router.patch(
  "/users/:id/role",
  asyncHandler(async (req, res) => {
    const admin = await requireAdmin(req);
    const { id } = req.params;
    if (admin._id === id) {
      throw new AppError(403, "You cannot change your own role");
    }
    const { role } = req.body as { role: "admin" | "staff" | "client" };
    const [updated] = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, id))
      .returning({ id: users.id });
    if (!updated) throw new AppError(404, "User not found");

    await recordAudit({
      actorId: admin._id,
      action: "update",
      entityType: "user",
      entityId: id,
      changes: { role },
    });

    res.json(null);
  }),
);

router.patch(
  "/users/:id/contact",
  asyncHandler(async (req, res) => {
    const admin = await requireAdmin(req);
    const { id } = req.params;
    const { contactId } = req.body as { contactId?: string | null };
    const [updated] = await db
      .update(users)
      .set({ contactId: contactId ?? null })
      .where(eq(users.id, id))
      .returning({ id: users.id });
    if (!updated) throw new AppError(404, "User not found");

    await recordAudit({
      actorId: admin._id,
      action: "update",
      entityType: "user",
      entityId: id,
      changes: { contactId: contactId ?? null },
    });

    res.json(null);
  }),
);

export default router;
