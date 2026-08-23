import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, MoreHorizontal, Plus, Receipt } from "lucide-react";
import { useApiClient, ApiError } from "@/lib/api-client.ts";
import type { VendorBillLineItem, VendorBillStatus, VendorBillWithVendor } from "@/lib/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { ViewSwitcher, type ViewMode } from "@/components/ui/view-switcher.tsx";
import { ColumnVisibilityMenu } from "@/components/ui/column-visibility-menu.tsx";
import { useColumnVisibility } from "@/hooks/use-column-visibility.ts";
import VendorBillDialog from "./_components/vendor-bill-dialog.tsx";
import { downloadVendorBillPdf } from "./_lib/generate-vendor-bill-pdf.tsx";

const STATUSES: Array<{ id: VendorBillStatus; label: string }> = [
  { id: "draft", label: "Draft" },
  { id: "open", label: "Open" },
  { id: "paid", label: "Paid" },
  { id: "overdue", label: "Overdue" },
];

const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label])) as Record<
  VendorBillStatus,
  string
>;

const statusVariant: Record<VendorBillStatus, "secondary" | "default" | "destructive"> = {
  draft: "secondary",
  open: "default",
  paid: "secondary",
  overdue: "destructive",
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const BILL_COLUMNS = [
  { id: "vendor", label: "Vendor" },
  { id: "due", label: "Due" },
  { id: "total", label: "Total" },
  { id: "status", label: "Status" },
] as const;
type BillColumn = (typeof BILL_COLUMNS)[number]["id"];

export default function VendorBills() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { data: bills } = useQuery<VendorBillWithVendor[]>({
    queryKey: ["vendor-bills"],
    queryFn: () => api.get("/vendor-bills"),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["vendor-bills"] });
  const deleteBill = useMutation({
    mutationFn: (billId: string) => api.del(`/vendor-bills/${billId}`),
    onSuccess: invalidate,
  });
  const updateBillStatus = useMutation({
    mutationFn: ({ billId, status }: { billId: string; status: VendorBillStatus }) =>
      api.patch(`/vendor-bills/${billId}/status`, { status }),
    onSuccess: invalidate,
  });

  const [view, setView] = useState<ViewMode>("list");
  const { isVisible: isColumnVisible, toggle: toggleColumn } = useColumnVisibility<BillColumn>(
    "vendor-bills-list-columns",
    BILL_COLUMNS.map((c) => c.id),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | undefined>();
  const [editingLineItems, setEditingLineItems] = useState<Array<VendorBillLineItem> | undefined>();
  const [deletingBill, setDeletingBill] = useState<VendorBillWithVendor | undefined>();
  const [downloadingId, setDownloadingId] = useState<string | undefined>();

  const openCreate = () => {
    setEditingBillId(undefined);
    setEditingLineItems(undefined);
    setDialogOpen(true);
  };

  const openEdit = async (billId: string) => {
    const detail = await api.get(`/vendor-bills/${billId}`);
    if (!detail) return;
    setEditingBillId(billId);
    setEditingLineItems(detail.lineItems);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingBill) return;
    try {
      await deleteBill.mutateAsync(deletingBill._id);
      toast.success("Vendor bill deleted");
    } catch {
      toast.error("Failed to delete vendor bill");
    } finally {
      setDeletingBill(undefined);
    }
  };

  const handleStatusChange = async (billId: string, status: VendorBillStatus) => {
    try {
      await updateBillStatus.mutateAsync({ billId, status });
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDownload = async (billId: string) => {
    setDownloadingId(billId);
    try {
      const detail = await api.get(`/vendor-bills/${billId}`);
      if (!detail) return;
      downloadVendorBillPdf(detail.bill, detail.lineItems);
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setDownloadingId(undefined);
    }
  };

  const editingBill = bills?.find((bill) => bill._id === editingBillId);

  const billActionsMenu = (bill: VendorBillWithVendor) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openEdit(bill._id)}>Edit</DropdownMenuItem>
        <DropdownMenuItem
          disabled={downloadingId === bill._id}
          onClick={() => handleDownload(bill._id)}
        >
          <Download className="size-3.5" />
          Download PDF
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Mark as</DropdownMenuLabel>
        {STATUSES.filter((s) => s.id !== bill.status).map((s) => (
          <DropdownMenuItem key={s.id} onClick={() => handleStatusChange(bill._id, s.id)}>
            {s.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => setDeletingBill(bill)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (bills === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus />
          New vendor bill
        </Button>
      </div>

      {bills.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Receipt />
            </EmptyMedia>
            <EmptyTitle>No vendor bills yet</EmptyTitle>
            <EmptyDescription>
              Bills usually get created automatically when you receive a purchase order,
              or add one directly here.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openCreate}>
              New vendor bill
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <ViewSwitcher value={view} onChange={setView} />
            {view === "list" && (
              <ColumnVisibilityMenu
                columns={BILL_COLUMNS}
                isVisible={isColumnVisible}
                toggle={toggleColumn}
              />
            )}
          </div>

          {view === "list" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill</TableHead>
                  {isColumnVisible("vendor") && <TableHead>Vendor</TableHead>}
                  {isColumnVisible("due") && <TableHead>Due</TableHead>}
                  {isColumnVisible("total") && <TableHead>Total</TableHead>}
                  {isColumnVisible("status") && <TableHead>Status</TableHead>}
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map((bill) => (
                  <TableRow
                    key={bill._id}
                    className="cursor-pointer"
                    onClick={() => openEdit(bill._id)}
                  >
                    <TableCell className="font-medium">{bill.billNumber}</TableCell>
                    {isColumnVisible("vendor") && (
                      <TableCell className="text-muted-foreground">
                        {bill.vendorCompanyName ?? bill.vendorContactName ?? "—"}
                      </TableCell>
                    )}
                    {isColumnVisible("due") && (
                      <TableCell className="text-muted-foreground">
                        {new Date(bill.dueDateIso).toLocaleDateString()}
                      </TableCell>
                    )}
                    {isColumnVisible("total") && (
                      <TableCell>{currency.format(bill.total)}</TableCell>
                    )}
                    {isColumnVisible("status") && (
                      <TableCell>
                        <Badge variant={statusVariant[bill.status]}>
                          {STATUS_LABEL[bill.status]}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {billActionsMenu(bill)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="grid gap-4 overflow-x-auto md:grid-cols-4">
              {STATUSES.map((status) => {
                const statusBills = bills.filter((b) => b.status === status.id);
                const statusTotal = statusBills.reduce((sum, b) => sum + b.total, 0);

                return (
                  <div
                    key={status.id}
                    className="min-w-[220px] space-y-3"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const billId = e.dataTransfer.getData("text/plain");
                      const bill = bills.find((b) => b._id === billId);
                      if (!bill || bill.status === status.id) return;
                      handleStatusChange(billId, status.id);
                    }}
                  >
                    <div className="flex items-center justify-between px-1">
                      <span className="text-sm font-medium">{status.label}</span>
                      <Badge variant="secondary">{statusBills.length}</Badge>
                    </div>
                    <p className="px-1 text-xs text-muted-foreground">
                      {currency.format(statusTotal)}
                    </p>
                    <div className="space-y-2">
                      {statusBills.map((bill) => (
                        <Card
                          key={bill._id}
                          className="cursor-grab py-3 active:cursor-grabbing"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", bill._id)}
                          onClick={() => openEdit(bill._id)}
                        >
                          <CardHeader className="px-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium leading-tight">
                                {bill.billNumber}
                              </p>
                              <div onClick={(e) => e.stopPropagation()}>
                                {billActionsMenu(bill)}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="px-3 text-xs text-muted-foreground">
                            <p className="font-medium text-foreground">
                              {currency.format(bill.total)}
                            </p>
                            {bill.vendorCompanyName && <p>{bill.vendorCompanyName}</p>}
                            {bill.vendorContactName && <p>{bill.vendorContactName}</p>}
                            <p>Due {new Date(bill.dueDateIso).toLocaleDateString()}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <VendorBillDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        bill={editingBill}
        lineItems={editingLineItems}
      />

      <AlertDialog
        open={!!deletingBill}
        onOpenChange={(open) => !open && setDeletingBill(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vendor bill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deletingBill?.billNumber}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
