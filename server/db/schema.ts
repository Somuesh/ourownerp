import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const roleEnum = pgEnum("role", ["admin", "staff", "client"]);
export const dealStageEnum = pgEnum("deal_stage", [
  "new",
  "qualified",
  "proposal",
  "won",
  "lost",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "overdue",
]);
export const salesOrderStatusEnum = pgEnum("sales_order_status", [
  "draft", // quotation — freely editable
  "confirmed", // sales order — locked, awaiting fulfillment
  "delivered", // stock has been shipped out
  "invoiced", // an invoice has been generated from this order
  "cancelled",
]);

// ---------------------------------------------------------------------------
// Core / identity
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenIdentifier: text("token_identifier").notNull().unique(),
  name: text("name"),
  email: text("email"),
  role: roleEnum("role").notNull(),
  contactId: uuid("contact_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  website: text("website"),
  industry: text("industry"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  companyId: uuid("company_id").references(() => companies.id),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deals = pgTable("deals", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  value: numeric("value", { precision: 14, scale: 2 }).notNull(),
  stage: dealStageEnum("stage").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id),
  companyId: uuid("company_id").references(() => companies.id),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  price: numeric("price", { precision: 14, scale: 2 }).notNull(),
  stockQuantity: integer("stock_quantity").notNull(),
  lowStockThreshold: integer("low_stock_threshold").notNull(),
  category: text("category"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockAdjustments = pgTable("stock_adjustments", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  quantityChange: integer("quantity_change").notNull(),
  reason: text("reason").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Invoicing (Sales/Purchasing in later phases will follow this same shape)
// ---------------------------------------------------------------------------

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  status: invoiceStatusEnum("status").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id),
  companyId: uuid("company_id").references(() => companies.id),
  issueDate: timestamp("issue_date", { withTimezone: true }).notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  notes: text("notes"),
  taxRate: numeric("tax_rate", { precision: 6, scale: 3 }).notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull(),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
});

// ---------------------------------------------------------------------------
// Sales — Phase 1. Quotation (draft) -> Sales Order (confirmed) -> Delivery
// -> Invoice. Deliberately reuses the existing flat `products.stockQuantity`
// counter (via stock_adjustments) rather than a proper warehouse/stock-move
// model, since multi-location inventory is Phase 4 — this will get upgraded
// then rather than built twice.
// ---------------------------------------------------------------------------

export const salesOrders = pgTable("sales_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNumber: text("order_number").notNull().unique(),
  status: salesOrderStatusEnum("status").notNull().default("draft"),
  contactId: uuid("contact_id").references(() => contacts.id),
  companyId: uuid("company_id").references(() => companies.id),
  orderDate: timestamp("order_date", { withTimezone: true }).notNull(),
  expectedDeliveryDate: timestamp("expected_delivery_date", { withTimezone: true }),
  notes: text("notes"),
  taxRate: numeric("tax_rate", { precision: 6, scale: 3 }).notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull(),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),
  // Set once each lifecycle step happens; null until then. Lets the UI
  // show a simple timeline without a separate history table.
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  invoicedAt: timestamp("invoiced_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  // Set once /invoice is called — the SO's own invoice. One-to-one for v1;
  // partial/multiple invoicing per order is a reasonable later extension.
  invoiceId: uuid("invoice_id").references(() => invoices.id),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const salesOrderLineItems = pgTable("sales_order_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  salesOrderId: uuid("sales_order_id")
    .notNull()
    .references(() => salesOrders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
});

// ---------------------------------------------------------------------------
// Platform: sequences (generalizes the old one-off "invoice number counter"
// so Sales Orders, Purchase Orders, etc. in later phases can reuse it)
// ---------------------------------------------------------------------------

export const sequences = pgTable("sequences", {
  key: text("key").primaryKey(), // e.g. "invoice", "sales_order", "purchase_order"
  value: bigint("value", { mode: "number" }).notNull().default(0),
});

// ---------------------------------------------------------------------------
// Platform: audit log — append-only record of who changed what and when.
// Every mutating route call writes one row here (see server/audit.ts).
// ---------------------------------------------------------------------------

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(), // "create" | "update" | "delete" | domain-specific e.g. "status_change"
  entityType: text("entity_type").notNull(), // "invoice", "deal", "product", ...
  entityId: text("entity_id").notNull(),
  // Best-effort diff/snapshot; deliberately loose-typed since every entity
  // shape differs and this is a debugging/compliance trail, not a source
  // of truth for application logic.
  changes: jsonb("changes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Platform: permissions — per-role capability grants, seeded with defaults
// but editable at runtime (Settings > Roles, future phase) rather than
// hardcoded in route files. See server/permissions.ts for how routes use it.
// ---------------------------------------------------------------------------

export const rolePermissions = pgTable(
  "role_permissions",
  {
    role: roleEnum("role").notNull(),
    capability: text("capability").notNull(), // e.g. "sales:create", "inventory:adjust"
    granted: boolean("granted").notNull().default(true),
  },
  (table) => [primaryKey({ columns: [table.role, table.capability] })],
);

// ---------------------------------------------------------------------------
// Relations (used by Drizzle's relational query API where convenient)
// ---------------------------------------------------------------------------

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  company: one(companies, { fields: [contacts.companyId], references: [companies.id] }),
  activities: many(activities),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  contact: one(contacts, { fields: [activities.contactId], references: [contacts.id] }),
  author: one(users, { fields: [activities.authorId], references: [users.id] }),
}));

export const dealsRelations = relations(deals, ({ one }) => ({
  contact: one(contacts, { fields: [deals.contactId], references: [contacts.id] }),
  company: one(companies, { fields: [deals.companyId], references: [companies.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  contact: one(contacts, { fields: [invoices.contactId], references: [contacts.id] }),
  company: one(companies, { fields: [invoices.companyId], references: [companies.id] }),
  lineItems: many(invoiceLineItems),
}));

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLineItems.invoiceId], references: [invoices.id] }),
  product: one(products, { fields: [invoiceLineItems.productId], references: [products.id] }),
}));

export const salesOrdersRelations = relations(salesOrders, ({ one, many }) => ({
  contact: one(contacts, { fields: [salesOrders.contactId], references: [contacts.id] }),
  company: one(companies, { fields: [salesOrders.companyId], references: [companies.id] }),
  invoice: one(invoices, { fields: [salesOrders.invoiceId], references: [invoices.id] }),
  lineItems: many(salesOrderLineItems),
}));

export const salesOrderLineItemsRelations = relations(salesOrderLineItems, ({ one }) => ({
  salesOrder: one(salesOrders, {
    fields: [salesOrderLineItems.salesOrderId],
    references: [salesOrders.id],
  }),
  product: one(products, { fields: [salesOrderLineItems.productId], references: [products.id] }),
}));
