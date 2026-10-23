import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler } from "../auth.ts";
import { db } from "../db/client.ts";
import {
  companies,
  contacts,
  invoiceLineItems,
  invoices,
  products,
  salesOrderLineItems,
  salesOrders,
  stockAdjustments,
} from "../db/schema.ts";
import { nextSequenceNumber } from "../db/sequences.ts";
import { applyStockChange, resolveWarehouse } from "../db/stock.ts";
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

function rowToSalesOrder(row: typeof salesOrders.$inferSelect) {
  return {
    _id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    contactId: row.contactId,
    companyId: row.companyId,
    orderDateIso: row.orderDate.toISOString(),
    expectedDeliveryDateIso: row.expectedDeliveryDate?.toISOString() ?? null,
    notes: row.notes,
    taxRate: Number(row.taxRate),
    subtotal: Number(row.subtotal),
    taxAmount: Number(row.taxAmount),
    total: Number(row.total),
    confirmedAtIso: row.confirmedAt?.toISOString() ?? null,
    deliveredAtIso: row.deliveredAt?.toISOString() ?? null,
    invoicedAtIso: row.invoicedAt?.toISOString() ?? null,
    cancelledAtIso: row.cancelledAt?.toISOString() ?? null,
    invoiceId: row.invoiceId,
    createdBy: row.createdBy,
  };
}

function rowToLineItem(row: typeof salesOrderLineItems.$inferSelect) {
  return {
    _id: row.id,
    salesOrderId: row.salesOrderId,
    productId: row.productId,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice),
  };
}

router.get(
  "/sales-orders",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.SALES_READ);
    const rows = await db
      .select({ order: salesOrders, contactName: contacts.name, companyName: companies.name })
      .from(salesOrders)
      .leftJoin(contacts, eq(contacts.id, salesOrders.contactId))
      .leftJoin(companies, eq(companies.id, salesOrders.companyId))
      .orderBy(desc(salesOrders.createdAt));
    res.json(
      rows.map((r) => ({
        ...rowToSalesOrder(r.order),
        contactName: r.contactName,
        companyName: r.companyName,
      })),
    );
  }),
);

router.get(
  "/sales-orders/:id",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.SALES_READ);
    const [row] = await db
      .select({ order: salesOrders, contactName: contacts.name, companyName: companies.name })
      .from(salesOrders)
      .leftJoin(contacts, eq(contacts.id, salesOrders.contactId))
      .leftJoin(companies, eq(companies.id, salesOrders.companyId))
      .where(eq(salesOrders.id, req.params.id))
      .limit(1);
    if (!row) {
      res.json(null);
      return;
    }
    const lineItems = await db
      .select()
      .from(salesOrderLineItems)
      .where(eq(salesOrderLineItems.salesOrderId, req.params.id));
    res.json({
      order: { ...rowToSalesOrder(row.order), contactName: row.contactName, companyName: row.companyName },
      lineItems: lineItems.map(rowToLineItem),
    });
  }),
);

/** Create a quotation (status "draft"). Freely editable until confirmed. */
router.post(
  "/sales-orders",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.SALES_WRITE);
    const { contactId, companyId, orderDateIso, expectedDeliveryDateIso, notes, taxRate, lineItems } =
      req.body as {
        contactId?: string;
        companyId?: string;
        orderDateIso: string;
        expectedDeliveryDateIso?: string;
        notes?: string;
        taxRate: number;
        lineItems: LineItemInput[];
      };

    if (!lineItems || lineItems.length === 0) {
      throw new AppError(400, "Add at least one line item");
    }

    const { subtotal, taxAmount, total } = computeTotals(lineItems, taxRate);
    const orderNumber = await nextSequenceNumber("sales_order");

    const orderId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(salesOrders)
        .values({
          orderNumber,
          status: "draft",
          contactId: contactId ?? null,
          companyId: companyId ?? null,
          orderDate: new Date(orderDateIso),
          expectedDeliveryDate: expectedDeliveryDateIso ? new Date(expectedDeliveryDateIso) : null,
          notes: notes ?? null,
          taxRate: String(taxRate),
          subtotal: String(subtotal),
          taxAmount: String(taxAmount),
          total: String(total),
          createdBy: user._id,
        })
        .returning({ id: salesOrders.id });

      await tx.insert(salesOrderLineItems).values(
        lineItems.map((item) => ({
          salesOrderId: created.id,
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
      entityType: "sales_order",
      entityId: orderId,
      changes: { orderNumber, total, lineItemCount: lineItems.length },
    });

    res.json({ _id: orderId });
  }),
);

/** Edit a quotation. Only while status is "draft" — once confirmed, a
 * sales order is locked (matching Odoo's behavior: cancel and re-quote
 * instead of silently editing a commitment the customer already accepted). */
router.patch(
  "/sales-orders/:id",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.SALES_WRITE);
    const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, req.params.id) });
    if (!order) throw new AppError(404, "Sales order not found");
    if (order.status !== "draft") {
      throw new AppError(409, "Only draft quotations can be edited — cancel and re-quote instead");
    }

    const { contactId, companyId, orderDateIso, expectedDeliveryDateIso, notes, taxRate, lineItems } =
      req.body as {
        contactId?: string;
        companyId?: string;
        orderDateIso: string;
        expectedDeliveryDateIso?: string;
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
        .update(salesOrders)
        .set({
          contactId: contactId ?? null,
          companyId: companyId ?? null,
          orderDate: new Date(orderDateIso),
          expectedDeliveryDate: expectedDeliveryDateIso ? new Date(expectedDeliveryDateIso) : null,
          notes: notes ?? null,
          taxRate: String(taxRate),
          subtotal: String(subtotal),
          taxAmount: String(taxAmount),
          total: String(total),
        })
        .where(eq(salesOrders.id, req.params.id));

      await tx.delete(salesOrderLineItems).where(eq(salesOrderLineItems.salesOrderId, req.params.id));
      await tx.insert(salesOrderLineItems).values(
        lineItems.map((item) => ({
          salesOrderId: req.params.id,
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
      entityType: "sales_order",
      entityId: req.params.id,
      changes: { total, lineItemCount: lineItems.length },
    });

    res.json(null);
  }),
);

/** draft -> confirmed. This is the "quotation accepted, now a real order"
 * step — Odoo's Sales Order name/commitment point. */
router.post(
  "/sales-orders/:id/confirm",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.SALES_WRITE);
    const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, req.params.id) });
    if (!order) throw new AppError(404, "Sales order not found");
    if (order.status !== "draft") {
      throw new AppError(409, `Cannot confirm an order in status "${order.status}"`);
    }

    await db
      .update(salesOrders)
      .set({ status: "confirmed", confirmedAt: new Date() })
      .where(eq(salesOrders.id, req.params.id));

    await recordAudit({
      actorId: user._id,
      action: "status_change",
      entityType: "sales_order",
      entityId: req.params.id,
      changes: { status: "confirmed" },
    });

    res.json(null);
  }),
);

/** confirmed -> delivered. Decrements stock for every line item that has a
 * linked product, via the existing stock_adjustments mechanism (the same
 * one the Inventory module's manual "Adjust stock" action uses) — this
 * gets replaced with a real stock-move/picking model in Phase 4, but reuses
 * today's primitive rather than inventing a second one in the meantime.
 * Lines with no linked product (a free-text service line, say) are skipped. */
router.post(
  "/sales-orders/:id/deliver",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.SALES_WRITE);

    await db.transaction(async (tx) => {
      const order = await tx.query.salesOrders.findFirst({ where: eq(salesOrders.id, req.params.id) });
      if (!order) throw new AppError(404, "Sales order not found");
      if (order.status !== "confirmed") {
        throw new AppError(409, `Cannot deliver an order in status "${order.status}"`);
      }

      const wh = await resolveWarehouse(tx, (req.body as { warehouseId?: string } | undefined)?.warehouseId);
      const lineItems = await tx
        .select()
        .from(salesOrderLineItems)
        .where(eq(salesOrderLineItems.salesOrderId, req.params.id));

      for (const item of lineItems) {
        if (!item.productId) continue;
        const product = await tx.query.products.findFirst({ where: eq(products.id, item.productId) });
        if (!product) continue; // product was deleted since the order was placed
        const quantityChange = -Math.round(Number(item.quantity));
        await applyStockChange(tx, product, wh, quantityChange);
        await tx.insert(stockAdjustments).values({
          productId: product.id,
          quantityChange,
          reason: `Sales order ${order.orderNumber} delivered from ${wh.name}`,
          createdBy: user._id,
        });
      }

      await tx
        .update(salesOrders)
        .set({ status: "delivered", deliveredAt: new Date() })
        .where(eq(salesOrders.id, req.params.id));
    });

    await recordAudit({
      actorId: user._id,
      action: "status_change",
      entityType: "sales_order",
      entityId: req.params.id,
      changes: { status: "delivered" },
    });

    res.json(null);
  }),
);

/** delivered -> invoiced. Creates a real invoice (same `invoices` table
 * Invoicing already uses) from the order's line items, and links it back
 * via sales_orders.invoice_id. One invoice per order for v1 — invoicing
 * only part of an order is a reasonable later extension, not needed yet. */
router.post(
  "/sales-orders/:id/invoice",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.SALES_WRITE);

    const invoiceId = await db.transaction(async (tx) => {
      const order = await tx.query.salesOrders.findFirst({ where: eq(salesOrders.id, req.params.id) });
      if (!order) throw new AppError(404, "Sales order not found");
      if (order.status !== "delivered") {
        throw new AppError(409, `Cannot invoice an order in status "${order.status}"`);
      }

      const lineItems = await tx
        .select()
        .from(salesOrderLineItems)
        .where(eq(salesOrderLineItems.salesOrderId, req.params.id));

      const invoiceNumber = await nextSequenceNumber("invoice");
      const { dueDateIso } = req.body as { dueDateIso?: string };
      const issueDate = new Date();
      const dueDate = dueDateIso ? new Date(dueDateIso) : issueDate;

      const [createdInvoice] = await tx
        .insert(invoices)
        .values({
          invoiceNumber,
          status: "draft",
          contactId: order.contactId,
          companyId: order.companyId,
          issueDate,
          dueDate,
          notes: order.notes ? `From ${order.orderNumber}. ${order.notes}` : `From ${order.orderNumber}.`,
          taxRate: order.taxRate,
          subtotal: order.subtotal,
          taxAmount: order.taxAmount,
          total: order.total,
          createdBy: user._id,
        })
        .returning({ id: invoices.id });

      await tx.insert(invoiceLineItems).values(
        lineItems.map((item) => ({
          invoiceId: createdInvoice.id,
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      );

      await tx
        .update(salesOrders)
        .set({ status: "invoiced", invoicedAt: new Date(), invoiceId: createdInvoice.id })
        .where(eq(salesOrders.id, req.params.id));

      return createdInvoice.id;
    });

    await recordAudit({
      actorId: user._id,
      action: "status_change",
      entityType: "sales_order",
      entityId: req.params.id,
      changes: { status: "invoiced", invoiceId },
    });
    await recordAudit({
      actorId: user._id,
      action: "create",
      entityType: "invoice",
      entityId: invoiceId,
      changes: { fromSalesOrder: req.params.id },
    });

    res.json({ invoiceId });
  }),
);

/** draft or confirmed -> cancelled. Delivered/invoiced orders can't be
 * cancelled — stock has already moved and/or an invoice exists; those need
 * to be unwound explicitly (a return / credit note) rather than silently
 * cancelled, same reasoning Odoo uses. */
router.post(
  "/sales-orders/:id/cancel",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.SALES_WRITE);
    const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, req.params.id) });
    if (!order) throw new AppError(404, "Sales order not found");
    if (order.status !== "draft" && order.status !== "confirmed") {
      throw new AppError(409, `Cannot cancel an order in status "${order.status}"`);
    }

    await db
      .update(salesOrders)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(salesOrders.id, req.params.id));

    await recordAudit({
      actorId: user._id,
      action: "status_change",
      entityType: "sales_order",
      entityId: req.params.id,
      changes: { status: "cancelled" },
    });

    res.json(null);
  }),
);

/** Only draft quotations can be deleted outright — anything further along
 * has real business consequences and should be cancelled instead. */
router.delete(
  "/sales-orders/:id",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.SALES_WRITE);
    const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, req.params.id) });
    if (!order) throw new AppError(404, "Sales order not found");
    if (order.status !== "draft") {
      throw new AppError(409, "Only draft quotations can be deleted — cancel it instead");
    }

    await db.transaction(async (tx) => {
      await tx.delete(salesOrderLineItems).where(eq(salesOrderLineItems.salesOrderId, req.params.id));
      await tx.delete(salesOrders).where(eq(salesOrders.id, req.params.id));
    });

    await recordAudit({
      actorId: user._id,
      action: "delete",
      entityType: "sales_order",
      entityId: req.params.id,
    });

    res.json(null);
  }),
);

export default router;
