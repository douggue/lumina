import { Children, Fragment, cloneElement, isValidElement } from "react";
export function PageTitle({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="display text-2xl font-bold sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {actions}
    </div>
  );
}

/** Adds each column's header as a data-label on its cells, so phones can show rows as labeled cards. */
function labelCells(children: React.ReactNode, head: string[]): React.ReactNode {
  return Children.map(children, (row) => {
    if (!isValidElement<{ children?: React.ReactNode }>(row)) return row;
    if (row.type === Fragment) return cloneElement(row, {}, labelCells(row.props.children, head));
    let i = 0;
    const cells = Children.map(row.props.children, (cell) => {
      if (!isValidElement(cell)) return cell;
      const label = head[i++] ?? "";
      return cloneElement(cell as React.ReactElement<Record<string, unknown>>, { "data-label": label });
    });
    return cloneElement(row, {}, cells);
  });
}

/** Table on wide screens; on phones each row becomes a card with "Label · value" lines. */
export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="card rtable overflow-x-auto">
      <table className="w-full text-left text-sm sm:min-w-[640px]">
        <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
          <tr>{head.map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">{labelCells(children, head)}</tbody>
      </table>
      {empty && <p className="p-8 text-center text-sm text-muted">Nothing here.</p>}
    </div>
  );
}

export function Stat({ label, value, tone, delta }: { label: string; value: React.ReactNode; tone?: "warn" | "danger"; delta?: { text: string; good: boolean } }) {
  return (
    <div className="card flex flex-col gap-3 p-4">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3.5 py-3">
        <p className={`min-w-0 break-words text-2xl font-bold tracking-tight tabular-nums ${tone === "warn" ? "text-warning" : tone === "danger" ? "text-danger" : ""}`}>{value}</p>
        {delta && <span className={`badge shrink-0 ${delta.good ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{delta.text}</span>}
      </div>
    </div>
  );
}
