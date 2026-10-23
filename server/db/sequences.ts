import { sql } from "drizzle-orm";
import { db } from "./client.ts";
import { sequences } from "./schema.ts";

const PREFIXES: Record<string, string> = {
  invoice: "INV",
  sales_order: "SO",
  purchase_order: "PO",
  vendor_bill: "BILL",
  stock_transfer: "TRF",
  employee: "EMP",
  leave_request: "LV",
  pos_session: "SES",
  pos_order: "POS",
};

/**
 * Atomically increments and returns the next number for a named sequence
 * (e.g. "invoice", "sales_order", "purchase_order"), formatted as
 * "<PREFIX>-0001". One row per sequence in the `sequences` table;
 * upsert + `RETURNING` keeps the increment atomic under concurrent callers
 * without a separate transaction/lock.
 *
 * Add a new key to PREFIXES when a later phase introduces a new
 * document type (Sales Orders, Purchase Orders, etc.) rather than
 * inventing a bespoke counter per module.
 */
export async function nextSequenceNumber(key: string): Promise<string> {
  const prefix = PREFIXES[key] ?? key.toUpperCase();

  const [row] = await db
    .insert(sequences)
    .values({ key, value: 1 })
    .onConflictDoUpdate({
      target: sequences.key,
      set: { value: sql`${sequences.value} + 1` },
    })
    .returning({ value: sequences.value });

  return `${prefix}-${String(row.value).padStart(4, "0")}`;
}
