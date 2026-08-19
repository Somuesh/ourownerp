import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Download,
  FileText,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { useApiClient } from "@/lib/api-client.ts";
import type { InvoiceLineItem, InvoiceStatus, InvoiceWithParty } from "@/lib/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
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
import InvoiceDialog from "./_components/invoice-dialog.tsx";
import { downloadInvoicePdf } from "./_lib/generate-invoice-pdf.tsx";

const STATUSES: Array<{ id: InvoiceStatus; label: string }> = [
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "paid", label: "Paid" },
  { id: "overdue", label: "Overdue" },
];

const statusVariant: Record<InvoiceStatus, "secondary" | "default" | "destructive"> = {
  draft: "secondary",
  sent: "default",
  paid: "secondary",
  overdue: "destructive",
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

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
          <h1 className="font-serif text-2xl font-semibold tracking-tight">
            Invoices
          </h1>
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Billed to</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice._id}>
                <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                <TableCell className="text-muted-foreground">
                  {invoice.companyName ?? invoice.contactName ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(invoice.dueDateIso).toLocaleDateString()}
                </TableCell>
                <TableCell>{currency.format(invoice.total)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[invoice.status]}>
                    {STATUSES.find((s) => s.id === invoice.status)?.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(invoice._id)}>
                        Edit
                      </DropdownMenuItem>
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
                        <DropdownMenuItem
                          key={s.id}
                          onClick={() => handleStatusChange(invoice._id, s.id)}
                        >
                          {s.label}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeletingInvoice(invoice)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
