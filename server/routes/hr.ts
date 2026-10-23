import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { Router } from "express";
import { recordAudit } from "../audit.ts";
import { AppError, asyncHandler } from "../auth.ts";
import { db } from "../db/client.ts";
import { nextSequenceNumber } from "../db/sequences.ts";
import { attendance, departments, employees, leaveRequests, leaveTypes } from "../db/schema.ts";
import { CAPABILITIES, hasCapability, requireCapability } from "../permissions.ts";

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Inclusive count of weekdays (Mon–Fri) between two YYYY-MM-DD dates. */
function countWeekdays(start: string, end: string) {
  let n = 0;
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

/** The employee record linked to the signed-in user, if any. */
async function ownEmployeeId(userId: string) {
  const e = await db.query.employees.findFirst({ where: eq(employees.userId, userId) });
  return e?.id ?? null;
}

function toEmployee(r: {
  e: typeof employees.$inferSelect;
  departmentName: string | null;
  managerName: string | null;
}) {
  return {
    _id: r.e.id,
    employeeNumber: r.e.employeeNumber,
    name: r.e.name,
    email: r.e.email,
    phone: r.e.phone,
    jobTitle: r.e.jobTitle,
    departmentId: r.e.departmentId,
    departmentName: r.departmentName,
    managerId: r.e.managerId,
    managerName: r.managerName,
    userId: r.e.userId,
    status: r.e.status,
    hireDate: r.e.hireDate,
  };
}

// ---- Departments ------------------------------------------------------------

router.get(
  "/departments",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.HR_READ);
    const rows = await db.select().from(departments).orderBy(departments.name);
    res.json(rows.map((d) => ({ _id: d.id, name: d.name })));
  }),
);

router.post(
  "/departments",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.HR_WRITE);
    const name = String((req.body as { name?: string }).name ?? "").trim();
    if (!name) throw new AppError(400, "Name is required");
    const existing = await db.query.departments.findFirst({ where: eq(departments.name, name) });
    if (existing) throw new AppError(400, "Department already exists");
    const [row] = await db.insert(departments).values({ name }).returning();
    await recordAudit({ actorId: user._id, action: "create", entityType: "department", entityId: row.id, changes: { name } });
    res.json({ _id: row.id, name: row.name });
  }),
);

// ---- Employees --------------------------------------------------------------

async function listEmployees() {
  const rows = await db.select().from(employees).orderBy(employees.name);
  const depts = new Map((await db.select().from(departments)).map((d) => [d.id, d.name]));
  const byId = new Map(rows.map((e) => [e.id, e.name]));
  return rows.map((e) =>
    toEmployee({
      e,
      departmentName: e.departmentId ? (depts.get(e.departmentId) ?? null) : null,
      managerName: e.managerId ? (byId.get(e.managerId) ?? null) : null,
    }),
  );
}

router.get(
  "/employees",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.HR_READ);
    res.json(await listEmployees());
  }),
);

/** The signed-in user's own employee record (null if none linked). */
router.get(
  "/employees/me",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.HR_READ);
    const all = await listEmployees();
    res.json(all.find((e) => e.userId === user._id) ?? null);
  }),
);

interface EmployeeBody {
  name?: string;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  departmentId?: string | null;
  managerId?: string | null;
  userId?: string | null;
  status?: "active" | "on_leave" | "terminated";
  hireDate?: string | null;
}

router.post(
  "/employees",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.HR_WRITE);
    const b = req.body as EmployeeBody;
    if (!b.name?.trim()) throw new AppError(400, "Name is required");
    if (b.hireDate && !DATE_RE.test(b.hireDate)) throw new AppError(400, "hireDate must be YYYY-MM-DD");
    const employeeNumber = await nextSequenceNumber("employee");
    const [row] = await db
      .insert(employees)
      .values({
        employeeNumber,
        name: b.name.trim(),
        email: b.email?.trim() || null,
        phone: b.phone?.trim() || null,
        jobTitle: b.jobTitle?.trim() || null,
        departmentId: b.departmentId || null,
        managerId: b.managerId || null,
        userId: b.userId || null,
        status: b.status ?? "active",
        hireDate: b.hireDate || null,
      })
      .returning();
    await recordAudit({ actorId: user._id, action: "create", entityType: "employee", entityId: row.id, changes: { employeeNumber, name: row.name } });
    res.json({ _id: row.id, employeeNumber });
  }),
);

router.patch(
  "/employees/:id",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.HR_WRITE);
    const b = req.body as EmployeeBody;
    const existing = await db.query.employees.findFirst({ where: eq(employees.id, req.params.id) });
    if (!existing) throw new AppError(404, "Employee not found");
    if (b.managerId && b.managerId === req.params.id) throw new AppError(400, "An employee cannot manage themselves");
    if (b.hireDate && !DATE_RE.test(b.hireDate)) throw new AppError(400, "hireDate must be YYYY-MM-DD");
    const patch: Partial<typeof employees.$inferInsert> = {};
    if (b.name !== undefined) patch.name = b.name.trim();
    if (b.email !== undefined) patch.email = b.email?.trim() || null;
    if (b.phone !== undefined) patch.phone = b.phone?.trim() || null;
    if (b.jobTitle !== undefined) patch.jobTitle = b.jobTitle?.trim() || null;
    if (b.departmentId !== undefined) patch.departmentId = b.departmentId || null;
    if (b.managerId !== undefined) patch.managerId = b.managerId || null;
    if (b.userId !== undefined) patch.userId = b.userId || null;
    if (b.status !== undefined) patch.status = b.status;
    if (b.hireDate !== undefined) patch.hireDate = b.hireDate || null;
    if (Object.keys(patch).length > 0) {
      await db.update(employees).set(patch).where(eq(employees.id, req.params.id));
    }
    await recordAudit({ actorId: user._id, action: "update", entityType: "employee", entityId: req.params.id, changes: patch });
    res.json(null);
  }),
);

// ---- Leave --------------------------------------------------------------------

router.get(
  "/leave-types",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.HR_READ);
    const rows = await db.select().from(leaveTypes).orderBy(leaveTypes.name);
    res.json(rows.map((t) => ({ _id: t.id, name: t.name, daysPerYear: t.daysPerYear })));
  }),
);

router.post(
  "/leave-types",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.HR_WRITE);
    const { name, daysPerYear } = req.body as { name?: string; daysPerYear?: number };
    if (!name?.trim()) throw new AppError(400, "Name is required");
    const [row] = await db
      .insert(leaveTypes)
      .values({ name: name.trim(), daysPerYear: Math.max(0, Math.round(Number(daysPerYear ?? 0))) })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new AppError(400, "Leave type already exists");
    await recordAudit({ actorId: user._id, action: "create", entityType: "leave_type", entityId: row.id, changes: { name: row.name } });
    res.json({ _id: row.id });
  }),
);

async function listLeaveRequests(filter?: { status?: string; employeeId?: string }) {
  const conds = [];
  if (filter?.status) conds.push(eq(leaveRequests.status, filter.status as any));
  if (filter?.employeeId) conds.push(eq(leaveRequests.employeeId, filter.employeeId));
  const rows = await db
    .select({ r: leaveRequests, employeeName: employees.name, leaveTypeName: leaveTypes.name })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(leaveRequests.createdAt))
    .limit(200);
  return rows.map((x) => ({
    _id: x.r.id,
    requestNumber: x.r.requestNumber,
    employeeId: x.r.employeeId,
    employeeName: x.employeeName,
    leaveTypeId: x.r.leaveTypeId,
    leaveTypeName: x.leaveTypeName,
    startDate: x.r.startDate,
    endDate: x.r.endDate,
    days: x.r.days,
    reason: x.r.reason,
    status: x.r.status,
    decidedAtIso: x.r.decidedAt?.toISOString() ?? null,
  }));
}

router.get(
  "/leave-requests",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.HR_READ);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json(await listLeaveRequests({ status }));
  }),
);

router.post(
  "/leave-requests",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.HR_READ);
    const canManage = await hasCapability(user.role, CAPABILITIES.HR_WRITE);
    const b = req.body as {
      employeeId?: string;
      leaveTypeId: string;
      startDate: string;
      endDate: string;
      reason?: string;
    };
    const own = await ownEmployeeId(user._id);
    const employeeId = b.employeeId ?? own;
    if (!employeeId) throw new AppError(400, "No employee record is linked to your login — pass employeeId");
    if (!canManage && employeeId !== own) throw new AppError(403, "You can only request leave for yourself");
    if (!DATE_RE.test(b.startDate ?? "") || !DATE_RE.test(b.endDate ?? "")) {
      throw new AppError(400, "Dates must be YYYY-MM-DD");
    }
    if (b.endDate < b.startDate) throw new AppError(400, "End date is before start date");
    const days = countWeekdays(b.startDate, b.endDate);
    if (days === 0) throw new AppError(400, "That range contains no working days");

    const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
    if (!emp) throw new AppError(404, "Employee not found");
    const type = await db.query.leaveTypes.findFirst({ where: eq(leaveTypes.id, b.leaveTypeId) });
    if (!type) throw new AppError(404, "Leave type not found");

    const overlap = await db
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.employeeId, employeeId),
          sql`${leaveRequests.status} in ('pending','approved')`,
          lte(leaveRequests.startDate, b.endDate),
          gte(leaveRequests.endDate, b.startDate),
        ),
      )
      .limit(1);
    if (overlap.length) throw new AppError(400, "Overlaps an existing pending or approved leave request");

    const requestNumber = await nextSequenceNumber("leave_request");
    const [row] = await db
      .insert(leaveRequests)
      .values({
        requestNumber,
        employeeId,
        leaveTypeId: b.leaveTypeId,
        startDate: b.startDate,
        endDate: b.endDate,
        days,
        reason: b.reason?.trim() || null,
        createdBy: user._id,
      })
      .returning();
    await recordAudit({ actorId: user._id, action: "create", entityType: "leave_request", entityId: row.id, changes: { requestNumber, days } });
    res.json({ _id: row.id, requestNumber, days });
  }),
);

async function decide(req: any, res: any, to: "approved" | "rejected" | "cancelled") {
  const user = await requireCapability(req, CAPABILITIES.HR_READ);
  const lr = await db.query.leaveRequests.findFirst({ where: eq(leaveRequests.id, req.params.id) });
  if (!lr) throw new AppError(404, "Leave request not found");
  if (to === "cancelled") {
    // Owner may cancel their own pending/approved request; HR managers may cancel any.
    const canManage = await hasCapability(user.role, CAPABILITIES.HR_WRITE);
    const own = await ownEmployeeId(user._id);
    if (!canManage && lr.employeeId !== own) throw new AppError(403, "Not allowed");
    if (lr.status !== "pending" && lr.status !== "approved") {
      throw new AppError(409, `Cannot cancel a request in status "${lr.status}"`);
    }
  } else {
    await requireCapability(req, CAPABILITIES.HR_WRITE);
    if (lr.status !== "pending") throw new AppError(409, `Request is already ${lr.status}`);
  }
  await db
    .update(leaveRequests)
    .set({ status: to, decidedBy: user._id, decidedAt: new Date() })
    .where(eq(leaveRequests.id, lr.id));
  await recordAudit({ actorId: user._id, action: "status_change", entityType: "leave_request", entityId: lr.id, changes: { status: to } });
  res.json(null);
}

router.post("/leave-requests/:id/approve", asyncHandler((req, res) => decide(req, res, "approved")));
router.post("/leave-requests/:id/reject", asyncHandler((req, res) => decide(req, res, "rejected")));
router.post("/leave-requests/:id/cancel", asyncHandler((req, res) => decide(req, res, "cancelled")));

router.get(
  "/employees/:id/leave-balance",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.HR_READ);
    const year = new Date().getUTCFullYear();
    const types = await db.select().from(leaveTypes).orderBy(leaveTypes.name);
    const used = await db
      .select({ leaveTypeId: leaveRequests.leaveTypeId, days: sql<number>`coalesce(sum(${leaveRequests.days}),0)::int` })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.employeeId, req.params.id),
          eq(leaveRequests.status, "approved"),
          gte(leaveRequests.startDate, `${year}-01-01`),
          lte(leaveRequests.startDate, `${year}-12-31`),
        ),
      )
      .groupBy(leaveRequests.leaveTypeId);
    const usedMap = new Map(used.map((u) => [u.leaveTypeId, Number(u.days)]));
    res.json(
      types.map((t) => ({
        leaveTypeId: t.id,
        leaveTypeName: t.name,
        allowed: t.daysPerYear,
        used: usedMap.get(t.id) ?? 0,
        remaining: t.daysPerYear - (usedMap.get(t.id) ?? 0),
      })),
    );
  }),
);

/** Who has approved leave covering a given day (default: today). */
router.get(
  "/leaves/on",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.HR_READ);
    const day = typeof req.query.date === "string" && DATE_RE.test(req.query.date) ? req.query.date : todayStr();
    const rows = await db
      .select({ r: leaveRequests, employeeName: employees.name, leaveTypeName: leaveTypes.name })
      .from(leaveRequests)
      .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(and(eq(leaveRequests.status, "approved"), lte(leaveRequests.startDate, day), gte(leaveRequests.endDate, day)));
    res.json(
      rows.map((x) => ({
        employeeId: x.r.employeeId,
        employeeName: x.employeeName,
        leaveTypeName: x.leaveTypeName,
        startDate: x.r.startDate,
        endDate: x.r.endDate,
      })),
    );
  }),
);

// ---- Attendance ---------------------------------------------------------------

async function attendanceTarget(req: any, user: { _id: string; role: any }) {
  const canManage = await hasCapability(user.role, CAPABILITIES.HR_WRITE);
  const own = await ownEmployeeId(user._id);
  const employeeId: string | null = (req.body as { employeeId?: string })?.employeeId ?? own;
  if (!employeeId) throw new AppError(400, "No employee record is linked to your login — pass employeeId");
  if (!canManage && employeeId !== own) throw new AppError(403, "You can only record your own attendance");
  return employeeId;
}

router.post(
  "/attendance/check-in",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.HR_READ);
    const employeeId = await attendanceTarget(req, user);
    const open = await db.query.attendance.findFirst({
      where: and(eq(attendance.employeeId, employeeId), sql`${attendance.checkOut} is null`),
    });
    if (open) throw new AppError(409, "Already checked in — check out first");
    await db.insert(attendance).values({ employeeId });
    res.json(null);
  }),
);

router.post(
  "/attendance/check-out",
  asyncHandler(async (req, res) => {
    const user = await requireCapability(req, CAPABILITIES.HR_READ);
    const employeeId = await attendanceTarget(req, user);
    const open = await db.query.attendance.findFirst({
      where: and(eq(attendance.employeeId, employeeId), sql`${attendance.checkOut} is null`),
    });
    if (!open) throw new AppError(409, "Not checked in");
    await db.update(attendance).set({ checkOut: new Date() }).where(eq(attendance.id, open.id));
    res.json(null);
  }),
);

/** Attendance rows for a day (default today), newest first. */
router.get(
  "/attendance",
  asyncHandler(async (req, res) => {
    await requireCapability(req, CAPABILITIES.HR_READ);
    const day = typeof req.query.date === "string" && DATE_RE.test(req.query.date) ? req.query.date : todayStr();
    const rows = await db
      .select({ a: attendance, employeeName: employees.name })
      .from(attendance)
      .innerJoin(employees, eq(employees.id, attendance.employeeId))
      .where(
        and(
          gte(attendance.checkIn, new Date(`${day}T00:00:00.000Z`)),
          lte(attendance.checkIn, new Date(`${day}T23:59:59.999Z`)),
        ),
      )
      .orderBy(desc(attendance.checkIn));
    res.json(
      rows.map((x) => ({
        _id: x.a.id,
        employeeId: x.a.employeeId,
        employeeName: x.employeeName,
        checkInIso: x.a.checkIn.toISOString(),
        checkOutIso: x.a.checkOut?.toISOString() ?? null,
      })),
    );
  }),
);

export default router;
