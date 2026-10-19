import type { ReactNode } from "react";
import { Link, type To } from "react-router-dom";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { Menu, type MenuItem } from "./Menu";

export interface DataTableColumn<Row> {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  numeric?: boolean;
  className?: string;
}

interface DataTableProps<Row> {
  caption: string;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  rowHref?: (row: Row) => To;
  rowMenu?: (row: Row) => readonly MenuItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  emptyTitle: string;
  emptyDescription?: string;
  skeletonRowCount?: number;
}

export function DataTable<Row>({ caption, columns, rows, rowKey, rowHref, rowMenu, isLoading, isError, onRetry, emptyTitle, emptyDescription, skeletonRowCount = 5 }: DataTableProps<Row>) {
  const hasMenuColumn: boolean = rowMenu !== undefined;
  const columnCount: number = columns.length + (hasMenuColumn ? 1 : 0);
  const showRows: boolean = !isLoading && !isError && rows.length > 0;

  const renderMessage = (content: ReactNode, state: string): ReactNode => (
    <tbody data-table-state={state}>
      <tr><td colSpan={columnCount}>{content}</td></tr>
    </tbody>
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className={`w-full border-collapse ${showRows ? "min-w-[32rem]" : ""} text-left text-sm`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-muted">
            {columns.map((column) => (
              <th key={column.key} scope="col" className={`px-4 py-3 font-medium ${column.numeric ? "text-right" : ""} ${column.className ?? ""}`}>{column.header}</th>
            ))}
            {hasMenuColumn && <th scope="col" className="w-14 px-2 py-3"><span className="sr-only">{caption}</span></th>}
          </tr>
        </thead>
        {isLoading && (
          <tbody data-table-state="loading" aria-busy="true">
            {Array.from({ length: skeletonRowCount }, (_, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border last:border-b-0">
                {Array.from({ length: columnCount }, (_, columnIndex) => (
                  <td key={columnIndex} className="px-4 py-3"><div className="h-4 w-full max-w-40 rounded bg-strip motion-safe:animate-pulse" /></td>
                ))}
              </tr>
            ))}
          </tbody>
        )}
        {!isLoading && isError && renderMessage(<ErrorState onRetry={onRetry} />, "error")}
        {!isLoading && !isError && rows.length === 0 && renderMessage(<EmptyState title={emptyTitle} description={emptyDescription} />, "empty")}
        {showRows && (
          <tbody data-table-state="loaded">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="relative border-b border-border last:border-b-0 hover:bg-row-hover motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out">
                {columns.map((column, columnIndex) => (
                  <td key={column.key} className={`px-4 py-3 text-ink ${column.numeric ? "text-right tabular-nums" : ""} ${column.className ?? ""}`}>
                    {columnIndex === 0 && rowHref !== undefined ? (
                      <Link to={rowHref(row)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:inset-0 after:content-['']">{column.cell(row)}</Link>
                    ) : column.cell(row)}
                  </td>
                ))}
                {rowMenu !== undefined && <td className="w-14 px-2 py-1 text-right"><Menu items={rowMenu(row)} /></td>}
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}
