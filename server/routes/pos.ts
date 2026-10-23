import { desc, eq, inArray } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler } from "../auth.ts";
import { db } from "../db/client.ts";
import { nextSequenceNumber } from "../db/sequences.ts";
import { applyStockChange, resolveWarehouse } from "../db/stock.ts";
import {
  posOrderLines,
  posOrders,
  posSessions,
  products,
  stockAdjustments,
  users,
} from "../db/schema.ts";
import { CAPABILITIES, hasCapability, requireCapability } from "../permissions.ts";

const router = Router();
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: string | null) => (v == null ? null : Number(v));

function toSession(s: typeof posSessions.$inferSelect, openedByName?: string | null) {
  return {
    _id: s.id,
    sessionNumber: s.sessionNumber,
    status: s.status,
    warehouseId: s.warehouseId,
    openedByName: openedByName ?? null,
    openingCash: num(s.openingCash),
    closingCash: num(s.closingCash),
    expectedCash: num(s.expectedCash),
    openedAtIso: s.openedAt.toISOString(),
    closedAtIso: s.closedAt?.toISOString() ?? null,
  };
}

async function sessionTotals(sessionId: string) {
  const rows = await db.select().from(posOrders).where(eq(posOrders.sessionId, sessionId));
  const by = { cash: 0, card: 0, upi: 0 };
  let total = 0;
  for (const o of rows) {
    const t = Number(o.total);
    by[o.paymentMethod] += t;
    total += t;
  }
  return { orderCount: rows.length, total: round2(total), byMethod: { cash: round2(by.cash), card: round2(by.card), upi: round2(by.upi) } };
}

/** The signed-in user's open session, if any (null otherwise). */
router.get(
  "/pos/session",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.POS_USE);
    const s = await db.query.posSessions.findFirst({
      where: (t, { and, eq: e }) => and(e(t.openedBy, user._id), e(t.status, "open")),
    });
    res.json(s ? { ...toSession(s, user.name), totals: await sessionTotals(s.id) } : null);
  }),
);

router.get(
  "/pos/sessions",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.POS_USE);
    const manage = await hasCapability(user.role, CAPABILITIES.POS_MANAGE);
    const rows = await db
      .select({ s: posSessions, name: users.name, email: users.email })
      .from(posSessions)
      .innerJoin(users, eq(users.id, posSessions.openedBy))
      .where(manage ? undefined : eq(posSessions.openedBy, user._id))
      .orderBy(desc(posSessions.openedAt))
      .limit(50);
    const out = [];
    for (const r of rows) out.push({ ...toSession(r.s, r.name ?? r.email), totals: await sessionTotals(r.s.id) });
    res.json(out);
  }),
);

router.post(
  "/pos/sessions/open",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.POS_USE);
    const { openingCash, warehouseId } = req.body as { openingCash?: number; warehouseId?: string };
    const cash = Number(openingCash ?? 0);
    if (!(cash >= 0)) throw new AppError(400, "Opening cash must be zero or more");
    const existing = await db.query.posSessions.findFirst({
      where: (t, { and, eq: e }) => and(e(t.openedBy, user._id), e(t.status, "open")),
    });
    if (existing) throw new AppError(409, `You already have an open session (${existing.sessionNumber})`);
    const wh = await resolveWarehouse(db as any, warehouseId);
    const sessionNumber = await nextSequenceNumber("pos_session");
    const [row] = await db
      .insert(posSessions)
      .values({ sessionNumber, warehouseId: wh.id, openedBy: user._id, openingCash: cash.toFixed(2) })
      .returning();
    await recordAudit({ actorId: user._id, action: "create", entityType: "pos_session", entityId: row.id, changes: { sessionNumber, openingCash: cash } });
    res.json(toSession(row, user.name));
  }),
);

router.post(
  "/pos/sessions/:id/close",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.POS_USE);
    const { closingCash } = req.body as { closingCash?: number };
    const closing = Number(closingCash);
    if (!(closing >= 0)) throw new AppError(400, "Counted closing cash is required");
    const s = await db.query.posSessions.findFirst({ where: eq(posSessions.id, req.params.id) });
    if (!s) throw new AppError(404, "Session not found");
    const manage = await hasCapability(user.role, CAPABILITIES.POS_MANAGE);
    if (s.openedBy !== user._id && !manage) throw new AppError(403, "Not your session");
    if (s.status !== "open") throw new AppError(409, "Session is already closed");
    const totals = await sessionTotals(s.id);
    const expected = round2(Number(s.openingCash) + totals.byMethod.cash);
    await db
      .update(posSessions)
      .set({ status: "closed", closedAt: new Date(), closingCash: closing.toFixed(2), expectedCash: expected.toFixed(2) })
      .where(eq(posSessions.id, s.id));
    await recordAudit({ actorId: user._id, action: "status_change", entityType: "pos_session", entityId: s.id, changes: { status: "closed", closing, expected } });
    res.json({ expectedCash: expected, closingCash: closing, difference: round2(closing - expected), totals });
  }),
);

router.get(
  "/pos/orders",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.POS_USE);
    const manage = await hasCapability(user.role, CAPABILITIES.POS_MANAGE);
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    const rows = await db
      .select({ o: posOrders, session: posSessions.openedBy })
      .from(posOrders)
      .innerJoin(posSessions, eq(posSessions.id, posOrders.sessionId))
      .where(sessionId ? eq(posOrders.sessionId, sessionId) : undefined)
      .orderBy(desc(posOrders.createdAt))
      .limit(100);
    res.json(
      rows
        .filter((r) => manage || r.session === user._id)
        .map(({ o }) => ({
          _id: o.id,
          orderNumber: o.orderNumber,
          paymentMethod: o.paymentMethod,
          total: Number(o.total),
          createdAtIso: o.createdAt.toISOString(),
        })),
    );
  }),
);

router.post(
  "/pos/orders",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.POS_USE);
    const b = req.body as {
      sessionId?: string;
      lines: { productId: string; quantity: number }[];
      paymentMethod: "cash" | "card" | "upi";
      amountTendered?: number;
      taxRate?: number;
      contactId?: string;
    };
    if (!Array.isArray(b.lines) || b.lines.length === 0) throw new AppError(400, "Add at least one item");
    if (!["cash", "card", "upi"].includes(b.paymentMethod)) throw new AppError(400, "Invalid payment method");
    const taxRate = Number(b.taxRate ?? 0);
    if (!(taxRate >= 0 && taxRate <= 100)) throw new AppError(400, "Invalid tax rate");
    for (const l of b.lines) {
      if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new AppError(400, "Quantities must be positive whole numbers");
    }

    const orderNumber = await nextSequenceNumber("pos_order");

    const result = await db.transaction(async (tx) => {
      // Session: explicit, else the user's open one.
      const session = b.sessionId
        ? await tx.query.posSessions.findFirst({ where: eq(posSessions.id, b.sessionId) })
        : await tx.query.posSessions.findFirst({
            where: (t, { and, eq: e }) => and(e(t.openedBy, user._id), e(t.status, "open")),
          });
      if (!session) throw new AppError(400, "Open a POS session first");
      if (session.status !== "open") throw new AppError(409, "Session is closed");
      if (session.openedBy !== user._id) throw new AppError(403, "Not your session");

      const wh = await resolveWarehouse(tx, session.warehouseId);
      const ids = [...new Set(b.lines.map((l) => l.productId))];
      const prods = await tx.select().from(products).where(inArray(products.id, ids));
      if (prods.length !== ids.length) throw new AppError(404, "A product was not found");
      const byId = new Map(prods.map((p) => [p.id, p]));

      // Merge duplicate lines so stock checks are right.
      const qtyById = new Map<string, number>();
      for (const l of b.lines) qtyById.set(l.productId, (qtyById.get(l.productId) ?? 0) + l.quantity);

      let subtotal = 0;
      const lineRows = [...qtyById.entries()].map(([productId, quantity]) => {
        const p = byId.get(productId)!;
        const lineTotal = round2(Number(p.price) * quantity);
        subtotal += lineTotal;
        return { productId, description: p.name, quantity, unitPrice: Number(p.price), lineTotal };
      });
      subtotal = round2(subtotal);
      const taxAmount = round2(subtotal * (taxRate / 100));
      const total = round2(subtotal + taxAmount);

      const tendered = b.paymentMethod === "cash" ? Number(b.amountTendered ?? total) : total;
      if (tendered < total) throw new AppError(400, `Amount tendered (${tendered}) is less than total (${total})`);

      const [order] = await tx
        .insert(posOrders)
        .values({
          orderNumber,
          sessionId: session.id,
          contactId: b.contactId || null,
          paymentMethod: b.paymentMethod,
          taxRate: taxRate.toFixed(3),
          subtotal: subtotal.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          total: total.toFixed(2),
          amountTendered: tendered.toFixed(2),
          changeGiven: round2(tendered - total).toFixed(2),
          createdBy: user._id,
        })
        .returning();

      for (const l of lineRows) {
        await tx.insert(posOrderLines).values({
          posOrderId: order.id,
          productId: l.productId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice.toFixed(2),
          lineTotal: l.lineTotal.toFixed(2),
        });
        const p = byId.get(l.productId)!;
        await applyStockChange(tx, p, wh, -l.quantity);
        await tx.insert(stockAdjustments).values({
          productId: p.id,
          quantityChange: -l.quantity,
          reason: `POS sale ${orderNumber} from ${wh.name}`,
          createdBy: user._id,
        });
      }
      return { _id: order.id, orderNumber, subtotal, taxAmount, total, change: round2(tendered - total) };
    });

    await recordAudit({ actorId: user._id, action: "create", entityType: "pos_order", entityId: result._id, changes: { orderNumber, total: result.total } });
    res.json(result);
  }),
);

export default router;
