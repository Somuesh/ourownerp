import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download } from "lucide-react";
import { useApiClient } from "@/lib/api-client.ts";
import type { InvoiceLineItem, InvoiceWithParty } from "@/lib/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { FileText } from "lucide-react";
import { downloadInvoicePdf } from "../invoices/_lib/generate-invoice-pdf.tsx";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

const statusVariant: Record<InvoiceStatus, "secondary" | "default" | "destructive"> = {
  draft: "secondary",
  sent: "default",
  paid: "secondary",
  overdue: "destructive",
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function PortalInvoiceDetail() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const api = useApiClient();
  const { data: detail } = useQuery<{
    invoice: InvoiceWithParty;
    lineItems: InvoiceLineItem[];
  } | null>({
    queryKey: ["portal", "invoices", invoiceId],
    queryFn: () => api.get(`/portal/invoices/${invoiceId}`),
    enabled: !!invoiceId,
  });

  if (detail === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (detail === null) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>Invoice not found</EmptyTitle>
          <EmptyDescription>
            This invoice doesn't exist or isn't billed to you.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const { invoice, lineItems } = detail;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/portal")}>
          <ArrowLeft />
          Back to portal
        </Button>
        <Button onClick={() => downloadInvoicePdf(invoice, lineItems)}>
          <Download />
          Download PDF
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="font-serif text-2xl">{invoice.invoiceNumber}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Issued {new Date(invoice.issueDateIso).toLocaleDateString()} · Due{" "}
              {new Date(invoice.dueDateIso).toLocaleDateString()}
            </p>
          </div>
          <Badge variant={statusVariant[invoice.status]}>
            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item) => (
                <TableRow key={item._id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">
                    {currency.format(item.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right">
                    {currency.format(item.quantity * item.unitPrice)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-col items-end gap-1 text-sm">
            <div className="flex w-48 justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{currency.format(invoice.subtotal)}</span>
            </div>
            <div className="flex w-48 justify-between">
              <span className="text-muted-foreground">Tax ({invoice.taxRate}%)</span>
              <span>{currency.format(invoice.taxAmount)}</span>
            </div>
            <div className="flex w-48 justify-between font-semibold">
              <span>Total</span>
              <span>{currency.format(invoice.total)}</span>
            </div>
          </div>

          {invoice.notes && (
            <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium">Notes</p>
              <p className="text-muted-foreground">{invoice.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
