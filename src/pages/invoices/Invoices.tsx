import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, MoreHorizontal, Plus } from "lucide-react";
import { useApiClient } from "@/lib/api-client.ts";
import type { InvoiceLineItem, InvoiceStatus, InvoiceWithParty } from "@/lib/types.ts";
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
import InvoiceDialog from "./_components/invoice-dialog.tsx";
import { downloadInvoicePdf } from "./_lib/generate-invoice-pdf.tsx";

const STATUSES: Array<{ id: InvoiceStatus; label: string }> = [
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "paid", label: "Paid" },
  { id: "overdue", label: "Overdue" },
];

const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label])) as Record<
  InvoiceStatus,
  string
>;

const statusVariant: Record<InvoiceStatus, "secondary" | "default" | "destructive"> = {
  draft: "secondary",
  sent: "default",
  paid: "secondary",
  overdue: "destructive",
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const INVOICE_COLUMNS = [
  { id: "billedTo", label: "Billed to" },
  { id: "due", label: "Due" },
  { id: "total", label: "Total" },
  { id: "status", label: "Status" },
] as const;
type InvoiceColumn = (typeof INVOICE_COLUMNS)[number]["id"];

export default function Invoices() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { data: invoices } = useQuery<InvoiceWithParty[]>({
    queryKey: ["invoices"],
    queryFn: () => api.get("/invoices"),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["invoices"] });
  const deleteInvoice = useMutation({
    mutationFn: (invoiceId: string) => api.del(`/invoices/${invoiceId}`),
    onSuccess: invalidate,
  });
  const updateInvoiceStatus = useMutation({
    mutationFn: ({ invoiceId, status }: { invoiceId: string; status: InvoiceStatus }) =>
      api.patch(`/invoices/${invoiceId}/status`, { status }),
    onSuccess: invalidate,
  });

  const [view, setView] = useState<ViewMode>("list");
  const { isVisible: isColumnVisible, toggle: toggleColumn } = useColumnVisibility<InvoiceColumn>(
    "invoices-list-columns",
    INVOICE_COLUMNS.map((c) => c.id),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | undefined>();
  const [editingLineItems, setEditingLineItems] = useState<Array<InvoiceLineItem> | undefined>();
  const [deletingInvoice, setDeletingInvoice] = useState<InvoiceWithParty | undefined>();
  const [downloadingId, setDownloadingId] = useState<string | undefined>();

  const openCreate = () => {
    setEditingInvoiceId(undefined);
    setEditingLineItems(undefined);
    setDialogOpen(true);
  };

  const openEdit = async (invoiceId: string) => {
    const detail = await api.get(`/invoices/${invoiceId}`);
    if (!detail) return;
    setEditingInvoiceId(invoiceId);
    setEditingLineItems(detail.lineItems);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingInvoice) return;
    try {
      await deleteInvoice.mutateAsync(deletingInvoice._id);
      toast.success("Invoice deleted");
    } catch {
      toast.error("Failed to delete invoice");
    } finally {
      setDeletingInvoice(undefined);
    }
  };

  const handleStatusChange = async (invoiceId: string, status: InvoiceStatus) => {
    try {
      await updateInvoiceStatus.mutateAsync({ invoiceId, status });
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDownload = async (invoiceId: string) => {
    setDownloadingId(invoiceId);
    try {
      const detail = await api.get(`/invoices/${invoiceId}`);
      if (!detail) return;
      downloadInvoicePdf(detail.invoice, detail.lineItems);
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setDownloadingId(undefined);
    }
  };

  const editingInvoice = invoices?.find((invoice) => invoice._id === editingInvoiceId);

  const invoiceActionsMenu = (invoice: InvoiceWithParty) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openEdit(invoice._id)}>Edit</DropdownMenuItem>
        <DropdownMenuItem
          disabled={downloadingId === invoice._id}
          onClick={() => handleDownload(invoice._id)}
        >
          <Download className="size-3.5" />
          Download PDF
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Mark as</DropdownMenuLabel>
        {STATUSES.filter((s) => s.id !== invoice.status).map((s) => (
          <DropdownMenuItem key={s.id} onClick={() => handleStatusChange(invoice._id, s.id)}>
            {s.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => setDeletingInvoice(invoice)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (invoices === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="size-5" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Create, send, and track invoices and payments.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus />
          New invoice
        </Button>
      </div>

      {invoices.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>No invoices yet</EmptyTitle>
            <EmptyDescription>
              Create your first invoice from your products and services.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openCreate}>
              Create invoice
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <ViewSwitcher value={view} onChange={setView} />
            {view === "list" && (
              <ColumnVisibilityMenu
                columns={INVOICE_COLUMNS}
                isVisible={isColumnVisible}
                toggle={toggleColumn}
              />
            )}
          </div>

          {view === "list" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  {isColumnVisible("billedTo") && <TableHead>Billed to</TableHead>}
                  {isColumnVisible("due") && <TableHead>Due</TableHead>}
                  {isColumnVisible("total") && <TableHead>Total</TableHead>}
                  {isColumnVisible("status") && <TableHead>Status</TableHead>}
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow
                    key={invoice._id}
                    className="cursor-pointer"
                    onClick={() => openEdit(invoice._id)}
                  >
                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                    {isColumnVisible("billedTo") && (
                      <TableCell className="text-muted-foreground">
                        {invoice.companyName ?? invoice.contactName ?? "—"}
                      </TableCell>
                    )}
                    {isColumnVisible("due") && (
                      <TableCell className="text-muted-foreground">
                        {new Date(invoice.dueDateIso).toLocaleDateString()}
                      </TableCell>
                    )}
                    {isColumnVisible("total") && (
                      <TableCell>{currency.format(invoice.total)}</TableCell>
                    )}
                    {isColumnVisible("status") && (
                      <TableCell>
                        <Badge variant={statusVariant[invoice.status]}>
                          {STATUS_LABEL[invoice.status]}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {invoiceActionsMenu(invoice)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="grid gap-4 overflow-x-auto md:grid-cols-4">
              {STATUSES.map((status) => {
                const statusInvoices = invoices.filter((i) => i.status === status.id);
                const statusTotal = statusInvoices.reduce((sum, i) => sum + i.total, 0);

                return (
                  <div
                    key={status.id}
                    className="min-w-[220px] space-y-3"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const invoiceId = e.dataTransfer.getData("text/plain");
                      const invoice = invoices.find((i) => i._id === invoiceId);
                      if (!invoice || invoice.status === status.id) return;
                      handleStatusChange(invoiceId, status.id);
                    }}
                  >
                    <div className="flex items-center justify-between px-1">
                      <span className="text-sm font-medium">{status.label}</span>
                      <Badge variant="secondary">{statusInvoices.length}</Badge>
                    </div>
                    <p className="px-1 text-xs text-muted-foreground">
                      {currency.format(statusTotal)}
                    </p>
                    <div className="space-y-2">
                      {statusInvoices.map((invoice) => (
                        <Card
                          key={invoice._id}
                          className="cursor-grab py-3 active:cursor-grabbing"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", invoice._id)}
                          onClick={() => openEdit(invoice._id)}
                        >
                          <CardHeader className="px-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium leading-tight">
                                {invoice.invoiceNumber}
                              </p>
                              <div onClick={(e) => e.stopPropagation()}>
                                {invoiceActionsMenu(invoice)}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="px-3 text-xs text-muted-foreground">
                            <p className="font-medium text-foreground">
                              {currency.format(invoice.total)}
                            </p>
                            {invoice.companyName && <p>{invoice.companyName}</p>}
                            {invoice.contactName && <p>{invoice.contactName}</p>}
                            <p>Due {new Date(invoice.dueDateIso).toLocaleDateString()}</p>
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

      <InvoiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        invoice={editingInvoice}
        lineItems={editingLineItems}
      />

      <AlertDialog
        open={!!deletingInvoice}
        onOpenChange={(open) => !open && setDeletingInvoice(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deletingInvoice?.invoiceNumber}.
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
