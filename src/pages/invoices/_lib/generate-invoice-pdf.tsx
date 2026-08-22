import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { InvoiceLineItem, InvoiceWithParty } from "@/lib/types.ts";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export function downloadInvoicePdf(
  invoice: InvoiceWithParty,
  lineItems: Array<InvoiceLineItem>,
) {
  const doc = new jsPDF();

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("INVOICE", 20, 22);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(invoice.invoiceNumber, 20, 30);

  doc.setTextColor(0, 0, 0);
  doc.text(`Issued: ${new Date(invoice.issueDateIso).toLocaleDateString()}`, 150, 22, {
    align: "right",
  });
  doc.text(`Due: ${new Date(invoice.dueDateIso).toLocaleDateString()}`, 150, 29, {
    align: "right",
  });
  doc.text(`Status: ${invoice.status.toUpperCase()}`, 150, 36, { align: "right" });

  let billToY = 46;
  doc.setFont("helvetica", "bold");
  doc.text("Billed to", 20, billToY);
  doc.setFont("helvetica", "normal");
  billToY += 7;
  if (invoice.companyName) {
    doc.text(invoice.companyName, 20, billToY);
    billToY += 6;
  }
  if (invoice.contactName) {
    doc.text(invoice.contactName, 20, billToY);
    billToY += 6;
  }
  if (!invoice.companyName && !invoice.contactName) {
    doc.text("—", 20, billToY);
    billToY += 6;
  }

  autoTable(doc, {
    startY: billToY + 8,
    head: [["Description", "Qty", "Unit price", "Total"]],
    body: lineItems.map((item) => [
      item.description,
      String(item.quantity),
      currency.format(item.unitPrice),
      currency.format(item.quantity * item.unitPrice),
    ]),
    theme: "grid",
    headStyles: { fillColor: [26, 43, 71], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });

  const lastAutoTable = (
    doc as unknown as { lastAutoTable: { finalY: number } }
  ).lastAutoTable;
  let finalY = lastAutoTable.finalY + 10;

  doc.text("Subtotal", 140, finalY, { align: "left" });
  doc.text(currency.format(invoice.subtotal), 190, finalY, { align: "right" });
  finalY += 7;
  doc.text(`Tax (${invoice.taxRate}%)`, 140, finalY, { align: "left" });
  doc.text(currency.format(invoice.taxAmount), 190, finalY, { align: "right" });
  finalY += 7;
  doc.setFont("helvetica", "bold");
  doc.text("Total", 140, finalY, { align: "left" });
  doc.text(currency.format(invoice.total), 190, finalY, { align: "right" });

  if (invoice.notes) {
    finalY += 14;
    doc.setFont("helvetica", "bold");
    doc.text("Notes", 20, finalY);
    doc.setFont("helvetica", "normal");
    doc.text(invoice.notes, 20, finalY + 6, { maxWidth: 170 });
  }

  doc.save(`${invoice.invoiceNumber}.pdf`);
}
