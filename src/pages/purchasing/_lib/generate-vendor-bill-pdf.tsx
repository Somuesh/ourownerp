import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { VendorBillLineItem, VendorBillWithVendor } from "@/lib/types.ts";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function downloadVendorBillPdf(
  bill: VendorBillWithVendor,
  lineItems: Array<VendorBillLineItem>,
) {
  const doc = new jsPDF();

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("VENDOR BILL", 20, 22);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(bill.billNumber, 20, 30);

  doc.setTextColor(0, 0, 0);
  doc.text(`Bill date: ${new Date(bill.billDateIso).toLocaleDateString()}`, 150, 22, {
    align: "right",
  });
  doc.text(`Due: ${new Date(bill.dueDateIso).toLocaleDateString()}`, 150, 29, {
    align: "right",
  });
  doc.text(`Status: ${bill.status.toUpperCase()}`, 150, 36, { align: "right" });

  let vendorY = 46;
  doc.setFont("helvetica", "bold");
  doc.text("From vendor", 20, vendorY);
  doc.setFont("helvetica", "normal");
  vendorY += 7;
  if (bill.vendorCompanyName) {
    doc.text(bill.vendorCompanyName, 20, vendorY);
    vendorY += 6;
  }
  if (bill.vendorContactName) {
    doc.text(bill.vendorContactName, 20, vendorY);
    vendorY += 6;
  }
  if (!bill.vendorCompanyName && !bill.vendorContactName) {
    doc.text("—", 20, vendorY);
    vendorY += 6;
  }

  autoTable(doc, {
    startY: vendorY + 8,
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
  doc.text(currency.format(bill.subtotal), 190, finalY, { align: "right" });
  finalY += 7;
  doc.text(`Tax (${bill.taxRate}%)`, 140, finalY, { align: "left" });
  doc.text(currency.format(bill.taxAmount), 190, finalY, { align: "right" });
  finalY += 7;
  doc.setFont("helvetica", "bold");
  doc.text("Total", 140, finalY, { align: "left" });
  doc.text(currency.format(bill.total), 190, finalY, { align: "right" });

  if (bill.notes) {
    finalY += 14;
    doc.setFont("helvetica", "bold");
    doc.text("Notes", 20, finalY);
    doc.setFont("helvetica", "normal");
    doc.text(bill.notes, 20, finalY + 6, { maxWidth: 170 });
  }

  doc.save(`${bill.billNumber}.pdf`);
}
