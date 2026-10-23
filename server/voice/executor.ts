const PORT = process.env.PORT ?? "3001";
const BASE_URL = `http://localhost:${PORT}`;

class ToolExecutionError extends Error {}

async function callApi(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  authHeader: string,
  body?: unknown,
) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ToolExecutionError(json?.message ?? `Request failed with status ${res.status}`);
  }
  return json;
}

/** Trims a list down to the handful of fields worth putting in a tool
 * result — keeps the model's context small and prevents it from trying to
 * invent fields that don't exist. */
function pick<T extends Record<string, unknown>>(items: T[], keys: string[]) {
  return items.map((item) => Object.fromEntries(keys.map((k) => [k, item[k]])));
}

function matches(haystack: string | null | undefined, query: string) {
  return (haystack ?? "").toLowerCase().includes(query.toLowerCase());
}

/** result.resultPath lets the voice UI offer a "View" link after a create
 * action succeeds — set by whichever create_* tool just ran (see agent.ts). */
export interface ToolExecutionContext {
  authHeader: string;
  setResultPath: (path: string) => void;
}

type ToolHandler = (input: any, ctx: ToolExecutionContext) => Promise<unknown>;

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  // ---- search / read --------------------------------------------------
  search_companies: async (input, ctx) => {
    const all = await callApi("GET", "/companies", ctx.authHeader);
    const matched = all.filter((c: any) => matches(c.name, input.query));
    return pick(matched, ["_id", "name", "industry"]);
  },
  search_contacts: async (input, ctx) => {
    const all = await callApi("GET", "/contacts", ctx.authHeader);
    const matched = all.filter((c: any) => matches(c.name, input.query));
    return pick(matched, ["_id", "name", "email", "companyName"]);
  },
  search_products: async (input, ctx) => {
    const all = await callApi("GET", "/products", ctx.authHeader);
    const matched = all.filter(
      (p: any) => matches(p.name, input.query) || matches(p.sku, input.query),
    );
    return pick(matched, ["_id", "name", "sku", "price", "stockQuantity"]);
  },
  list_deal_stages: async (_input, ctx) => {
    const stages = await callApi("GET", "/deal-stages", ctx.authHeader);
    return pick(stages, ["_id", "name", "sortOrder", "isWon", "isLost"]);
  },
  list_sales_orders: async (_input, ctx) => {
    const orders = await callApi("GET", "/sales-orders", ctx.authHeader);
    return pick(orders.slice(0, 20), ["_id", "orderNumber", "status", "companyName", "contactName", "total"]);
  },
  list_purchase_orders: async (_input, ctx) => {
    const orders = await callApi("GET", "/purchase-orders", ctx.authHeader);
    return pick(orders.slice(0, 20), [
      "_id",
      "orderNumber",
      "status",
      "vendorCompanyName",
      "vendorContactName",
      "total",
    ]);
  },
  list_invoices: async (_input, ctx) => {
    const invoices = await callApi("GET", "/invoices", ctx.authHeader);
    return pick(invoices.slice(0, 20), [
      "_id",
      "invoiceNumber",
      "status",
      "companyName",
      "contactName",
      "total",
    ]);
  },
  list_vendor_bills: async (_input, ctx) => {
    const bills = await callApi("GET", "/vendor-bills", ctx.authHeader);
    return pick(bills.slice(0, 20), [
      "_id",
      "billNumber",
      "status",
      "vendorCompanyName",
      "vendorContactName",
      "total",
    ]);
  },
  get_dashboard_summary: async (_input, ctx) => callApi("GET", "/dashboard/overview", ctx.authHeader),

  // ---- CRM --------------------------------------------------------------
  create_company: async (input, ctx) => {
    const result = await callApi("POST", "/companies", ctx.authHeader, input);
    ctx.setResultPath("/crm/companies");
    return result;
  },
  create_contact: async (input, ctx) => {
    const result = await callApi("POST", "/contacts", ctx.authHeader, input);
    ctx.setResultPath("/crm");
    return result;
  },
  create_deal: async (input, ctx) => {
    const result = await callApi("POST", "/deals", ctx.authHeader, input);
    ctx.setResultPath("/crm/deals");
    return result;
  },
  move_deal_stage: async (input, ctx) =>
    callApi("PATCH", `/deals/${input.dealId}/stage`, ctx.authHeader, { stageId: input.stageId }),
  log_contact_activity: async (input, ctx) =>
    callApi("POST", `/contacts/${input.contactId}/activities`, ctx.authHeader, { note: input.note }),

  // ---- Inventory ----------------------------------------------------------
  create_product: async (input, ctx) => {
    const result = await callApi("POST", "/products", ctx.authHeader, input);
    ctx.setResultPath("/inventory");
    return result;
  },
  adjust_stock: async (input, ctx) =>
    callApi("POST", `/products/${input.productId}/adjustments`, ctx.authHeader, {
      quantityChange: input.quantityChange,
      reason: input.reason,
    }),

  // ---- Warehouses ----------------------------------------------------------
  list_warehouses: async (_input, ctx) => {
    const all = await callApi("GET", "/warehouses", ctx.authHeader);
    return pick(all, ["_id", "name", "code", "isDefault", "isActive"]);
  },
  create_warehouse: async (input, ctx) => {
    const result = await callApi("POST", "/warehouses", ctx.authHeader, input);
    ctx.setResultPath("/inventory/warehouses");
    return result;
  },
  get_stock_by_warehouse: async (input, ctx) => {
    const data = await callApi("GET", "/inventory/stock", ctx.authHeader);
    const names = new Map<string, string>(data.warehouses.map((w: any) => [w._id, w.name]));
    const rows = data.products
      .filter((p: any) => !input.query || matches(p.name, input.query) || matches(p.sku, input.query))
      .slice(0, 25)
      .map((p: any) => ({
        _id: p._id,
        name: p.name,
        sku: p.sku,
        total: p.total,
        byWarehouse: Object.fromEntries(
          Object.entries(p.quantities).map(([id, q]) => [names.get(id) ?? id, q]),
        ),
      }));
    return rows;
  },
  transfer_stock: async (input, ctx) => {
    const result = await callApi("POST", "/stock-transfers", ctx.authHeader, input);
    ctx.setResultPath("/inventory/warehouses");
    return result;
  },
  get_reorder_report: async (_input, ctx) => callApi("GET", "/inventory/reorder", ctx.authHeader),

  // ---- HR -----------------------------------------------------------------
  search_employees: async (input, ctx) => {
    const all = await callApi("GET", "/employees", ctx.authHeader);
    return pick(
      all.filter((e: any) => matches(e.name, input.query)),
      ["_id", "name", "employeeNumber", "jobTitle", "departmentName", "status"],
    );
  },
  list_departments: async (_input, ctx) => callApi("GET", "/departments", ctx.authHeader),
  create_department: async (input, ctx) => {
    const result = await callApi("POST", "/departments", ctx.authHeader, input);
    ctx.setResultPath("/hr");
    return result;
  },
  create_employee: async (input, ctx) => {
    const result = await callApi("POST", "/employees", ctx.authHeader, input);
    ctx.setResultPath("/hr");
    return result;
  },
  list_leave_types: async (_input, ctx) => callApi("GET", "/leave-types", ctx.authHeader),
  request_leave: async (input, ctx) => {
    const result = await callApi("POST", "/leave-requests", ctx.authHeader, input);
    ctx.setResultPath("/hr");
    return result;
  },
  list_leave_requests: async (input, ctx) => {
    const q = input.status ? `?status=${encodeURIComponent(input.status)}` : "";
    const all = await callApi("GET", `/leave-requests${q}`, ctx.authHeader);
    return pick(all.slice(0, 25), ["_id", "requestNumber", "employeeName", "leaveTypeName", "startDate", "endDate", "days", "status"]);
  },
  approve_leave: async (input, ctx) =>
    callApi("POST", `/leave-requests/${input.leaveRequestId}/approve`, ctx.authHeader),
  reject_leave: async (input, ctx) =>
    callApi("POST", `/leave-requests/${input.leaveRequestId}/reject`, ctx.authHeader),
  get_leave_balance: async (input, ctx) =>
    callApi("GET", `/employees/${input.employeeId}/leave-balance`, ctx.authHeader),
  who_is_on_leave: async (input, ctx) => {
    const q = input.date ? `?date=${encodeURIComponent(input.date)}` : "";
    return callApi("GET", `/leaves/on${q}`, ctx.authHeader);
  },
  check_in: async (input, ctx) => callApi("POST", "/attendance/check-in", ctx.authHeader, input),
  check_out: async (input, ctx) => callApi("POST", "/attendance/check-out", ctx.authHeader, input),

  // ---- POS ----------------------------------------------------------------
  get_pos_session: async (_input, ctx) => callApi("GET", "/pos/session", ctx.authHeader),
  open_pos_session: async (input, ctx) => {
    const result = await callApi("POST", "/pos/sessions/open", ctx.authHeader, input);
    ctx.setResultPath("/pos");
    return result;
  },
  create_pos_sale: async (input, ctx) => {
    const result = await callApi("POST", "/pos/orders", ctx.authHeader, input);
    ctx.setResultPath("/pos");
    return result;
  },
  close_pos_session: async (input, ctx) =>
    callApi("POST", `/pos/sessions/${input.sessionId}/close`, ctx.authHeader, { closingCash: input.closingCash }),

  // ---- Sales --------------------------------------------------------------
  create_sales_order: async (input, ctx) => {
    const result = await callApi("POST", "/sales-orders", ctx.authHeader, input);
    ctx.setResultPath("/sales");
    return result;
  },
  confirm_sales_order: async (input, ctx) =>
    callApi("POST", `/sales-orders/${input.salesOrderId}/confirm`, ctx.authHeader),
  deliver_sales_order: async (input, ctx) =>
    callApi("POST", `/sales-orders/${input.salesOrderId}/deliver`, ctx.authHeader, {
      warehouseId: input.warehouseId,
    }),
  invoice_sales_order: async (input, ctx) => {
    const result = await callApi("POST", `/sales-orders/${input.salesOrderId}/invoice`, ctx.authHeader, {
      dueDateIso: input.dueDateIso,
    });
    ctx.setResultPath("/invoices");
    return result;
  },
  cancel_sales_order: async (input, ctx) =>
    callApi("POST", `/sales-orders/${input.salesOrderId}/cancel`, ctx.authHeader),

  // ---- Invoicing ------------------------------------------------------------
  create_invoice: async (input, ctx) => {
    const result = await callApi("POST", "/invoices", ctx.authHeader, input);
    ctx.setResultPath("/invoices");
    return result;
  },
  update_invoice_status: async (input, ctx) =>
    callApi("PATCH", `/invoices/${input.invoiceId}/status`, ctx.authHeader, { status: input.status }),

  // ---- Purchasing -----------------------------------------------------------
  create_purchase_order: async (input, ctx) => {
    const result = await callApi("POST", "/purchase-orders", ctx.authHeader, input);
    ctx.setResultPath("/purchasing");
    return result;
  },
  confirm_purchase_order: async (input, ctx) =>
    callApi("POST", `/purchase-orders/${input.purchaseOrderId}/confirm`, ctx.authHeader),
  receive_purchase_order: async (input, ctx) =>
    callApi("POST", `/purchase-orders/${input.purchaseOrderId}/receive`, ctx.authHeader, {
      warehouseId: input.warehouseId,
    }),
  bill_purchase_order: async (input, ctx) => {
    const result = await callApi(
      "POST",
      `/purchase-orders/${input.purchaseOrderId}/bill`,
      ctx.authHeader,
      { dueDateIso: input.dueDateIso },
    );
    ctx.setResultPath("/purchasing/bills");
    return result;
  },
  cancel_purchase_order: async (input, ctx) =>
    callApi("POST", `/purchase-orders/${input.purchaseOrderId}/cancel`, ctx.authHeader),
  create_vendor_bill: async (input, ctx) => {
    const result = await callApi("POST", "/vendor-bills", ctx.authHeader, input);
    ctx.setResultPath("/purchasing/bills");
    return result;
  },
  update_vendor_bill_status: async (input, ctx) =>
    callApi("PATCH", `/vendor-bills/${input.vendorBillId}/status`, ctx.authHeader, {
      status: input.status,
    }),
};

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<unknown> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return { error: `Unknown tool "${name}"` };
  }
  try {
    return await handler(input, ctx);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong" };
  }
}
