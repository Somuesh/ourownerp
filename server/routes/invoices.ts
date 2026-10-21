import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler, requireStaffOrAdmin } from "../auth.ts";
import { db } from "../db/client.ts";
import { companies, contacts, invoiceLineItems, invoices } from "../db/schema.ts";
import { nextSequenceNumber } from "../db/sequences.ts";
import { isEmailConfigured } from "../email/client.ts";
import { generateInvoicePdfBuffer } from "../email/invoice-pdf.ts";
import { sendMail } from "../email/send.ts";
import { invoiceEmailTemplate } from "../email/templates.ts";

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
  const total = subtotal + taxAmount;
  return { subtotal, taxAmount, total };
}

function rowToInvoice(row: typeof invoices.$inferSelect) {
  return {
    _id: row.id,
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    contactId: row.contactId,
    companyId: row.companyId,
    issueDateIso: row.issueDate.toISOString(),
    dueDateIso: row.dueDate.toISOString(),
    notes: row.notes,
    taxRate: Number(row.taxRate),
    subtotal: Number(row.subtotal),
    taxAmount: Number(row.taxAmount),
    total: Number(row.total),
    createdBy: row.createdBy,
    lastEmailedAtIso: row.lastEmailedAt?.toISOString() ?? null,
  };
}

function rowToLineItem(row: typeof invoiceLineItems.$inferSelect) {
  return {
    _id: row.id,
    invoiceId: row.invoiceId,
    productId: row.productId,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice),
  };
}

router.get(
  "/invoices",
  asyncHandler(async (req, res) => {
    await requireStaffOrAdmin(req);
    const rows = await db
      .select({ invoice: invoices, contactName: contacts.name, companyName: companies.name })
      .from(invoices)
      .leftJoin(contacts, eq(contacts.id, invoices.contactId))
      .leftJoin(companies, eq(companies.id, invoices.companyId))
      .orderBy(desc(invoices.createdAt));
    res.json(
      rows.map((r) => ({
        ...rowToInvoice(r.invoice),
        contactName: r.contactName,
        companyName: r.companyName,
      })),
    );
  }),
);

router.get(
  "/invoices/:id",
  asyncHandler(async (req, res) => {
    await requireStaffOrAdmin(req);
    const [row] = await db
      .select({ invoice: invoices, contactName: contacts.name, companyName: companies.name })
      .from(invoices)
      .leftJoin(contacts, eq(contacts.id, invoices.contactId))
      .leftJoin(companies, eq(companies.id, invoices.companyId))
      .where(eq(invoices.id, req.params.id))
      .limit(1);
    if (!row) {
      res.json(null);
      return;
    }
    const lineItems = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, req.params.id));
    res.json({
      invoice: { ...rowToInvoice(row.invoice), contactName: row.contactName, companyName: row.companyName },
      lineItems: lineItems.map(rowToLineItem),
    });
  }),
);

router.post(
  "/invoices",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const { contactId, companyId, issueDateIso, dueDateIso, notes, taxRate, lineItems } =
      req.body as {
        contactId?: string;
        companyId?: string;
        issueDateIso: string;
        dueDateIso: string;
        notes?: string;
        taxRate: number;
        lineItems: LineItemInput[];
      };

    if (!lineItems || lineItems.length === 0) {
      throw new AppError(400, "Add at least one line item");
    }

    const { subtotal, taxAmount, total } = computeTotals(lineItems, taxRate);
    const invoiceNumber = await nextSequenceNumber("invoice");

    const invoiceId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(invoices)
        .values({
          invoiceNumber,
          status: "draft",
          contactId: contactId ?? null,
          companyId: companyId ?? null,
          issueDate: new Date(issueDateIso),
          dueDate: new Date(dueDateIso),
          notes: notes ?? null,
          taxRate: String(taxRate),
          subtotal: String(subtotal),
          taxAmount: String(taxAmount),
          total: String(total),
          createdBy: user._id,
        })
        .returning({ id: invoices.id });

      await tx.insert(invoiceLineItems).values(
        lineItems.map((item) => ({
          invoiceId: created.id,
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
      entityType: "invoice",
      entityId: invoiceId,
      changes: { invoiceNumber, total, lineItemCount: lineItems.length },
    });

    res.json({ _id: invoiceId });
  }),
);

router.patch(
  "/invoices/:id",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, req.params.id) });
    if (!invoice) throw new AppError(404, "Invoice not found");

    const { contactId, companyId, issueDateIso, dueDateIso, notes, taxRate, lineItems } =
      req.body as {
        contactId?: string;
        companyId?: string;
        issueDateIso: string;
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
        .update(invoices)
        .set({
          contactId: contactId ?? null,
          companyId: companyId ?? null,
          issueDate: new Date(issueDateIso),
          dueDate: new Date(dueDateIso),
          notes: notes ?? null,
          taxRate: String(taxRate),
          subtotal: String(subtotal),
          taxAmount: String(taxAmount),
          total: String(total),
        })
        .where(eq(invoices.id, req.params.id));

      await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, req.params.id));
      await tx.insert(invoiceLineItems).values(
        lineItems.map((item) => ({
          invoiceId: req.params.id,
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
      entityType: "invoice",
      entityId: req.params.id,
      changes: { total, lineItemCount: lineItems.length },
    });

    res.json(null);
  }),
);

router.patch(
  "/invoices/:id/status",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    const { status } = req.body as { status: "draft" | "sent" | "paid" | "overdue" };
    const [updated] = await db
      .update(invoices)
      .set({ status })
      .where(eq(invoices.id, req.params.id))
      .returning({ id: invoices.id });
    if (!updated) throw new AppError(404, "Invoice not found");

    await recordAudit({
      actorId: user._id,
      action: "status_change",
      entityType: "invoice",
      entityId: req.params.id,
      changes: { status },
    });

    res.json(null);
  }),
);

/** Generates a PDF server-side (separate from the client-side "Download
 * PDF" button, which runs in the browser only) and emails it to the
 * invoice's contact. Marks the invoice "sent" if it was still "draft". */
router.post(
  "/invoices/:id/send-email",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    if (!isEmailConfigured()) {
      throw new AppError(500, "Email isn't configured on the server yet — set SMTP_* in .env.");
    }

    const [row] = await db
      .select({
        invoice: invoices,
        contactName: contacts.name,
        contactEmail: contacts.email,
        companyName: companies.name,
      })
      .from(invoices)
      .leftJoin(contacts, eq(contacts.id, invoices.contactId))
      .leftJoin(companies, eq(companies.id, invoices.companyId))
      .where(eq(invoices.id, req.params.id))
      .limit(1);
    if (!row) throw new AppError(404, "Invoice not found");

    const recipientEmail = row.contactEmail;
    if (!recipientEmail) {
      throw new AppError(400, "This invoice's customer has no email address on file");
    }

    const lineItemRows = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, req.params.id));

    const invoice = rowToInvoice(row.invoice);
    const pdfBuffer = await generateInvoicePdfBuffer(
      { ...invoice, contactName: row.contactName, companyName: row.companyName },
      lineItemRows.map(rowToLineItem),
    );

    const { subject, html, text } = invoiceEmailTemplate({
      invoiceNumber: invoice.invoiceNumber,
      total: `$${invoice.total.toFixed(2)}`,
      dueDate: new Date(invoice.dueDateIso).toLocaleDateString(),
    });

    await sendMail({
      to: recipientEmail,
      subject,
      html,
      text,
      attachments: [
        { filename: `${invoice.invoiceNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
      ],
    });

    const shouldMarkSent = row.invoice.status === "draft";
    await db
      .update(invoices)
      .set({ lastEmailedAt: new Date(), ...(shouldMarkSent ? { status: "sent" as const } : {}) })
      .where(eq(invoices.id, req.params.id));

    await recordAudit({
      actorId: user._id,
      action: "update",
      entityType: "invoice",
      entityId: req.params.id,
      changes: { emailedTo: recipientEmail },
    });

    res.json(null);
  }),
);

router.delete(
  "/invoices/:id",
  asyncHandler(async (req, res) => {
    const user = await requireStaffOrAdmin(req);
    await db.transaction(async (tx) => {
      await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, req.params.id));
      await tx.delete(invoices).where(eq(invoices.id, req.params.id));
    });

    await recordAudit({
      actorId: user._id,
      action: "delete",
      entityType: "invoice",
      entityId: req.params.id,
    });

    res.json(null);
  }),
);

export default router;
