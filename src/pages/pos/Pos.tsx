import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { ApiError, useApiClient } from "@/lib/api-client.ts";
import type { PosSession, Product, Warehouse } from "@/lib/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

type Pay = "cash" | "card" | "upi";

export default function Pos() {
  const api = useApiClient();
  const qc = useQueryClient();

  const { data: session, isLoading } = useQuery<PosSession | null>({
    queryKey: ["pos-session"],
    queryFn: () => api.get("/pos/session"),
  });
  const { data: products } = useQuery<Product[]>({ queryKey: ["products"], queryFn: () => api.get("/products") });
  const { data: warehouses } = useQuery<Warehouse[]>({ queryKey: ["warehouses"], queryFn: () => api.get("/warehouses") });
  const { data: history } = useQuery<PosSession[]>({ queryKey: ["pos-sessions"], queryFn: () => api.get("/pos/sessions") });

  const refresh = () => {
    for (const k of ["pos-session", "pos-sessions", "products", "inventory-stock", "inventory-reorder"]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  };

  // ---- open session
  const [openingCash, setOpeningCash] = useState("0");
  const [whId, setWhId] = useState("");
  const openSession = useMutation({
    mutationFn: () => api.post("/pos/sessions/open", { openingCash: Number(openingCash), warehouseId: whId || undefined }),
    onSuccess: () => {
      toast.success("Session opened");
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  // ---- cart
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [taxRate, setTaxRate] = useState("0");
  const filtered = useMemo(
    () =>
      (products ?? []).filter(
        (p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()),
      ),
    [products, search],
  );
  const byId = useMemo(() => new Map((products ?? []).map((p) => [p._id, p])), [products]);
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ p: byId.get(id), qty }))
    .filter((l): l is { p: Product; qty: number } => !!l.p);
  const subtotal = lines.reduce((a, l) => a + l.p.price * l.qty, 0);
  const tax = subtotal * ((Number(taxRate) || 0) / 100);
  const total = subtotal + tax;

  const add = (p: Product, delta = 1) =>
    setCart((c) => {
      const next = (c[p._id] ?? 0) + delta;
      const copy = { ...c };
      if (next <= 0) delete copy[p._id];
      else copy[p._id] = next;
      return copy;
    });

  // ---- pay
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<Pay>("cash");
  const [tendered, setTendered] = useState("");
  const sale = useMutation({
    mutationFn: () =>
      api.post("/pos/orders", {
        lines: lines.map((l) => ({ productId: l.p._id, quantity: l.qty })),
        paymentMethod: method,
        amountTendered: method === "cash" ? Number(tendered || total) : undefined,
        taxRate: Number(taxRate) || 0,
      }),
    onSuccess: (r: { orderNumber: string; total: number; change: number }) => {
      toast.success(`${r.orderNumber} · ${money.format(r.total)}${r.change > 0 ? ` · change ${money.format(r.change)}` : ""}`);
      setCart({});
      setPayOpen(false);
      setTendered("");
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  // ---- close
  const [closeOpen, setCloseOpen] = useState(false);
  const [counted, setCounted] = useState("");
  const [closeResult, setCloseResult] = useState<{ expectedCash: number; difference: number } | null>(null);
  const closeSession = useMutation({
    mutationFn: () => api.post(`/pos/sessions/${session!._id}/close`, { closingCash: Number(counted) }),
    onSuccess: (r: { expectedCash: number; difference: number }) => {
      setCloseResult(r);
      setCart({});
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  if (!session) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Point of Sale</h1>
        <p className="text-sm text-muted-foreground">Open a session with the cash in the drawer to start selling.</p>
        <div className="space-y-1">
          <Label>Opening cash</Label>
          <Input type="number" min={0} value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
        </div>
        {(warehouses?.filter((w) => w.isActive).length ?? 0) > 1 && (
          <div className="space-y-1">
            <Label>Sell from warehouse</Label>
            <Select value={whId} onValueChange={setWhId}>
              <SelectTrigger>
                <SelectValue placeholder="Main warehouse (default)" />
              </SelectTrigger>
              <SelectContent>
                {warehouses!.filter((w) => w.isActive).map((w) => (
                  <SelectItem key={w._id} value={w._id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button onClick={() => openSession.mutate()} disabled={openSession.isPending}>
          Open session
        </Button>

        <h2 className="pt-4 text-lg font-medium">Past sessions</h2>
        <SessionTable rows={history ?? []} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">
            Point of Sale <Badge variant="secondary">{session.sessionNumber}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {session.totals.orderCount} sale{session.totals.orderCount === 1 ? "" : "s"} · {money.format(session.totals.total)} · opened{" "}
            {format(new Date(session.openedAtIso), "HH:mm")}
          </p>
        </div>
        <Button variant="outline" onClick={() => setCloseOpen(true)}>
          Close session
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search products or SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {filtered.map((p) => (
              <button
                key={p._id}
                onClick={() => add(p)}
                disabled={p.stockQuantity <= 0}
                className="rounded-lg border bg-card p-3 text-left transition hover:bg-accent disabled:opacity-50"
              >
                <div className="font-medium leading-tight">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.sku}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-semibold">{money.format(p.price)}</span>
                  <span className="text-xs text-muted-foreground">{p.stockQuantity} in stock</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 font-medium">
            <ShoppingCart className="h-4 w-4" /> Cart
          </div>
          {lines.length === 0 && <p className="text-sm text-muted-foreground">Tap a product to add it.</p>}
          {lines.map(({ p, qty }) => (
            <div key={p._id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{money.format(p.price)} each</div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="size-7" onClick={() => add(p, -1)}>
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center text-sm">{qty}</span>
                <Button size="icon" variant="outline" className="size-7" onClick={() => add(p, 1)} disabled={qty >= p.stockQuantity}>
                  <Plus className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" onClick={() => add(p, -qty)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
          <div className="space-y-1 border-t pt-3 text-sm">
            <div className="flex items-center justify-between">
              <span>Tax %</span>
              <Input className="h-7 w-20 text-right" type="number" min={0} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{money.format(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>
              <span>{money.format(tax)}</span>
            </div>
            <div className="flex justify-between text-lg font-semibold">
              <span>Total</span>
              <span>{money.format(total)}</span>
            </div>
          </div>
          <Button className="w-full" disabled={lines.length === 0} onClick={() => setPayOpen(true)}>
            Pay
          </Button>
        </div>
      </div>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment · {money.format(total)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              {(["cash", "card", "upi"] as Pay[]).map((m) => (
                <Button key={m} variant={method === m ? "default" : "outline"} onClick={() => setMethod(m)} className="capitalize">
                  {m}
                </Button>
              ))}
            </div>
            {method === "cash" && (
              <div className="space-y-1">
                <Label>Cash received</Label>
                <Input type="number" min={0} value={tendered} placeholder={total.toFixed(2)} onChange={(e) => setTendered(e.target.value)} />
                {Number(tendered) > total && (
                  <p className="text-sm text-muted-foreground">Change: {money.format(Number(tendered) - total)}</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button disabled={sale.isPending} onClick={() => sale.mutate()}>
              Complete sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={closeOpen}
        onOpenChange={(o) => {
          setCloseOpen(o);
          if (!o) setCloseResult(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close session</DialogTitle>
            <DialogDescription>
              Count the cash in the drawer. Opening {money.format(session.openingCash)} + cash sales{" "}
              {money.format(session.totals.byMethod.cash)}.
            </DialogDescription>
          </DialogHeader>
          {closeResult ? (
            <div className="space-y-1 text-sm">
              <div>Expected cash: {money.format(closeResult.expectedCash)}</div>
              <div>
                Difference:{" "}
                <span className={closeResult.difference === 0 ? "" : "font-semibold text-destructive"}>
                  {money.format(closeResult.difference)}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Counted cash</Label>
              <Input type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            {closeResult ? (
              <Button onClick={() => setCloseOpen(false)}>Done</Button>
            ) : (
              <Button disabled={counted === "" || closeSession.isPending} onClick={() => closeSession.mutate()}>
                Close session
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SessionTable({ rows }: { rows: PosSession[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Session</TableHead>
          <TableHead>Opened</TableHead>
          <TableHead className="text-right">Sales</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((s) => (
          <TableRow key={s._id}>
            <TableCell>{s.sessionNumber}</TableCell>
            <TableCell>{format(new Date(s.openedAtIso), "dd MMM HH:mm")}</TableCell>
            <TableCell className="text-right">{s.totals.orderCount}</TableCell>
            <TableCell className="text-right">{money.format(s.totals.total)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
