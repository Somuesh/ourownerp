import type { ToolDefinition } from "./types.ts";

const lineItemsSchema = {
  type: "array",
  description: "One or more line items.",
  items: {
    type: "object",
    properties: {
      productId: { type: "string", description: "ID of an existing product, if this line is for a catalog product. Look it up with search_products first." },
      description: { type: "string", description: "Line description — the product name if productId is set, or free text for a custom line." },
      quantity: { type: "number", description: "Quantity." },
      unitPrice: { type: "number", description: "Price per unit." },
    },
    required: ["description", "quantity", "unitPrice"],
  },
} as const;

/**
 * Every tool the voice assistant can call — read/search tools so it can
 * resolve names to IDs itself, and write tools mirroring the exact body
 * shape each REST endpoint already accepts (see server/voice/executor.ts
 * for how each one maps to an actual API call). Keep names and shapes in
 * sync with server/routes/*.ts if those change.
 */
export const VOICE_TOOLS: ToolDefinition[] = [
  // ---- Search / read -------------------------------------------------
  {
    name: "search_companies",
    description: "Search existing companies by (partial) name. Use this before referencing a company in another tool.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Partial or full company name." } },
      required: ["query"],
    },
  },
  {
    name: "search_contacts",
    description: "Search existing contacts by (partial) name. Use this before referencing a contact in another tool.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Partial or full contact name." } },
      required: ["query"],
    },
  },
  {
    name: "search_products",
    description: "Search existing products by (partial) name or SKU. Use this before referencing a product in another tool.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Partial or full product name or SKU." } },
      required: ["query"],
    },
  },
  {
    name: "list_deal_stages",
    description: "List all CRM pipeline stages in order. Use this to find the right stageId for create_deal or move_deal_stage — if the user doesn't name a stage, use the one with the lowest sortOrder (the default starting stage).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_sales_orders",
    description: "List recent sales orders (with order number, status, customer, total). Use this to find a salesOrderId when the user refers to one by number or customer name.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_purchase_orders",
    description: "List recent purchase orders (with order number, status, vendor, total). Use this to find a purchaseOrderId when the user refers to one by number or vendor name.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_invoices",
    description: "List recent invoices (with invoice number, status, customer, total). Use this to find an invoiceId when the user refers to one by number or customer name.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_vendor_bills",
    description: "List recent vendor bills (with bill number, status, vendor, total). Use this to find a vendorBillId when the user refers to one by number or vendor name.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_dashboard_summary",
    description: "Get overview numbers: open deals, low stock count, outstanding invoices/bills, revenue this month, open purchase orders. Use this to answer questions about business status.",
    parameters: { type: "object", properties: {} },
  },

  // ---- CRM ------------------------------------------------------------
  {
    name: "create_company",
    description: "Create a new company (customer or vendor — same table either way).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        website: { type: "string" },
        industry: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_contact",
    description: "Create a new contact person, optionally linked to a company.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        companyId: { type: "string", description: "Look up with search_companies first if the user named a company." },
      },
      required: ["name"],
    },
  },
  {
    name: "create_deal",
    description: "Create a new CRM deal/opportunity.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        value: { type: "number" },
        stageId: { type: "string", description: "From list_deal_stages. If the user doesn't say a stage, use the default (lowest sortOrder) stage." },
        contactId: { type: "string" },
        companyId: { type: "string" },
      },
      required: ["title", "value", "stageId"],
    },
  },
  {
    name: "move_deal_stage",
    description: "Move an existing deal to a different pipeline stage.",
    parameters: {
      type: "object",
      properties: {
        dealId: { type: "string" },
        stageId: { type: "string", description: "From list_deal_stages." },
      },
      required: ["dealId", "stageId"],
    },
  },
  {
    name: "log_contact_activity",
    description: "Log a note/call/activity against a contact.",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        note: { type: "string" },
      },
      required: ["contactId", "note"],
    },
  },

  // ---- Inventory --------------------------------------------------------
  {
    name: "create_product",
    description: "Create a new product in the catalog.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        sku: { type: "string", description: "Unique SKU. If the user doesn't give one, make up a short reasonable one from the product name." },
        price: { type: "number" },
        stockQuantity: { type: "number", description: "Starting stock on hand. Default to 0 if not specified." },
        lowStockThreshold: { type: "number", description: "Low-stock alert threshold. Default to 5 if not specified." },
        category: { type: "string" },
      },
      required: ["name", "sku", "price", "stockQuantity", "lowStockThreshold"],
    },
  },
  {
    name: "adjust_stock",
    description: "Manually adjust a product's stock level (received shipment, damage, correction, etc.) — not for order fulfillment, which happens automatically via deliver_sales_order/receive_purchase_order.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "Look up with search_products first." },
        quantityChange: { type: "number", description: "Positive to add stock, negative to remove." },
        reason: { type: "string" },
      },
      required: ["productId", "quantityChange", "reason"],
    },
  },

  // ---- Warehouses ---------------------------------------------------------
  {
    name: "list_warehouses",
    description: "List all warehouses/locations with their IDs. Use this to resolve a warehouse name to an ID before transferring stock.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "create_warehouse",
    description: "Create a new warehouse/location.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        code: { type: "string", description: "Short code, optional." },
        address: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_stock_by_warehouse",
    description: "Show how much of products is held in each warehouse. Optionally filter by product name/SKU.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Optional partial product name or SKU." } },
    },
  },
  {
    name: "transfer_stock",
    description: "Move stock of a product from one warehouse to another.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "Look up with search_products first." },
        fromWarehouseId: { type: "string", description: "Look up with list_warehouses." },
        toWarehouseId: { type: "string", description: "Look up with list_warehouses." },
        quantity: { type: "number", description: "Whole units to move." },
        note: { type: "string" },
      },
      required: ["productId", "fromWarehouseId", "toWarehouseId", "quantity"],
    },
  },
  {
    name: "get_reorder_report",
    description: "List products at or below their low-stock threshold with a suggested reorder quantity.",
    parameters: { type: "object", properties: {} },
  },

  // ---- HR -------------------------------------------------------------------
  {
    name: "search_employees",
    description: "Search employees by (partial) name. Use this before referencing an employee in another tool.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Partial or full employee name." } },
      required: ["query"],
    },
  },
  {
    name: "list_departments",
    description: "List all departments with their IDs.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "create_department",
    description: "Create a department. Check list_departments first to avoid duplicates.",
    parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
  {
    name: "create_employee",
    description: "Add a new employee. Search with search_employees first to avoid duplicates.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        jobTitle: { type: "string" },
        departmentId: { type: "string", description: "Look up with list_departments." },
        managerId: { type: "string", description: "Employee ID of the manager, from search_employees." },
        hireDate: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["name"],
    },
  },
  {
    name: "list_leave_types",
    description: "List leave types (annual, sick, ...) with their IDs and yearly allowance.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "request_leave",
    description: "Create a leave request for an employee (omit employeeId for the current user's own leave). Weekends are not counted.",
    parameters: {
      type: "object",
      properties: {
        employeeId: { type: "string" },
        leaveTypeId: { type: "string", description: "From list_leave_types." },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD (same as start for one day)" },
        reason: { type: "string" },
      },
      required: ["leaveTypeId", "startDate", "endDate"],
    },
  },
  {
    name: "list_leave_requests",
    description: "List leave requests, optionally only those with a given status.",
    parameters: {
      type: "object",
      properties: { status: { type: "string", enum: ["pending", "approved", "rejected", "cancelled"] } },
    },
  },
  {
    name: "approve_leave",
    description: "Approve a pending leave request (admin only).",
    parameters: { type: "object", properties: { leaveRequestId: { type: "string" } }, required: ["leaveRequestId"] },
  },
  {
    name: "reject_leave",
    description: "Reject a pending leave request (admin only).",
    parameters: { type: "object", properties: { leaveRequestId: { type: "string" } }, required: ["leaveRequestId"] },
  },
  {
    name: "get_leave_balance",
    description: "Show an employee's leave balance (allowed, used, remaining) for this year.",
    parameters: { type: "object", properties: { employeeId: { type: "string" } }, required: ["employeeId"] },
  },
  {
    name: "who_is_on_leave",
    description: "List employees on approved leave on a given day (default today).",
    parameters: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD, optional." } } },
  },
  {
    name: "check_in",
    description: "Record attendance check-in for the current user (or the given employee if admin).",
    parameters: { type: "object", properties: { employeeId: { type: "string" } } },
  },
  {
    name: "check_out",
    description: "Record attendance check-out for the current user (or the given employee if admin).",
    parameters: { type: "object", properties: { employeeId: { type: "string" } } },
  },

  // ---- POS ------------------------------------------------------------------
  {
    name: "get_pos_session",
    description: "Get the current user's open POS session with sales totals so far, or null if none is open.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "open_pos_session",
    description: "Open a POS register session with the starting cash in the drawer.",
    parameters: {
      type: "object",
      properties: {
        openingCash: { type: "number", description: "Cash in the drawer at start. Ask if not stated." },
        warehouseId: { type: "string", description: "Optional; defaults to the main warehouse." },
      },
      required: ["openingCash"],
    },
  },
  {
    name: "create_pos_sale",
    description: "Ring up a point-of-sale sale in the open session. Prices come from the product catalog. Reduces stock.",
    parameters: {
      type: "object",
      properties: {
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              productId: { type: "string", description: "Look up with search_products first." },
              quantity: { type: "number" },
            },
            required: ["productId", "quantity"],
          },
        },
        paymentMethod: { type: "string", enum: ["cash", "card", "upi"] },
        amountTendered: { type: "number", description: "Cash handed over (cash payments only)." },
        taxRate: { type: "number", description: "Tax percent, e.g. 18. Default 0." },
      },
      required: ["lines", "paymentMethod"],
    },
  },
  {
    name: "close_pos_session",
    description: "Close the open POS session given the counted cash in the drawer. Reports expected cash and any difference.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "From get_pos_session." },
        closingCash: { type: "number", description: "Counted cash in the drawer." },
      },
      required: ["sessionId", "closingCash"],
    },
  },

  // ---- Sales ------------------------------------------------------------
  {
    name: "create_sales_order",
    description: "Create a new sales order quotation (draft) for a customer.",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        companyId: { type: "string" },
        orderDateIso: { type: "string", description: "ISO date. Default to today if not specified." },
        expectedDeliveryDateIso: { type: "string" },
        taxRate: { type: "number", description: "Percent, e.g. 8.5. Default to 0 if not specified." },
        notes: { type: "string" },
        lineItems: lineItemsSchema,
      },
      required: ["orderDateIso", "taxRate", "lineItems"],
    },
  },
  {
    name: "confirm_sales_order",
    description: "Confirm a draft sales order (quotation -> confirmed order). Locks it for editing.",
    parameters: {
      type: "object",
      properties: { salesOrderId: { type: "string" } },
      required: ["salesOrderId"],
    },
  },
  {
    name: "deliver_sales_order",
    description: "Mark a confirmed sales order as delivered. Decrements product stock for each line item from the chosen warehouse (default warehouse if none given).",
    parameters: {
      type: "object",
      properties: {
        salesOrderId: { type: "string" },
        warehouseId: { type: "string", description: "Optional. Look up with list_warehouses; ask the user if several warehouses exist and they did not say." },
      },
      required: ["salesOrderId"],
    },
  },
  {
    name: "invoice_sales_order",
    description: "Generate an invoice from a delivered sales order.",
    parameters: {
      type: "object",
      properties: {
        salesOrderId: { type: "string" },
        dueDateIso: { type: "string" },
      },
      required: ["salesOrderId"],
    },
  },
  {
    name: "cancel_sales_order",
    description: "Cancel a draft or confirmed sales order.",
    parameters: {
      type: "object",
      properties: { salesOrderId: { type: "string" } },
      required: ["salesOrderId"],
    },
  },

  // ---- Invoicing ----------------------------------------------------------
  {
    name: "create_invoice",
    description: "Create a standalone invoice directly (not from a sales order).",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        companyId: { type: "string" },
        issueDateIso: { type: "string", description: "Default to today if not specified." },
        dueDateIso: { type: "string", description: "Default to today if not specified." },
        taxRate: { type: "number", description: "Percent. Default to 0 if not specified." },
        notes: { type: "string" },
        lineItems: lineItemsSchema,
      },
      required: ["issueDateIso", "dueDateIso", "taxRate", "lineItems"],
    },
  },
  {
    name: "update_invoice_status",
    description: "Change an invoice's status.",
    parameters: {
      type: "object",
      properties: {
        invoiceId: { type: "string" },
        status: { type: "string", enum: ["draft", "sent", "paid", "overdue"] },
      },
      required: ["invoiceId", "status"],
    },
  },

  // ---- Purchasing ---------------------------------------------------------
  {
    name: "create_purchase_order",
    description: "Create a new purchase order RFQ (draft) for a vendor.",
    parameters: {
      type: "object",
      properties: {
        vendorContactId: { type: "string" },
        vendorCompanyId: { type: "string" },
        orderDateIso: { type: "string", description: "Default to today if not specified." },
        expectedReceiptDateIso: { type: "string" },
        taxRate: { type: "number", description: "Percent. Default to 0 if not specified." },
        notes: { type: "string" },
        lineItems: lineItemsSchema,
      },
      required: ["orderDateIso", "taxRate", "lineItems"],
    },
  },
  {
    name: "confirm_purchase_order",
    description: "Confirm a draft purchase order (RFQ -> confirmed order). Locks it for editing.",
    parameters: {
      type: "object",
      properties: { purchaseOrderId: { type: "string" } },
      required: ["purchaseOrderId"],
    },
  },
  {
    name: "receive_purchase_order",
    description: "Mark a confirmed purchase order as received. Increments product stock for each line item in the chosen warehouse (default warehouse if none given).",
    parameters: {
      type: "object",
      properties: {
        purchaseOrderId: { type: "string" },
        warehouseId: { type: "string", description: "Optional. Look up with list_warehouses; ask the user if several warehouses exist and they did not say." },
      },
      required: ["purchaseOrderId"],
    },
  },
  {
    name: "bill_purchase_order",
    description: "Generate a vendor bill from a received purchase order.",
    parameters: {
      type: "object",
      properties: {
        purchaseOrderId: { type: "string" },
        dueDateIso: { type: "string" },
      },
      required: ["purchaseOrderId"],
    },
  },
  {
    name: "cancel_purchase_order",
    description: "Cancel a draft or confirmed purchase order.",
    parameters: {
      type: "object",
      properties: { purchaseOrderId: { type: "string" } },
      required: ["purchaseOrderId"],
    },
  },
  {
    name: "create_vendor_bill",
    description: "Create a standalone vendor bill directly (not from a purchase order).",
    parameters: {
      type: "object",
      properties: {
        vendorContactId: { type: "string" },
        vendorCompanyId: { type: "string" },
        billDateIso: { type: "string", description: "Default to today if not specified." },
        dueDateIso: { type: "string", description: "Default to today if not specified." },
        taxRate: { type: "number", description: "Percent. Default to 0 if not specified." },
        notes: { type: "string" },
        lineItems: lineItemsSchema,
      },
      required: ["billDateIso", "dueDateIso", "taxRate", "lineItems"],
    },
  },
  {
    name: "update_vendor_bill_status",
    description: "Change a vendor bill's status.",
    parameters: {
      type: "object",
      properties: {
        vendorBillId: { type: "string" },
        status: { type: "string", enum: ["draft", "open", "paid", "overdue"] },
      },
      required: ["vendorBillId", "status"],
    },
  },
];
