import { db } from "./db/client.ts";
import { auditLog } from "./db/schema.ts";

/**
 * Records one row in the append-only audit trail. Call this from route
 * handlers right after a successful create/update/delete/status-change —
 * it's fire-and-forget from the caller's perspective (awaited, but never
 * throws) so a logging hiccup can't fail the underlying business operation.
 *
 * `changes` is a best-effort snapshot for humans reviewing history, not a
 * source of truth the app reads back — keep it to what's useful in a
 * "what happened here" view (e.g. the fields that changed, or the full
 * payload for a create).
 */
export async function recordAudit(entry: {
  actorId: string | null;
  action: "create" | "update" | "delete" | "status_change" | (string & {});
  entityType: string;
  entityId: string;
  changes?: unknown;
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      changes: entry.changes ?? null,
    });
  } catch (error) {
    // Never let audit logging break the actual request.
    console.error("Failed to write audit log entry:", error);
  }
}
