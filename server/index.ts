import cors from "cors";
import express from "express";
import { AppError } from "./auth.ts";
import { seedPermissions } from "./db/seed.ts";
import activitiesRouter from "./routes/activities.ts";
import companiesRouter from "./routes/companies.ts";
import contactsRouter from "./routes/contacts.ts";
import dashboardRouter from "./routes/dashboard.ts";
import dealsRouter from "./routes/deals.ts";
import invoicesRouter from "./routes/invoices.ts";
import portalRouter from "./routes/portal.ts";
import productsRouter from "./routes/products.ts";
import stockAdjustmentsRouter from "./routes/stockAdjustments.ts";
import usersRouter from "./routes/users.ts";

import dotenv from "dotenv";
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(usersRouter);
app.use(companiesRouter);
app.use(contactsRouter);
app.use(dealsRouter);
app.use(activitiesRouter);
app.use(productsRouter);
app.use(stockAdjustmentsRouter);
app.use(invoicesRouter);
app.use(portalRouter);
app.use(dashboardRouter);

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
  // this only seeds default role permissions into an empty table.
  await seedPermissions();

  const port = Number(process.env.PORT ?? 3001);
  app.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
