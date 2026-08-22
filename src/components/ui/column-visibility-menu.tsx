import { Columns3 } from "lucide-react";
import { Button } from "./button.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx";

/** "Columns" button + checklist for list views — pair with
 * useColumnVisibility (src/hooks/use-column-visibility.ts). */
export function ColumnVisibilityMenu<T extends string>({
  columns,
  isVisible,
  toggle,
}: {
  columns: ReadonlyArray<{ id: T; label: string }>;
  isVisible: (id: T) => boolean;
  toggle: (id: T) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5">
          <Columns3 className="size-3.5" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Show columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={isVisible(column.id)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => toggle(column.id)}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
