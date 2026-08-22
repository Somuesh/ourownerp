import { Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  LayoutDashboard,
  Handshake,
  Boxes,
  FileWarning,
  DollarSign,
  ArrowRight,
} from "lucide-react";
import { useApiClient } from "@/lib/api-client.ts";
import type { DashboardOverview } from "@/lib/types.ts";
import { useCurrentUser } from "@/hooks/use-current-user.ts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

// Cycles through the theme's chart color variables regardless of how many
// stages exist — stage names/colors are no longer fixed now that Deals
// stages are user-defined (see server/routes/dealStages.ts).
const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

const statusVariant: Record<InvoiceStatus, "secondary" | "default" | "destructive"> = {
  draft: "secondary",
  sent: "default",
  paid: "secondary",
  overdue: "destructive",
};

export default function Dashboard() {
  const { user, isClient } = useCurrentUser();
  const api = useApiClient();
  const { data: overview } = useQuery<DashboardOverview>({
    queryKey: ["dashboard", "overview"],
    queryFn: () => api.get("/dashboard/overview"),
    enabled: !isClient,
  });
  const navigate = useNavigate();

  if (isClient) {
    return <Navigate to="/portal" replace />;
  }

  if (overview === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    );
  }

  const stageData = overview.dealsByStage.map((stage) => ({
    stage: stage.stageId,
    label: stage.stageName,
    count: stage.count,
  }));

  const invoiceStatusData = (Object.keys(overview.invoicesByStatus) as Array<InvoiceStatus>)
    .map((status) => ({
      status,
      label: status.charAt(0).toUpperCase() + status.slice(1),
      count: overview.invoicesByStatus[status],
    }))
    .filter((d) => d.count > 0);

  const statCards = [
    {
      title: "Open deals",
      value: overview.openDealsCount.toString(),
      hint: `${currency.format(overview.openDealsValue)} in the pipeline`,
      icon: Handshake,
    },
    {
      title: "Products in stock",
      value: overview.totalProductsCount.toString(),
      hint:
        overview.lowStockCount > 0
          ? `${overview.lowStockCount} low on stock`
          : "All products well stocked",
      icon: Boxes,
    },
    {
      title: "Outstanding invoices",
      value: overview.outstandingInvoicesCount.toString(),
      hint: `${currency.format(overview.outstandingInvoicesValue)} awaiting payment`,
      icon: FileWarning,
    },
    {
      title: "Revenue this month",
      value: currency.format(overview.revenueThisMonth),
      hint: "From paid invoices",
      icon: DollarSign,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <LayoutDashboard className="size-5" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">
            Welcome back{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here's an overview of your business.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardDescription>{stat.title}</CardDescription>
                <stat.icon className="size-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Deals by stage</CardTitle>
            <CardDescription>Pipeline distribution across all deals.</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.recentDeals.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No deals yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stageData}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    stroke="var(--muted-foreground)"
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    stroke="var(--muted-foreground)"
                    width={28}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      borderColor: "var(--border)",
                      borderRadius: "var(--radius)",
                      color: "var(--popover-foreground)",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {stageData.map((entry, index) => (
                      <Cell key={entry.stage} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoice status</CardTitle>
            <CardDescription>Breakdown of all invoices by status.</CardDescription>
          </CardHeader>
          <CardContent>
            {invoiceStatusData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No invoices yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={invoiceStatusData}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {invoiceStatusData.map((entry, index) => (
                      <Cell
                        key={entry.status}
                        fill={`var(--chart-${(index % 5) + 1})`}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      borderColor: "var(--border)",
                      borderRadius: "var(--radius)",
                      color: "var(--popover-foreground)",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent invoices</CardTitle>
              <CardDescription>Your latest billing activity.</CardDescription>
            </div>
            <Button variant="secondary" size="sm" onClick={() => navigate("/invoices")}>
              View all
              <ArrowRight className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {overview.recentInvoices.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No invoices yet.
              </p>
            ) : (
              overview.recentInvoices.map((invoice) => (
                <div
                  key={invoice._id}
                  className="flex items-center justify-between rounded-md px-2 py-2.5 hover:bg-accent/50"
                >
                  <div>
                    <p className="text-sm font-medium">{invoice.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {invoice.partyName ?? "No contact"} · Due{" "}
                      {new Date(invoice.dueDateIso).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {currency.format(invoice.total)}
                    </span>
                    <Badge variant={statusVariant[invoice.status]}>
                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent deals</CardTitle>
              <CardDescription>Your latest pipeline activity.</CardDescription>
            </div>
            <Button variant="secondary" size="sm" onClick={() => navigate("/crm/deals")}>
              View all
              <ArrowRight className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {overview.recentDeals.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No deals yet.
              </p>
            ) : (
              overview.recentDeals.map((deal) => (
                <div
                  key={deal._id}
                  className="flex items-center justify-between rounded-md px-2 py-2.5 hover:bg-accent/50"
                >
                  <div>
                    <p className="text-sm font-medium">{deal.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {deal.partyName ?? "No contact"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{currency.format(deal.value)}</span>
                    <Badge variant="secondary">{deal.stageName}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
