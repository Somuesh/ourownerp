import { Router } from "express";
import { asyncHandler, requireStaffOrAdmin } from "../auth.ts";
import { db } from "../db/client.ts";

const router = Router();

type StageCounts = Record<"new" | "qualified" | "proposal" | "won" | "lost", number>;
type InvoiceStatusCounts = Record<"draft" | "sent" | "paid" | "overdue", number>;

router.get(
  "/dashboard/overview",
  asyncHandler(async (req, res) => {
    await requireStaffOrAdmin(req);

    const [allDeals, allProducts, allInvoices, allContacts, allCompanies] = await Promise.all([
      db.query.deals.findMany(),
      db.query.products.findMany(),
      db.query.invoices.findMany({ orderBy: (i, { desc }) => desc(i.createdAt) }),
      db.query.contacts.findMany(),
      db.query.companies.findMany(),
    ]);
    const contactNameById = new Map(allContacts.map((c) => [c.id, c.name]));
    const companyNameById = new Map(allCompanies.map((c) => [c.id, c.name]));

    const dealsByStage: StageCounts = { new: 0, qualified: 0, proposal: 0, won: 0, lost: 0 };
    let openDealsCount = 0;
    let openDealsValue = 0;
    for (const deal of allDeals) {
      dealsByStage[deal.stage] += 1;
      if (deal.stage !== "won" && deal.stage !== "lost") {
        openDealsCount += 1;
        openDealsValue += Number(deal.value);
      }
    }

    const lowStockCount = allProducts.filter(
      (product) => product.stockQuantity <= product.lowStockThreshold,
    ).length;

    const invoicesByStatus: InvoiceStatusCounts = { draft: 0, sent: 0, paid: 0, overdue: 0 };
    let outstandingInvoicesCount = 0;
    let outstandingInvoicesValue = 0;
    let revenueThisMonth = 0;

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    for (const invoice of allInvoices) {
      invoicesByStatus[invoice.status] += 1;
      if (invoice.status === "sent" || invoice.status === "overdue") {
        outstandingInvoicesCount += 1;
        outstandingInvoicesValue += Number(invoice.total);
      }
      if (invoice.status === "paid" && invoice.createdAt >= monthStart) {
        revenueThisMonth += Number(invoice.total);
      }
    }

    const partyName = (contactId: string | null, companyId: string | null) =>
      (companyId && companyNameById.get(companyId)) ??
      (contactId && contactNameById.get(contactId)) ??
      null;

    const recentInvoices = allInvoices.slice(0, 5).map((invoice) => ({
      _id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      total: Number(invoice.total),
      dueDateIso: invoice.dueDate.toISOString(),
      partyName: partyName(invoice.contactId, invoice.companyId),
    }));

    const recentDeals = [...allDeals]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5)
      .map((deal) => ({
        _id: deal.id,
        title: deal.title,
        value: Number(deal.value),
        stage: deal.stage,
        partyName: partyName(deal.contactId, deal.companyId),
      }));

    res.json({
      openDealsCount,
      openDealsValue,
      dealsByStage,
      lowStockCount,
      totalProductsCount: allProducts.length,
      outstandingInvoicesCount,
      outstandingInvoicesValue,
      revenueThisMonth,
      invoicesByStatus,
      recentInvoices,
      recentDeals,
    });
  }),
);

export default router;
