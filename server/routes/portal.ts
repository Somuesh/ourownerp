import { and, desc, eq, or } from "drizzle-orm";
import { Router } from "express";
import { asyncHandler, requireClientWithContact } from "../auth.ts";
import { db } from "../db/client.ts";
import { companies, contacts, invoiceLineItems, invoices } from "../db/schema.ts";

const router = Router();

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

/** The signed-in client's own contact + company info. */
router.get(
  "/portal/me",
  asyncHandler(async (req, res) => {
    const user = await requireClientWithContact(req);
    const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, user.contactId) });
    if (!contact) {
      res.json(null);
      return;
    }
    const company = contact.companyId
      ? await db.query.companies.findFirst({ where: eq(companies.id, contact.companyId) })
      : null;
    res.json({
      contact: {
        _id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        companyId: contact.companyId,
        createdBy: contact.createdBy,
      },
      company: company
        ? {
            _id: company.id,
            name: company.name,
            website: company.website,
            industry: company.industry,
            createdBy: company.createdBy,
          }
        : null,
    });
  }),
);

/** Invoices billed to the signed-in client's contact or their company. */
router.get(
  "/portal/invoices",
  asyncHandler(async (req, res) => {
    const user = await requireClientWithContact(req);
    const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, user.contactId) });

    const rows = await db
      .select({ invoice: invoices, contactName: contacts.name, companyName: companies.name })
      .from(invoices)
      .leftJoin(contacts, eq(contacts.id, invoices.contactId))
      .leftJoin(companies, eq(companies.id, invoices.companyId))
      .where(
        or(
          eq(invoices.contactId, user.contactId),
          contact?.companyId ? eq(invoices.companyId, contact.companyId) : undefined,
        ),
      )
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

/** A single invoice + line items, only if it belongs to the signed-in client. */
router.get(
  "/portal/invoices/:id",
  asyncHandler(async (req, res) => {
    const user = await requireClientWithContact(req);
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

    const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, user.contactId) });
    const belongsToClient =
      row.invoice.contactId === user.contactId ||
      (contact?.companyId != null && row.invoice.companyId === contact.companyId);
    if (!belongsToClient) {
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

export default router;
