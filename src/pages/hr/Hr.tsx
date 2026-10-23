import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarPlus, LogIn, LogOut, Plus, UserPlus } from "lucide-react";
import { ApiError, useApiClient } from "@/lib/api-client.ts";
import { useCurrentUser } from "@/hooks/use-current-user.ts";
import type { AttendanceRow, Department, Employee, LeaveRequest, LeaveType } from "@/lib/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";

const NONE = "__none__";
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

const leaveBadge: Record<LeaveRequest["status"], "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  approved: "default",
  rejected: "destructive",
  cancelled: "secondary",
};

export default function Hr() {
  const api = useApiClient();
  const qc = useQueryClient();
  const { isAdmin } = useCurrentUser();

  const { data: employees } = useQuery<Employee[]>({ queryKey: ["employees"], queryFn: () => api.get("/employees") });
  const { data: me } = useQuery<Employee | null>({ queryKey: ["employee-me"], queryFn: () => api.get("/employees/me") });
  const { data: departments } = useQuery<Department[]>({ queryKey: ["departments"], queryFn: () => api.get("/departments") });
  const { data: leaveTypes } = useQuery<LeaveType[]>({ queryKey: ["leave-types"], queryFn: () => api.get("/leave-types") });
  const { data: leaves } = useQuery<LeaveRequest[]>({ queryKey: ["leave-requests"], queryFn: () => api.get("/leave-requests") });
  const { data: attendance } = useQuery<AttendanceRow[]>({ queryKey: ["attendance"], queryFn: () => api.get("/attendance") });

  const refresh = (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  // ---- Employee dialog
  const [empOpen, setEmpOpen] = useState(false);
  const [empName, setEmpName] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empTitle, setEmpTitle] = useState("");
  const [empDept, setEmpDept] = useState(NONE);
  const [empManager, setEmpManager] = useState(NONE);
  const [empHire, setEmpHire] = useState("");
  const createEmp = useMutation({
    mutationFn: () =>
      api.post("/employees", {
        name: empName,
        email: empEmail,
        jobTitle: empTitle,
        departmentId: empDept === NONE ? null : empDept,
        managerId: empManager === NONE ? null : empManager,
        hireDate: empHire || null,
      }),
    onSuccess: (r: { employeeNumber: string }) => {
      toast.success(`Employee ${r.employeeNumber} added`);
      setEmpOpen(false);
      setEmpName("");
      setEmpEmail("");
      setEmpTitle("");
      setEmpDept(NONE);
      setEmpManager(NONE);
      setEmpHire("");
      refresh("employees");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  // ---- Department dialog
  const [deptOpen, setDeptOpen] = useState(false);
  const [deptName, setDeptName] = useState("");
  const createDept = useMutation({
    mutationFn: () => api.post("/departments", { name: deptName }),
    onSuccess: () => {
      toast.success("Department added");
      setDeptOpen(false);
      setDeptName("");
      refresh("departments");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  // ---- Leave dialog
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveEmp, setLeaveEmp] = useState("");
  const [leaveType, setLeaveType] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const requestLeave = useMutation({
    mutationFn: () =>
      api.post("/leave-requests", {
        employeeId: isAdmin ? leaveEmp || undefined : undefined,
        leaveTypeId: leaveType,
        startDate: start,
        endDate: end || start,
        reason,
      }),
    onSuccess: (r: { requestNumber: string; days: number }) => {
      toast.success(`${r.requestNumber} created (${r.days} working day${r.days === 1 ? "" : "s"})`);
      setLeaveOpen(false);
      setStart("");
      setEnd("");
      setReason("");
      refresh("leave-requests");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const leaveAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" | "cancel" }) =>
      api.post(`/leave-requests/${id}/${action}`),
    onSuccess: () => refresh("leave-requests"),
    onError: (e) => toast.error(errMsg(e)),
  });

  const clock = useMutation({
    mutationFn: (kind: "check-in" | "check-out") => api.post(`/attendance/${kind}`, {}),
    onSuccess: () => {
      toast.success("Recorded");
      refresh("attendance");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">HR</h1>
          <p className="text-sm text-muted-foreground">Employees, leave and attendance.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!me || clock.isPending} onClick={() => clock.mutate("check-in")}>
            <LogIn className="mr-1 h-4 w-4" /> Check in
          </Button>
          <Button variant="outline" disabled={!me || clock.isPending} onClick={() => clock.mutate("check-out")}>
            <LogOut className="mr-1 h-4 w-4" /> Check out
          </Button>
          <Button onClick={() => setLeaveOpen(true)} disabled={!me && !isAdmin}>
            <CalendarPlus className="mr-1 h-4 w-4" /> Request leave
          </Button>
        </div>
      </div>
      {!me && (
        <p className="text-sm text-muted-foreground">
          Your login isn't linked to an employee record yet, so check-in and leave are limited to admins acting on behalf
          of someone.
        </p>
      )}

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="attendance">Attendance (today)</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-3">
          {isAdmin && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setEmpOpen(true)}>
                <UserPlus className="mr-1 h-4 w-4" /> New employee
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDeptOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> New department
              </Button>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(employees ?? []).map((e) => (
                <TableRow key={e._id}>
                  <TableCell>{e.employeeNumber}</TableCell>
                  <TableCell>
                    <div className="font-medium">{e.name}</div>
                    <div className="text-xs text-muted-foreground">{e.email}</div>
                  </TableCell>
                  <TableCell>{e.jobTitle}</TableCell>
                  <TableCell>{e.departmentName}</TableCell>
                  <TableCell>{e.managerName}</TableCell>
                  <TableCell>
                    <Badge variant={e.status === "active" ? "default" : "secondary"}>{e.status.replace("_", " ")}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {employees?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No employees yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="leave">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(leaves ?? []).map((l) => (
                <TableRow key={l._id}>
                  <TableCell>{l.requestNumber}</TableCell>
                  <TableCell>{l.employeeName}</TableCell>
                  <TableCell>{l.leaveTypeName}</TableCell>
                  <TableCell>
                    {l.startDate}
                    {l.endDate !== l.startDate ? ` → ${l.endDate}` : ""}
                  </TableCell>
                  <TableCell className="text-right">{l.days}</TableCell>
                  <TableCell>
                    <Badge variant={leaveBadge[l.status]}>{l.status}</Badge>
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    {isAdmin && l.status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => leaveAction.mutate({ id: l._id, action: "approve" })}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => leaveAction.mutate({ id: l._id, action: "reject" })}>
                          Reject
                        </Button>
                      </>
                    )}
                    {(l.status === "pending" || l.status === "approved") && (isAdmin || l.employeeId === me?._id) && (
                      <Button size="sm" variant="ghost" onClick={() => leaveAction.mutate({ id: l._id, action: "cancel" })}>
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {leaves?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No leave requests.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="attendance">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(attendance ?? []).map((a) => (
                <TableRow key={a._id}>
                  <TableCell>{a.employeeName}</TableCell>
                  <TableCell>{format(new Date(a.checkInIso), "HH:mm")}</TableCell>
                  <TableCell>{a.checkOutIso ? format(new Date(a.checkOutIso), "HH:mm") : "—"}</TableCell>
                </TableRow>
              ))}
              {attendance?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Nobody has checked in today.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      <Dialog open={empOpen} onOpenChange={setEmpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={empName} onChange={(e) => setEmpName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={empEmail} onChange={(e) => setEmpEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Job title</Label>
              <Input value={empTitle} onChange={(e) => setEmpTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Department</Label>
                <Select value={empDept} onValueChange={setEmpDept}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {(departments ?? []).map((d) => (
                      <SelectItem key={d._id} value={d._id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Manager</Label>
                <Select value={empManager} onValueChange={setEmpManager}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {(employees ?? []).map((e) => (
                      <SelectItem key={e._id} value={e._id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Hire date</Label>
              <Input type="date" value={empHire} onChange={(e) => setEmpHire(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!empName.trim() || createEmp.isPending} onClick={() => createEmp.mutate()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deptOpen} onOpenChange={setDeptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New department</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={deptName} onChange={(e) => setDeptName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button disabled={!deptName.trim() || createDept.isPending} onClick={() => createDept.mutate()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request leave</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {isAdmin && (
              <div className="space-y-1">
                <Label>Employee {me ? "(blank = me)" : ""}</Label>
                <Select value={leaveEmp} onValueChange={setLeaveEmp}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {(employees ?? []).map((e) => (
                      <SelectItem key={e._id} value={e._id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Leave type</Label>
              <Select value={leaveType} onValueChange={setLeaveType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {(leaveTypes ?? []).map((t) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>From</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>To</Label>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Reason (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!leaveType || !start || requestLeave.isPending} onClick={() => requestLeave.mutate()}>
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
