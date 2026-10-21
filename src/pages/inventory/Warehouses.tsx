import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowRightLeft, Plus, Warehouse as WarehouseIcon } from "lucide-react";
import { ApiError, useApiClient } from "@/lib/api-client.ts";
import type { ReorderItem, StockOverview, StockTransfer } from "@/lib/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
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

function errMsg(e: unknown) {
  return e instanceof ApiError ? e.message : "Something went wrong";
}

export default function Warehouses() {
  const api = useApiClient();
  const qc = useQueryClient();
  const { data: stock } = useQuery<StockOverview>({
    queryKey: ["inventory-stock"],
    queryFn: () => api.get("/inventory/stock"),
  });
  const { data: transfers } = useQuery<StockTransfer[]>({
    queryKey: ["stock-transfers"],
    queryFn: () => api.get("/stock-transfers"),
  });
  const { data: reorder } = useQuery<ReorderItem[]>({
    queryKey: ["inventory-reorder"],
    queryFn: () => api.get("/inventory/reorder"),
  });

  const refresh = () => {
    for (const k of ["inventory-stock", "stock-transfers", "inventory-reorder", "products"]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  };

  const [whOpen, setWhOpen] = useState(false);
  const [whName, setWhName] = useState("");
  const [whCode, setWhCode] = useState("");
  const [whAddress, setWhAddress] = useState("");
  const createWh = useMutation({
    mutationFn: () => api.post("/warehouses", { name: whName, code: whCode, address: whAddress }),
    onSuccess: () => {
      toast.success("Warehouse created");
      setWhOpen(false);
      setWhName("");
      setWhCode("");
      setWhAddress("");
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const [trOpen, setTrOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const transfer = useMutation({
    mutationFn: () =>
      api.post("/stock-transfers", {
        productId,
        fromWarehouseId: fromId,
        toWarehouseId: toId,
        quantity: Number(qty),
        note,
      }),
    onSuccess: (r: { transferNumber: string }) => {
      toast.success(`Transfer ${r.transferNumber} done`);
      setTrOpen(false);
      setQty("1");
      setNote("");
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const whs = stock?.warehouses.filter((w) => w.isActive) ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Warehouses</h1>
          <p className="text-sm text-muted-foreground">Stock by location, transfers and reorder suggestions.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setWhOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> New warehouse
          </Button>
          <Button onClick={() => setTrOpen(true)} disabled={whs.length < 2}>
            <ArrowRightLeft className="mr-1 h-4 w-4" /> Transfer stock
          </Button>
        </div>
      </div>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock by location</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="reorder">
            Reorder{reorder && reorder.length > 0 ? ` (${reorder.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          {!stock ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  {stock.warehouses.map((w) => (
                    <TableHead key={w._id} className="text-right">
                      <span className="inline-flex items-center gap-1">
                        <WarehouseIcon className="h-3 w-3" />
                        {w.name}
                        {!w.isActive && <Badge variant="secondary">off</Badge>}
                      </span>
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.products.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.sku}</div>
                    </TableCell>
                    {stock.warehouses.map((w) => (
                      <TableCell key={w._id} className="text-right">
                        {p.quantities[w._id] ?? 0}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium">
                      {p.total}
                      {p.total <= p.lowStockThreshold && (
                        <Badge variant="destructive" className="ml-2">low</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="transfers">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>From → To</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(transfers ?? []).map((t) => (
                <TableRow key={t._id}>
                  <TableCell>{t.transferNumber}</TableCell>
                  <TableCell>{t.productName}</TableCell>
                  <TableCell>
                    {t.fromWarehouseName} → {t.toWarehouseName}
                  </TableCell>
                  <TableCell className="text-right">{t.quantity}</TableCell>
                  <TableCell>{t.createdByName}</TableCell>
                  <TableCell>{format(new Date(t.createdAtIso), "dd MMM yyyy, HH:mm")}</TableCell>
                </TableRow>
              ))}
              {transfers?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No transfers yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="reorder">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">In stock</TableHead>
                <TableHead className="text-right">Threshold</TableHead>
                <TableHead className="text-right">Suggested order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reorder ?? []).map((r) => (
                <TableRow key={r._id}>
                  <TableCell>
                    {r.name} <span className="text-xs text-muted-foreground">{r.sku}</span>
                  </TableCell>
                  <TableCell className="text-right">{r.stockQuantity}</TableCell>
                  <TableCell className="text-right">{r.lowStockThreshold}</TableCell>
                  <TableCell className="text-right font-medium">{r.suggestedReorderQuantity}</TableCell>
                </TableRow>
              ))}
              {reorder?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Everything is above its threshold.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      <Dialog open={whOpen} onOpenChange={setWhOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New warehouse</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={whName} onChange={(e) => setWhName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Code (optional)</Label>
              <Input value={whCode} onChange={(e) => setWhCode(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Address (optional)</Label>
              <Input value={whAddress} onChange={(e) => setWhAddress(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createWh.mutate()} disabled={!whName.trim() || createWh.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={trOpen} onOpenChange={setTrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {(stock?.products ?? []).map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>From</Label>
                <Select value={fromId} onValueChange={setFromId}>
                  <SelectTrigger>
                    <SelectValue placeholder="From" />
                  </SelectTrigger>
                  <SelectContent>
                    {whs.map((w) => (
                      <SelectItem key={w._id} value={w._id}>
                        {w.name}
                        {productId && stock ? ` (${stock.products.find((p) => p._id === productId)?.quantities[w._id] ?? 0})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>To</Label>
                <Select value={toId} onValueChange={setToId}>
                  <SelectTrigger>
                    <SelectValue placeholder="To" />
                  </SelectTrigger>
                  <SelectContent>
                    {whs.map((w) => (
                      <SelectItem key={w._id} value={w._id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Quantity</Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => transfer.mutate()}
              disabled={!productId || !fromId || !toId || fromId === toId || !(Number(qty) > 0) || transfer.isPending}
            >
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
