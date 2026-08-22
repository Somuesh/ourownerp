import { LayoutGrid, List } from "lucide-react";
import { Button } from "./button.tsx";

export type ViewMode = "list" | "kanban";

/** Small List/Kanban toggle used at the top of Deals, Sales Orders, and
 * Invoices. Opening a record for details (the edit dialog) is the "form"
 * view in both modes — there's no separate third toggle state for it. */
export function ViewSwitcher({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border p-0.5">
      <Button
        type="button"
        variant={value === "list" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 gap-1.5 px-2.5"
        onClick={() => onChange("list")}
      >
        <List className="size-3.5" />
        List
      </Button>
      <Button
        type="button"
        variant={value === "kanban" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 gap-1.5 px-2.5"
        onClick={() => onChange("kanban")}
      >
        <LayoutGrid className="size-3.5" />
        Kanban
      </Button>
    </div>
  );
}
