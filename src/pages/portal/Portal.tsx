import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FileText, Building2, Mail, Phone, Download } from "lucide-react";
import { toast } from "sonner";
import { useApiClient } from "@/lib/api-client.ts";
import type { Company, Contact, InvoiceWithParty } from "@/lib/types.ts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
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
import { Button } from "@/components/ui/button.tsx";
import { downloadInvoicePdf } from "../invoices/_lib/generate-invoice-pdf.tsx";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

const statusVariant: Record<InvoiceStatus, "secondary" | "default" | "destructive"> = {
  draft: "secondary",
  sent: "default",
  paid: "secondary",
  overdue: "destructive",
};

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export default function Portal() {
  const api = useApiClient();
  const navigate = useNavigate();
  const { data: profile } = useQuery<{ contact: Contact; company: Company | null } | null>({
    queryKey: ["portal", "me"],
    queryFn: () => api.get("/portal/me"),
  });
  const { data: invoices } = useQuery<InvoiceWithParty[]>({
    queryKey: ["portal", "invoices"],
    queryFn: () => api.get("/portal/invoices"),
  });
  const [downloadingId, setDownloadingId] = useState<string | undefined>();

  const handleDownload = async (invoiceId: string) => {
    setDownloadingId(invoiceId);
    try {
      const detail = await api.get(`/portal/invoices/${invoiceId}`);
      if (!detail) return;
      downloadInvoicePdf(detail.invoice, detail.lineItems);
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setDownloadingId(undefined);
    }
  };

  if (profile === undefined || invoices === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (profile === null) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2 />
          </EmptyMedia>
          <EmptyTitle>Your account isn't linked yet</EmptyTitle>
          <EmptyDescription>
            Ask your account manager to link your portal login to your contact
            record so you can see your invoices here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
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
            My portal
          </h1>
          <p className="text-sm text-muted-foreground">
            View your account details and invoices.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{profile.contact.name}</CardTitle>
          <CardDescription>
            {profile.company ? profile.company.name : "No company on file"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6 text-sm">
          {profile.contact.email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="size-4" />
              {profile.contact.email}
            </div>
          )}
          {profile.contact.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-4" />
              {profile.contact.phone}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Invoices billed to you or your company.</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>No invoices yet</EmptyTitle>
                <EmptyDescription>
                  You don't have any invoices right now.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow
                    key={invoice._id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/portal/invoices/${invoice._id}`)}
                  >
                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(invoice.dueDateIso).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{currency.format(invoice.total)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[invoice.status]}>
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={downloadingId === invoice._id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(invoice._id);
                        }}
                      >
                        <Download className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
