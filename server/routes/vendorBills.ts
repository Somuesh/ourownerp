import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler } from "../auth.ts";
import { db } from "../db/client.ts";
import { companies, contacts, vendorBillLineItems, vendorBills } from "../db/schema.ts";
import { nextSequenceNumber } from "../db/sequences.ts";
import { CAPABILITIES, requireCapability } from "../permissions.ts";

const router = Router();

interface LineItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

function computeTotals(items: Array<{ quantity: number; unitPrice: number }>, taxRate: number) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = subtotal * (taxRate / 100);
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

function rowToBill(row: typeof vendorBills.$inferSelect) {
  return {
    _id: row.id,
    billNumber: row.billNumber,
    status: row.status,
    vendorContactId: row.vendorContactId,
    vendorCompanyId: row.vendorCompanyId,
    billDateIso: row.billDate.toISOString(),
    dueDateIso: row.dueDate.toISOString(),
    notes: row.notes,
    taxRate: Number(row.taxRate),
    subtotal: Number(row.subtotal),
    taxAmount: Number(row.taxAmount),
    total: Number(row.total),
    createdBy: row.createdBy,
  };
}

function rowToLineItem(row: typeof vendorBillLineItems.$inferSelect) {
  return {
    _id: row.id,
    vendorBillId: row.vendorBillId,
    productId: row.productId,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice),
  };
}

router.get(
  "/vendor-bills",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.PURCHASING_READ);
    const rows = await db
      .select({
        bill: vendorBills,
        vendorContactName: contacts.name,
        vendorCompanyName: companies.name,
      })
      .from(vendorBills)
      .leftJoin(contacts, eq(contacts.id, vendorBills.vendorContactId))
      .leftJoin(companies, eq(companies.id, vendorBills.vendorCompanyId))
      .orderBy(desc(vendorBills.createdAt));
    res.json(
      rows.map((r) => ({
        ...rowToBill(r.bill),
        vendorContactName: r.vendorContactName,
        vendorCompanyName: r.vendorCompanyName,
      })),
    );
  }),
);

router.get(
  "/vendor-bills/:id",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.PURCHASING_READ);
    const [row] = await db
      .select({
        bill: vendorBills,
        vendorContactName: contacts.name,
        vendorCompanyName: companies.name,
      })
      .from(vendorBills)
      .leftJoin(contacts, eq(contacts.id, vendorBills.vendorContactId))
      .leftJoin(companies, eq(companies.id, vendorBills.vendorCompanyId))
      .where(eq(vendorBills.id, req.params.id))
      .limit(1);
    if (!row) {
      res.json(null);
      return;
    }
    const lineItems = await db
      .select()
      .from(vendorBillLineItems)
      .where(eq(vendorBillLineItems.vendorBillId, req.params.id));
    res.json({
      bill: {
        ...rowToBill(row.bill),
        vendorContactName: row.vendorContactName,
        vendorCompanyName: row.vendorCompanyName,
      },
      lineItems: lineItems.map(rowToLineItem),
    });
  }),
);

router.post(
  "/vendor-bills",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.PURCHASING_WRITE);
    const { vendorContactId, vendorCompanyId, billDateIso, dueDateIso, notes, taxRate, lineItems } =
      req.body as {
        vendorContactId?: string;
        vendorCompanyId?: string;
        billDateIso: string;
        dueDateIso: string;
        notes?: string;
        taxRate: number;
        lineItems: LineItemInput[];
      };

    if (!lineItems || lineItems.length === 0) {
      throw new AppError(400, "Add at least one line item");
    }

    const { subtotal, taxAmount, total } = computeTotals(lineItems, taxRate);
    const billNumber = await nextSequenceNumber("vendor_bill");

    const billId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(vendorBills)
        .values({
          billNumber,
          status: "draft",
          vendorContactId: vendorContactId ?? null,
          vendorCompanyId: vendorCompanyId ?? null,
          billDate: new Date(billDateIso),
          dueDate: new Date(dueDateIso),
          notes: notes ?? null,
          taxRate: String(taxRate),
          subtotal: String(subtotal),
          taxAmount: String(taxAmount),
          total: String(total),
          createdBy: user._id,
        })
        .returning({ id: vendorBills.id });

      await tx.insert(vendorBillLineItems).values(
        lineItems.map((item) => ({
          vendorBillId: created.id,
          productId: item.productId ?? null,
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
        })),
      );

      return created.id;
    });

    await recordAudit({
      actorId: user._id,
      action: "create",
      entityType: "vendor_bill",
      entityId: billId,
      changes: { billNumber, total, lineItemCount: lineItems.length },
    });

    res.json({ _id: billId });
  }),
);

router.patch(
  "/vendor-bills/:id",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.PURCHASING_WRITE);
    const bill = await db.query.vendorBills.findFirst({ where: eq(vendorBills.id, req.params.id) });
    if (!bill) throw new AppError(404, "Vendor bill not found");

    const { vendorContactId, vendorCompanyId, billDateIso, dueDateIso, notes, taxRate, lineItems } =
      req.body as {
        vendorContactId?: string;
        vendorCompanyId?: string;
        billDateIso: string;
        dueDateIso: string;
        notes?: string;
        taxRate: number;
        lineItems: LineItemInput[];
      };

    if (!lineItems || lineItems.length === 0) {
      throw new AppError(400, "Add at least one line item");
    }

    const { subtotal, taxAmount, total } = computeTotals(lineItems, taxRate);

    await db.transaction(async (tx) => {
      await tx
        .update(vendorBills)
        .set({
          vendorContactId: vendorContactId ?? null,
          vendorCompanyId: vendorCompanyId ?? null,
          billDate: new Date(billDateIso),
          dueDate: new Date(dueDateIso),
          notes: notes ?? null,
          taxRate: String(taxRate),
          subtotal: String(subtotal),
          taxAmount: String(taxAmount),
          total: String(total),
        })
        .where(eq(vendorBills.id, req.params.id));

      await tx.delete(vendorBillLineItems).where(eq(vendorBillLineItems.vendorBillId, req.params.id));
      await tx.insert(vendorBillLineItems).values(
        lineItems.map((item) => ({
          vendorBillId: req.params.id,
          productId: item.productId ?? null,
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
        })),
      );
    });

    await recordAudit({
      actorId: user._id,
      action: "update",
      entityType: "vendor_bill",
      entityId: req.params.id,
      changes: { total, lineItemCount: lineItems.length },
    });

    res.json(null);
  }),
);

router.patch(
  "/vendor-bills/:id/status",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.PURCHASING_WRITE);
    const { status } = req.body as { status: "draft" | "open" | "paid" | "overdue" };
    const [updated] = await db
      .update(vendorBills)
      .set({ status })
      .where(eq(vendorBills.id, req.params.id))
      .returning({ id: vendorBills.id });
    if (!updated) throw new AppError(404, "Vendor bill not found");

    await recordAudit({
      actorId: user._id,
      action: "status_change",
      entityType: "vendor_bill",
      entityId: req.params.id,
      changes: { status },
    });

    res.json(null);
  }),
);

router.delete(
  "/vendor-bills/:id",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.PURCHASING_WRITE);
    await db.transaction(async (tx) => {
      await tx.delete(vendorBillLineItems).where(eq(vendorBillLineItems.vendorBillId, req.params.id));
      await tx.delete(vendorBills).where(eq(vendorBills.id, req.params.id));
    });

    await recordAudit({
      actorId: user._id,
      action: "delete",
      entityType: "vendor_bill",
      entityId: req.params.id,
    });

    res.json(null);
  }),
);

export default router;
