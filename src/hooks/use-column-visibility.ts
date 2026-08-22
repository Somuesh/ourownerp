import { useEffect, useState } from "react";

/** Persists which table columns are shown (localStorage, per `storageKey`)
 * so a list view remembers your choice next visit. Always keeps at least
 * one column visible — toggling the last one off is a no-op. */
export function useColumnVisibility<T extends string>(
  storageKey: string,
  allColumns: readonly T[],
  defaultVisible?: readonly T[],
) {
  const [visible, setVisible] = useState<Set<T>>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as T[];
        // Ignore any stale column ids from an older version of this view.
        return new Set(parsed.filter((c) => allColumns.includes(c)));
      }
    } catch {
      // Corrupt/unavailable localStorage — fall through to defaults.
    }
    return new Set(defaultVisible ?? allColumns);
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...visible]));
    } catch {
      // Best-effort persistence only.
    }
  }, [storageKey, visible]);

  const toggle = (column: T) => {
    setVisible((prev) => {
      if (prev.has(column) && prev.size === 1) return prev;
      const next = new Set(prev);
      next.has(column) ? next.delete(column) : next.add(column);
      return next;
    });
  };

  return { isVisible: (column: T) => visible.has(column), toggle };
}
