import { Router } from "express";
import { asyncHandler, requireStaffOrAdmin } from "../auth.ts";
import { db } from "../db/client.ts";

const router = Router();

type InvoiceStatusCounts = Record<"draft" | "sent" | "paid" | "overdue", number>;

router.get(
  "/dashboard/overview",
  asyncHandler(async (req, res) => {
    await requireStaffOrAdmin(req);

    const [allDeals, allDealStages, allProducts, allInvoices, allContacts, allCompanies] =
      await Promise.all([
        db.query.deals.findMany(),
        db.query.dealStages.findMany({ orderBy: (s, { asc }) => asc(s.sortOrder) }),
        db.query.products.findMany(),
        db.query.invoices.findMany({ orderBy: (i, { desc }) => desc(i.createdAt) }),
        db.query.contacts.findMany(),
        db.query.companies.findMany(),
      ]);
    const contactNameById = new Map(allContacts.map((c) => [c.id, c.name]));
    const companyNameById = new Map(allCompanies.map((c) => [c.id, c.name]));
    const stageById = new Map(allDealStages.map((s) => [s.id, s]));

    // Dynamic per-stage counts, in the user's own stage order — no more
    // hardcoded stage names now that stages are user-defined (see
    // server/routes/dealStages.ts). "Open" means neither the Won nor the
    // Lost stage (whichever those currently are), so this keeps working no
    // matter what the stages are named or how many there are.
    const dealsByStage = allDealStages.map((stage) => {
      const dealsInStage = allDeals.filter((d) => d.stageId === stage.id);
      return {
        stageId: stage.id,
        stageName: stage.name,
        isWon: stage.isWon,
        isLost: stage.isLost,
        count: dealsInStage.length,
        value: dealsInStage.reduce((sum, d) => sum + Number(d.value), 0),
      };
    });

    let openDealsCount = 0;
    let openDealsValue = 0;
    for (const deal of allDeals) {
      const stage = stageById.get(deal.stageId);
      if (stage && !stage.isWon && !stage.isLost) {
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
        stageName: stageById.get(deal.stageId)?.name ?? "—",
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
