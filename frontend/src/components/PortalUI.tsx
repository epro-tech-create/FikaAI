import { useEffect, type FormEvent, type ReactNode } from 'react'

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="portal-heading"><div><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>{action}</div>
}

export type CardSearch = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
  label: string
}

export function CardToolbar({ title, meta, search, onRefresh }: { title: string; meta: string; search?: CardSearch; onRefresh: () => void }) {
  function submit(event: FormEvent) {
    event.preventDefault()
    search?.onSubmit()
  }
  return <div className="card-toolbar">
    <div className="card-toolbar-title"><b>{title}</b><span>{meta}</span></div>
    <div className="card-toolbar-actions">
      {search && <form className="table-search" onSubmit={submit}>
        <input type="search" value={search.value} onChange={event => search.onChange(event.target.value)} placeholder={search.placeholder} aria-label={search.label}/>
        <button type="submit" className="portal-primary">Search</button>
      </form>}
      <button type="button" className="toolbar-refresh" onClick={onRefresh}>Refresh</button>
    </div>
  </div>
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

export function DataTable({ columns, items, renderActions }: { columns: TableColumn[]; items: Record<string, unknown>[]; renderActions?: ReactNode | ((item: Record<string, unknown>) => ReactNode) }) {
  return <div className="data-table-wrap" role="region" aria-label="Scrollable data table" tabIndex={0}><table className="data-table"><thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}{renderActions && <th scope="col">Actions</th>}</tr></thead><tbody>{items.map((item, index) => <tr key={String(item.id ?? item.sessionId ?? index)}>{columns.map((column, columnIndex) => {
    const value = nestedValue(item, column.key)
    return <td key={column.key} data-label={column.label}>{columnIndex === 0 ? <b>{displayValue(value)}</b> : column.key.toLowerCase().includes('status') || typeof value === 'boolean' ? <span className={`status-pill ${value === false ? 'inactive' : ''}`}>{displayValue(value)}</span> : displayValue(value)}</td>
  })}{renderActions && <td className="table-action-cell" data-label="Actions"><div className="row-actions">{typeof renderActions === 'function' ? renderActions(item) : renderActions}</div></td>}</tr>)}</tbody></table></div>
}

export function StatCard({ label, value, note, tone = '' }: { label: string; value: unknown; note: string; tone?: string }) {
  return <article className={`stat-card ${tone}`}><span>{label}</span><b>{value === undefined || value === null ? '0' : String(value)}</b><small>{note}</small></article>
}

export function PortalDialog({ children, labelledBy, onClose }: { children: ReactNode; labelledBy: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return <div className="portal-dialog-backdrop" onClick={onClose} role="presentation">
    <div className="portal-dialog content-card" role="dialog" aria-modal="true" aria-labelledby={labelledBy} onClick={event => event.stopPropagation()}>
      {children}
    </div>
  </div>
}
