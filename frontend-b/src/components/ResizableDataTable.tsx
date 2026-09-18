import { type ReactNode, type PointerEvent } from "react";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MIN_TABLE_COLUMN_WIDTH, MAX_TABLE_COLUMN_WIDTH } from "@/hooks/useTableColumnWidths";

function ResizeHead({ label, index, width, resize }: { label: string; index: number; width: number; resize: (index: number, width: number) => void }) {
  const start = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const origin = event.clientX;
    const initial = width;
    handle.setPointerCapture(event.pointerId);
    const move = (next: globalThis.PointerEvent) => resize(index, initial + next.clientX - origin);
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      handle.removeEventListener("lostpointercapture", stop);
    };
    handle.addEventListener("pointermove", move);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) handle.addEventListener(type, stop);
  };
  return <TableHead className="relative overflow-visible pr-4" scope="col">
    <span className="block truncate">{label}</span>
    <span
      role="separator"
      aria-label={`${label || "작업"} 열 너비 조절`}
      aria-orientation="vertical"
      aria-valuemin={MIN_TABLE_COLUMN_WIDTH}
      aria-valuemax={MAX_TABLE_COLUMN_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      title="드래그하거나 좌우 방향키로 열 너비 조절"
      className="group absolute inset-y-0 right-0 z-10 flex w-3 cursor-col-resize touch-none items-center justify-center outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
      onPointerDown={start}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        resize(index, width + (event.key === "ArrowRight" ? 16 : -16));
      }}
    ><span className="h-5 w-px bg-border transition-colors group-hover:w-0.5 group-hover:bg-primary group-focus-visible:w-0.5 group-focus-visible:bg-primary" /></span>
  </TableHead>;
}

export function ResizableDataTable({ labels, widths, resize, children }: { labels: string[]; widths: number[]; resize: (index: number, width: number) => void; children: ReactNode }) {
  const total = widths.reduce((sum, width) => sum + width, 0);
  return <Table className="table-fixed [&_td]:overflow-hidden [&_td]:text-ellipsis" style={{ width: `max(100%, ${total}px)` }}>
    <colgroup>{widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
    <TableHeader><TableRow>{labels.map((label, index) => <ResizeHead key={`${label}-${index}`} label={label} index={index} width={widths[index]} resize={resize} />)}</TableRow></TableHeader>
    {children}
  </Table>;
}
