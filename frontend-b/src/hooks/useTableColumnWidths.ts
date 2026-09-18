import { useEffect, useState } from "react";

export const MIN_TABLE_COLUMN_WIDTH = 72;
export const MAX_TABLE_COLUMN_WIDTH = 640;

function savedWidths(key: string, defaults: number[]) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (Array.isArray(saved) && saved.length === defaults.length && saved.every((width) => Number.isFinite(width))) {
      return saved.map((width) => Math.max(MIN_TABLE_COLUMN_WIDTH, Math.min(MAX_TABLE_COLUMN_WIDTH, width))) as number[];
    }
  } catch { /* Storage may be unavailable. The table still works. */ }
  return defaults;
}

export function useTableColumnWidths(name: string, defaults: number[]) {
  const key = `msp-b-table-widths-${name}`;
  const [widths, setWidths] = useState(() => savedWidths(key, defaults));
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(widths)); } catch { /* Keep the current session usable. */ }
  }, [key, widths]);
  const resize = (index: number, width: number) => {
    setWidths((current) => {
      const next = [...current];
      next[index] = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.min(MAX_TABLE_COLUMN_WIDTH, Math.round(width)));
      return next;
    });
  };
  return { widths, resize };
}
