# Roadmap

Goal: bring this system's functionality up to (and eventually past) Odoo's
core modules for our use case, plus voice-driven data entry — built in
phases, each one a working, testable state rather than one giant rewrite.

Priority order (as decided): Sales → Purchasing → Inventory/Warehouse →
HR/Employees → Point of Sale → Projects/Tasks → Accounting (GL) →
Manufacturing. Voice assistant lands after Sales + Purchasing exist.

- [x] **Phase 0 — Foundation**: Postgres + Drizzle ORM, migrations tooling,
      audit log, generalized document-numbering sequences, capability-based
      permissions framework (additive — existing role checks untouched).
- [x] **Phase 1 — Sales**: Quotation → Sales Order → Delivery → Invoice →
      Payment, replacing today's flat invoice-only flow. Line items carry
      state (quoted/confirmed/delivered/invoiced).
- [x] **Phase 2 — Purchasing**: Vendors, Purchase Orders, Vendor Bills,
      receiving flow. Mirrors Sales structurally.
- [x] **Phase 3 — Voice assistant v1**: speech-to-text → intent parsing →
      calls the same API endpoints Sales/Purchasing expose. Asks for
      missing required fields, confirms before executing. Scoped to
      Sales + Purchasing intents at this stage.
- [ ] **Phase 4 — Inventory/Warehouse**: multi-location stock, stock moves
      with full traceability, valuation methods, reorder rules. Extends
      voice to inventory intents.
- [ ] **Phase 5 — HR/Employees**
- [ ] **Phase 6 — Point of Sale**
- [ ] **Phase 7 — Projects/Tasks**
- [ ] **Phase 8 — Real Accounting**: double-entry ledger, chart of accounts,
      payment reconciliation, tax reports. Requires backfilling journal
      entries for everything created in Phases 1–7 so historical reports
      are accurate — a known, planned cost of sequencing accounting last.
- [ ] **Phase 9 — Manufacturing**: BOM, work orders.

Each phase ships as a working zip with its own test instructions — see
`MIGRATION.md` for what changed under the hood at each step.
