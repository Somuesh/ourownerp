// Shared entity types for the REST API (replaces convex's generated
// `Doc<"table">` / `Id<"table">` types). IDs are plain strings (UUIDs).

export type Role = "admin" | "staff" | "client";
export type DealStage = "new" | "qualified" | "proposal" | "won" | "lost";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

export interface User {
  _id: string;
  name: string | null;
  email: string | null;
  role: Role;
  contactId: string | null;
}

export interface Company {
  _id: string;
  name: string;
  website?: string | null;
  industry?: string | null;
  createdBy: string;
}

export interface Contact {
  _id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  companyId?: string | null;
  createdBy: string;
}

export interface ContactWithCompany extends Contact {
  companyName: string | null;
}

export interface Deal {
  _id: string;
  title: string;
  value: number;
  stage: DealStage;
  contactId?: string | null;
  companyId?: string | null;
  createdBy: string;
}

export interface DealWithParty extends Deal {
  contactName: string | null;
  companyName: string | null;
}

export interface Activity {
  _id: string;
  contactId: string;
  authorId: string;
  note: string;
  createdAtIso: string;
}

export interface ActivityWithAuthor extends Activity {
  authorName: string | null;
}

export interface Product {
  _id: string;
  name: string;
  sku: string;
  price: number;
  stockQuantity: number;
  lowStockThreshold: number;
  category?: string | null;
  createdBy: string;
}

export interface StockAdjustment {
  _id: string;
  productId: string;
  quantityChange: number;
  reason: string;
  createdBy: string;
  createdAtIso: string;
}

export interface StockAdjustmentWithAuthor extends StockAdjustment {
  createdByName: string | null;
}

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  contactId?: string | null;
  companyId?: string | null;
  issueDateIso: string;
  dueDateIso: string;
  notes?: string | null;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  createdBy: string;
}

export interface InvoiceWithParty extends Invoice {
  contactName: string | null;
  companyName: string | null;
}

export interface InvoiceLineItem {
  _id: string;
  invoiceId: string;
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface DashboardOverview {
  openDealsCount: number;
  openDealsValue: number;
  dealsByStage: Record<DealStage, number>;
  lowStockCount: number;
  totalProductsCount: number;
  outstandingInvoicesCount: number;
  outstandingInvoicesValue: number;
  revenueThisMonth: number;
  invoicesByStatus: Record<InvoiceStatus, number>;
  recentInvoices: Array<{
    _id: string;
    invoiceNumber: string;
    status: InvoiceStatus;
    total: number;
    dueDateIso: string;
    partyName: string | null;
  }>;
  recentDeals: Array<{
    _id: string;
    title: string;
    value: number;
    stage: DealStage;
    partyName: string | null;
  }>;
}

export type SalesOrderStatus = "draft" | "confirmed" | "delivered" | "invoiced" | "cancelled";

export interface SalesOrder {
  _id: string;
  orderNumber: string;
  status: SalesOrderStatus;
  contactId?: string | null;
  companyId?: string | null;
  orderDateIso: string;
  expectedDeliveryDateIso?: string | null;
  notes?: string | null;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  confirmedAtIso?: string | null;
  deliveredAtIso?: string | null;
  invoicedAtIso?: string | null;
  cancelledAtIso?: string | null;
  invoiceId?: string | null;
  createdBy: string;
}

export interface SalesOrderWithParty extends SalesOrder {
  contactName: string | null;
  companyName: string | null;
}

export interface SalesOrderLineItem {
  _id: string;
  salesOrderId: string;
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
}
