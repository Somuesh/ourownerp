import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler } from "../auth.ts";
import { db } from "../db/client.ts";
import {
  companies,
  contacts,
  products,
  purchaseOrderLineItems,
  purchaseOrders,
  stockAdjustments,
  vendorBillLineItems,
  vendorBills,
} from "../db/schema.ts";
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

function rowToPurchaseOrder(row: typeof purchaseOrders.$inferSelect) {
  return {
    _id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    vendorContactId: row.vendorContactId,
    vendorCompanyId: row.vendorCompanyId,
    orderDateIso: row.orderDate.toISOString(),
    expectedReceiptDateIso: row.expectedReceiptDate?.toISOString() ?? null,
    notes: row.notes,
    taxRate: Number(row.taxRate),
    subtotal: Number(row.subtotal),
    taxAmount: Number(row.taxAmount),
    total: Number(row.total),
    confirmedAtIso: row.confirmedAt?.toISOString() ?? null,
    receivedAtIso: row.receivedAt?.toISOString() ?? null,
    billedAtIso: row.billedAt?.toISOString() ?? null,
    cancelledAtIso: row.cancelledAt?.toISOString() ?? null,
    billId: row.billId,
    createdBy: row.createdBy,
  };
}

function rowToLineItem(row: typeof purchaseOrderLineItems.$inferSelect) {
  return {
    _id: row.id,
    purchaseOrderId: row.purchaseOrderId,
    productId: row.productId,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice),
  };
}

router.get(
  "/purchase-orders",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.PURCHASING_READ);
    const rows = await db
      .select({
        order: purchaseOrders,
        vendorContactName: contacts.name,
        vendorCompanyName: companies.name,
      })
      .from(purchaseOrders)
      .leftJoin(contacts, eq(contacts.id, purchaseOrders.vendorContactId))
      .leftJoin(companies, eq(companies.id, purchaseOrders.vendorCompanyId))
      .orderBy(desc(purchaseOrders.createdAt));
    res.json(
      rows.map((r) => ({
        ...rowToPurchaseOrder(r.order),
        vendorContactName: r.vendorContactName,
        vendorCompanyName: r.vendorCompanyName,
      })),
    );
  }),
);

router.get(
  "/purchase-orders/:id",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.PURCHASING_READ);
    const [row] = await db
      .select({
        order: purchaseOrders,
        vendorContactName: contacts.name,
        vendorCompanyName: companies.name,
      })
      .from(purchaseOrders)
      .leftJoin(contacts, eq(contacts.id, purchaseOrders.vendorContactId))
      .leftJoin(companies, eq(companies.id, purchaseOrders.vendorCompanyId))
      .where(eq(purchaseOrders.id, req.params.id))
      .limit(1);
    if (!row) {
      res.json(null);
      return;
    }
    const lineItems = await db
      .select()
      .from(purchaseOrderLineItems)
      .where(eq(purchaseOrderLineItems.purchaseOrderId, req.params.id));
    res.json({
      order: {
        ...rowToPurchaseOrder(row.order),
        vendorContactName: row.vendorContactName,
        vendorCompanyName: row.vendorCompanyName,
      },
      lineItems: lineItems.map(rowToLineItem),
    });
  }),
);

/** Create an RFQ (status "draft"). Freely editable until confirmed. */
router.post(
  "/purchase-orders",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.PURCHASING_WRITE);
    const {
      vendorContactId,
      vendorCompanyId,
      orderDateIso,
      expectedReceiptDateIso,
      notes,
      taxRate,
      lineItems,
    } = req.body as {
      vendorContactId?: string;
      vendorCompanyId?: string;
      orderDateIso: string;
      expectedReceiptDateIso?: string;
      notes?: string;
      taxRate: number;
      lineItems: LineItemInput[];
    };

    if (!lineItems || lineItems.length === 0) {
      throw new AppError(400, "Add at least one line item");
    }

    const { subtotal, taxAmount, total } = computeTotals(lineItems, taxRate);
    const orderNumber = await nextSequenceNumber("purchase_order");

    const orderId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(purchaseOrders)
        .values({
          orderNumber,
          status: "draft",
          vendorContactId: vendorContactId ?? null,
          vendorCompanyId: vendorCompanyId ?? null,
          orderDate: new Date(orderDateIso),
          expectedReceiptDate: expectedReceiptDateIso ? new Date(expectedReceiptDateIso) : null,
          notes: notes ?? null,
          taxRate: String(taxRate),
          subtotal: String(subtotal),
          taxAmount: String(taxAmount),
          total: String(total),
          createdBy: user._id,
        })
        .returning({ id: purchaseOrders.id });

      await tx.insert(purchaseOrderLineItems).values(
        lineItems.map((item) => ({
          purchaseOrderId: created.id,
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
      entityType: "purchase_order",
      entityId: orderId,
      changes: { orderNumber, total, lineItemCount: lineItems.length },
    });

    res.json({ _id: orderId });
  }),
);

/** Edit an RFQ. Only while status is "draft" — same reasoning as Sales
 * Orders: once confirmed, it's a commitment to the vendor and locked. */
router.patch(
  "/purchase-orders/:id",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.PURCHASING_WRITE);
    const order = await db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, req.params.id),
    });
    if (!order) throw new AppError(404, "Purchase order not found");
    if (order.status !== "draft") {
      throw new AppError(409, "Only draft RFQs can be edited — cancel and re-create instead");
    }

    const {
      vendorContactId,
      vendorCompanyId,
      orderDateIso,
      expectedReceiptDateIso,
      notes,
      taxRate,
      lineItems,
    } = req.body as {
      vendorContactId?: string;
      vendorCompanyId?: string;
      orderDateIso: string;
      expectedReceiptDateIso?: string;
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
        .update(purchaseOrders)
        .set({
          vendorContactId: vendorContactId ?? null,
          vendorCompanyId: vendorCompanyId ?? null,
          orderDate: new Date(orderDateIso),
          expectedReceiptDate: expectedReceiptDateIso ? new Date(expectedReceiptDateIso) : null,
          notes: notes ?? null,
          taxRate: String(taxRate),
          subtotal: String(subtotal),
          taxAmount: String(taxAmount),
          total: String(total),
        })
        .where(eq(purchaseOrders.id, req.params.id));

      await tx
        .delete(purchaseOrderLineItems)
        .where(eq(purchaseOrderLineItems.purchaseOrderId, req.params.id));
      await tx.insert(purchaseOrderLineItems).values(
        lineItems.map((item) => ({
          purchaseOrderId: req.params.id,
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
      entityType: "purchase_order",
      entityId: req.params.id,
      changes: { total, lineItemCount: lineItems.length },
    });

    res.json(null);
  }),
);

/** draft -> confirmed. The "sent to vendor, now a real commitment" step. */
router.post(
  "/purchase-orders/:id/confirm",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.PURCHASING_WRITE);
    const order = await db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, req.params.id),
    });
    if (!order) throw new AppError(404, "Purchase order not found");
    if (order.status !== "draft") {
      throw new AppError(409, `Cannot confirm an order in status "${order.status}"`);
    }

    await db
      .update(purchaseOrders)
      .set({ status: "confirmed", confirmedAt: new Date() })
      .where(eq(purchaseOrders.id, req.params.id));

    await recordAudit({
      actorId: user._id,
      action: "status_change",
      entityType: "purchase_order",
      entityId: req.params.id,
      changes: { status: "confirmed" },
    });

    res.json(null);
  }),
);

/** confirmed -> received. Increments stock for every line item with a
 * linked product, via the same stock_adjustments mechanism Sales Order
 * delivery and Inventory's manual adjustment both use — the mirror image
 * of a Sales Order delivery decrementing it. */
router.post(
  "/purchase-orders/:id/receive",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.PURCHASING_WRITE);

    await db.transaction(async (tx) => {
      const order = await tx.query.purchaseOrders.findFirst({
        where: eq(purchaseOrders.id, req.params.id),
      });
      if (!order) throw new AppError(404, "Purchase order not found");
      if (order.status !== "confirmed") {
        throw new AppError(409, `Cannot receive an order in status "${order.status}"`);
      }

      const lineItems = await tx
        .select()
        .from(purchaseOrderLineItems)
        .where(eq(purchaseOrderLineItems.purchaseOrderId, req.params.id));

      for (const item of lineItems) {
        if (!item.productId) continue;
        const product = await tx.query.products.findFirst({ where: eq(products.id, item.productId) });
        if (!product) continue; // product was deleted since the order was placed
        const quantityChange = Math.round(Number(item.quantity));
        await tx
          .update(products)
          .set({ stockQuantity: product.stockQuantity + quantityChange })
          .where(eq(products.id, product.id));
        await tx.insert(stockAdjustments).values({
          productId: product.id,
          quantityChange,
          reason: `Purchase order ${order.orderNumber} received`,
          createdBy: user._id,
        });
      }

      await tx
        .update(purchaseOrders)
        .set({ status: "received", receivedAt: new Date() })
        .where(eq(purchaseOrders.id, req.params.id));
    });

    await recordAudit({
      actorId: user._id,
      action: "status_change",
      entityType: "purchase_order",
      entityId: req.params.id,
      changes: { status: "received" },
    });

    res.json(null);
  }),
);

/** received -> billed. Creates a real vendor bill from the order's line
 * items, linked back via purchase_orders.bill_id. One bill per order for
 * v1, same simplification Sales Orders make with invoices. */
router.post(
  "/purchase-orders/:id/bill",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.PURCHASING_WRITE);

    const billId = await db.transaction(async (tx) => {
      const order = await tx.query.purchaseOrders.findFirst({
        where: eq(purchaseOrders.id, req.params.id),
      });
      if (!order) throw new AppError(404, "Purchase order not found");
      if (order.status !== "received") {
        throw new AppError(409, `Cannot bill an order in status "${order.status}"`);
      }

      const lineItems = await tx
        .select()
        .from(purchaseOrderLineItems)
        .where(eq(purchaseOrderLineItems.purchaseOrderId, req.params.id));

      const billNumber = await nextSequenceNumber("vendor_bill");
      const { dueDateIso } = req.body as { dueDateIso?: string };
      const billDate = new Date();
      const dueDate = dueDateIso ? new Date(dueDateIso) : billDate;

      const [createdBill] = await tx
        .insert(vendorBills)
        .values({
          billNumber,
          status: "draft",
          vendorContactId: order.vendorContactId,
          vendorCompanyId: order.vendorCompanyId,
          billDate,
          dueDate,
          notes: order.notes
            ? `From ${order.orderNumber}. ${order.notes}`
            : `From ${order.orderNumber}.`,
          taxRate: order.taxRate,
          subtotal: order.subtotal,
          taxAmount: order.taxAmount,
          total: order.total,
          createdBy: user._id,
        })
        .returning({ id: vendorBills.id });

      await tx.insert(vendorBillLineItems).values(
        lineItems.map((item) => ({
          vendorBillId: createdBill.id,
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      );

      await tx
        .update(purchaseOrders)
        .set({ status: "billed", billedAt: new Date(), billId: createdBill.id })
        .where(eq(purchaseOrders.id, req.params.id));

      return createdBill.id;
    });

    await recordAudit({
      actorId: user._id,
      action: "status_change",
      entityType: "purchase_order",
      entityId: req.params.id,
      changes: { status: "billed", billId },
    });
    await recordAudit({
      actorId: user._id,
      action: "create",
      entityType: "vendor_bill",
      entityId: billId,
      changes: { fromPurchaseOrder: req.params.id },
    });

    res.json({ billId });
  }),
);

/** draft or confirmed -> cancelled. Received/billed orders can't be
 * cancelled — stock has already moved and/or a bill exists; same
 * reasoning as Sales Orders. */
router.post(
  "/purchase-orders/:id/cancel",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.PURCHASING_WRITE);
    const order = await db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, req.params.id),
    });
    if (!order) throw new AppError(404, "Purchase order not found");
    if (order.status !== "draft" && order.status !== "confirmed") {
      throw new AppError(409, `Cannot cancel an order in status "${order.status}"`);
    }

    await db
      .update(purchaseOrders)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(purchaseOrders.id, req.params.id));

    await recordAudit({
      actorId: user._id,
      action: "status_change",
      entityType: "purchase_order",
      entityId: req.params.id,
      changes: { status: "cancelled" },
    });

    res.json(null);
  }),
);

/** Only draft RFQs can be deleted outright. */
router.delete(
  "/purchase-orders/:id",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.PURCHASING_WRITE);
    const order = await db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, req.params.id),
    });
    if (!order) throw new AppError(404, "Purchase order not found");
    if (order.status !== "draft") {
      throw new AppError(409, "Only draft RFQs can be deleted — cancel it instead");
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(purchaseOrderLineItems)
        .where(eq(purchaseOrderLineItems.purchaseOrderId, req.params.id));
      await tx.delete(purchaseOrders).where(eq(purchaseOrders.id, req.params.id));
    });

    await recordAudit({
      actorId: user._id,
      action: "delete",
      entityType: "purchase_order",
      entityId: req.params.id,
    });

    res.json(null);
  }),
);

export default router;
