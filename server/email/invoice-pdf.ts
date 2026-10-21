import PDFDocument from "pdfkit";

interface LineItemForPdf {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface InvoiceForPdf {
  invoiceNumber: string;
  issueDateIso: string;
  dueDateIso: string;
  status: string;
  contactName?: string | null;
  companyName?: string | null;
  notes?: string | null;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

const currency = (n: number) => `$${n.toFixed(2)}`;

/** Server-side PDF generation for emailing — separate from the client-side
 * jsPDF generator used for manual "Download PDF" (src/pages/invoices/_lib/
 * generate-invoice-pdf.tsx), since that one runs in the browser only.
 * Deliberately a simpler layout, not a pixel-for-pixel match — good enough
 * for an emailed attachment. */
export function generateInvoicePdfBuffer(
  invoice: InvoiceForPdf,
  lineItems: LineItemForPdf[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(22).font("Helvetica-Bold").text("INVOICE");
    doc.fontSize(11).font("Helvetica").fillColor("#666666").text(invoice.invoiceNumber);
    doc.fillColor("#000000");
    doc.moveDown();

    doc.text(`Issued: ${new Date(invoice.issueDateIso).toLocaleDateString()}`);
    doc.text(`Due: ${new Date(invoice.dueDateIso).toLocaleDateString()}`);
    doc.text(`Status: ${invoice.status.toUpperCase()}`);
    doc.moveDown();

    doc.font("Helvetica-Bold").text("Billed to");
    doc.font("Helvetica");
    if (invoice.companyName) doc.text(invoice.companyName);
    if (invoice.contactName) doc.text(invoice.contactName);
    if (!invoice.companyName && !invoice.contactName) doc.text("—");
    doc.moveDown();

    const tableTop = doc.y;
    doc.font("Helvetica-Bold");
    doc.text("Description", 50, tableTop, { width: 220 });
    doc.text("Qty", 280, tableTop, { width: 60, align: "right" });
    doc.text("Unit price", 340, tableTop, { width: 80, align: "right" });
    doc.text("Total", 430, tableTop, { width: 80, align: "right" });
    doc.moveDown(0.5);
    doc.font("Helvetica");
    doc.moveTo(50, doc.y).lineTo(510, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.3);

    for (const item of lineItems) {
      const y = doc.y;
      doc.text(item.description, 50, y, { width: 220 });
      doc.text(String(item.quantity), 280, y, { width: 60, align: "right" });
      doc.text(currency(item.unitPrice), 340, y, { width: 80, align: "right" });
      doc.text(currency(item.quantity * item.unitPrice), 430, y, { width: 80, align: "right" });
      doc.moveDown();
    }

    doc.moveDown();
    doc.moveTo(340, doc.y).lineTo(510, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.3);
    doc.text(`Subtotal: ${currency(invoice.subtotal)}`, 340, doc.y, { width: 170, align: "right" });
    doc.text(`Tax (${invoice.taxRate}%): ${currency(invoice.taxAmount)}`, 340, doc.y, {
      width: 170,
      align: "right",
    });
    doc.font("Helvetica-Bold");
    doc.text(`Total: ${currency(invoice.total)}`, 340, doc.y, { width: 170, align: "right" });
    doc.font("Helvetica");

    if (invoice.notes) {
      doc.moveDown();
      doc.font("Helvetica-Bold").text("Notes");
      doc.font("Helvetica").text(invoice.notes);
    }

    doc.end();
  });
}
