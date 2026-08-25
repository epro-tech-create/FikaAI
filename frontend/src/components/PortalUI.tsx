import type { ReactNode } from 'react'

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="portal-heading"><div><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>{action}</div>
}

export function StatePanel({ kind, children }: { kind: 'loading' | 'error' | 'empty'; children?: ReactNode }) {
  return <div className={`state-panel ${kind}`}>{kind === 'loading' && <i/>}<b>{kind === 'loading' ? 'Loading workspace data' : kind === 'error' ? 'Data is not available' : 'Nothing here yet'}</b><span>{children || (kind === 'loading' ? 'Connecting to the attendance service...' : 'New records will appear here.')}</span></div>
}

export type TableColumn = { key: string; label: string }

function nestedValue(item: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, item)
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not set'
  if (typeof value === 'boolean') return value ? 'Active' : 'Inactive'
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${String(item)}`).join(', ')
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString()
  return String(value).replace(/_/g, ' ')
}

export function DataTable({ columns, items }: { columns: TableColumn[]; items: Record<string, unknown>[] }) {
  return <div className="data-table-wrap"><table className="data-table"><thead><tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{items.map((item, index) => <tr key={String(item.id ?? item.sessionId ?? index)}>{columns.map((column, columnIndex) => {
    const value = nestedValue(item, column.key)
    return <td key={column.key}>{columnIndex === 0 ? <b>{displayValue(value)}</b> : column.key.toLowerCase().includes('status') ? <span className="status-pill">{displayValue(value)}</span> : displayValue(value)}</td>
  })}</tr>)}</tbody></table></div>
}

export function StatCard({ label, value, note, tone = '' }: { label: string; value: unknown; note: string; tone?: string }) {
  return <article className={`stat-card ${tone}`}><span>{label}</span><b>{value === undefined || value === null ? '0' : String(value)}</b><small>{note}</small></article>
}
