// Must be the very first import — everything below reads process.env.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import { AppError } from "./auth.ts";
import { seedDealStages, seedLeaveTypes, seedPermissions, seedWarehouses } from "./db/seed.ts";
import activitiesRouter from "./routes/activities.ts";
import companiesRouter from "./routes/companies.ts";
import contactsRouter from "./routes/contacts.ts";
import dashboardRouter from "./routes/dashboard.ts";
import dealsRouter from "./routes/deals.ts";
import dealStagesRouter from "./routes/dealStages.ts";
import hrRouter from "./routes/hr.ts";
import invoicesRouter from "./routes/invoices.ts";
import posRouter from "./routes/pos.ts";
import portalRouter from "./routes/portal.ts";
import productsRouter from "./routes/products.ts";
import purchaseOrdersRouter from "./routes/purchaseOrders.ts";
import salesOrdersRouter from "./routes/salesOrders.ts";
import stockAdjustmentsRouter from "./routes/stockAdjustments.ts";
import warehousesRouter from "./routes/warehouses.ts";
import userInvitesRouter from "./routes/userInvites.ts";
import usersRouter from "./routes/users.ts";
import vendorBillsRouter from "./routes/vendorBills.ts";
import voiceRouter from "./routes/voice.ts";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(usersRouter);
app.use(userInvitesRouter);
app.use(companiesRouter);
app.use(contactsRouter);
app.use(dealsRouter);
app.use(dealStagesRouter);
app.use(activitiesRouter);
app.use(productsRouter);
app.use(stockAdjustmentsRouter);
app.use(warehousesRouter);
app.use(hrRouter);
app.use(posRouter);
app.use(invoicesRouter);
app.use(salesOrdersRouter);
app.use(purchaseOrdersRouter);
app.use(vendorBillsRouter);
app.use(portalRouter);
app.use(dashboardRouter);
app.use(voiceRouter);

// Production: serve the built frontend (dist/) from this same server, with SPA
// fallback so deep links like /auth/callback work. Skipped when dist/ is absent
// (local dev uses the Vite dev server instead).
const distDir = path.resolve(process.cwd(), "dist");
if (fs.existsSync(path.join(distDir, "index.html"))) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" || !req.accepts("html")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
  console.log(`Serving frontend from ${distDir}`);
} else {
  console.warn(`No frontend build found at ${distDir} — API only. (Commit dist/ — see DEPLOY.md.)`);
}

app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ message: "Something went wrong" });
  },
);

async function main() {
  // Assumes migrations have already been applied (`pnpm db:migrate`) —
  // these only seed empty tables with sensible defaults.
  await seedPermissions();
  await seedDealStages();
  await seedWarehouses();
  await seedLeaveTypes();

  const port = Number(process.env.PORT ?? 3001);
  app.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
