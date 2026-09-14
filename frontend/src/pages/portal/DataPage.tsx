import { useEffect, useState, type FormEvent } from 'react'
import { api, message } from '../../services/api'
import { CardToolbar, DataTable, PageHeading, StatePanel, type TableColumn } from '../../components/PortalUI'
import { matchesSearch } from '../../lib/tableSearch'

export type DataPageConfig = { title: string; description: string; endpoint: string; columns: TableColumn[]; eyebrow?: string }

function rowsFrom(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return []
  const object = data as Record<string, unknown>
  for (const key of ['items', 'results', 'records', 'sessions', 'students', 'courses', 'instructors', 'locations', 'users', 'logs', 'enrolments']) {
    if (Array.isArray(object[key])) return object[key] as Record<string, unknown>[]
  }
  return [object]
}

export default function DataPage({ config }: { config: DataPageConfig }) {
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [bulkDate, setBulkDate] = useState('')
  const isAuditLogs = config.endpoint.includes('audit-logs')

  function load() {
    setLoading(true)
    setError('')
    return api.get(config.endpoint)
      .then(response => setItems(rowsFrom(response.data)))
      .catch(requestError => setError(message(requestError)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { void load() }, [config.endpoint])

  function applySearch(event?: FormEvent) {
    event?.preventDefault()
    setSearchQuery(searchInput)
  }

  async function deleteOne(id: string) {
    if (!confirm('Delete this audit log?')) return
    setDeleting(id)
    try {
      await api.delete(`${config.endpoint}/${id}`)
      setItems(prev => prev.filter(it => String(it.id) !== id))
    } catch (e) { setError(message(e)) } finally { setDeleting(null) }
  }
  async function bulkDelete() {
    if (!bulkDate) { setError('Pick a date for bulk delete (deletes before that date)'); return }
    if (!confirm(`Delete all audit logs before ${bulkDate}?`)) return
    try {
      const res = await api.delete(config.endpoint, { params: { before: bulkDate } })
      setError('')
      alert(`Deleted ${res.data?.deleted ?? 0} logs`)
      void load()
    } catch (e) { setError(message(e)) }
  }
  async function deleteAll() {
    if (!confirm('Delete ALL audit logs older than 30 days?')) return
    try {
      const d = new Date(); d.setDate(d.getDate()-30)
      const before = d.toISOString().slice(0,10)
      const res = await api.delete(config.endpoint, { params: { before } })
      alert(`Deleted ${res.data?.deleted ?? 0} logs`)
      void load()
    } catch (e) { setError(message(e)) }
  }

  const visibleItems = items.filter(item => matchesSearch(item, searchQuery, config.columns.map(column => column.key)))

  return <main className="portal-content"><PageHeading eyebrow={config.eyebrow || 'OPERATIONS'} title={config.title} description={config.description}/>
    {isAuditLogs && <section className="content-card" style={{marginBottom:16}}>
      <h4 style={{margin:'0 0 8px'}}>Audit log cleanup</h4>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <input type="date" value={bulkDate} onChange={e=>setBulkDate(e.target.value)} />
        <button className="secondary-button" onClick={bulkDelete}>Delete before date</button>
        <button className="secondary-button" onClick={deleteAll}>Delete older than 30 days</button>
        <small style={{color:'#64748b'}}>Uses DELETE /admin/audit-logs?before=YYYY-MM-DD</small>
      </div>
    </section>}
    <section className="content-card">
      <CardToolbar
        title={config.title}
        meta={searchQuery ? `${visibleItems.length} of ${items.length} records` : `${items.length} records`}
        search={{ value: searchInput, onChange: setSearchInput, onSubmit: () => applySearch(), placeholder: 'Search records…', label: `Search ${config.title}` }}
        onRefresh={() => void load()}
      />
      {loading ? <StatePanel kind="loading"/> : error ? <StatePanel kind="error">{error}</StatePanel> : visibleItems.length ? <>
        <DataTable columns={config.columns} items={visibleItems} renderActions={isAuditLogs ? (item) => <button disabled={deleting===String(item.id)} onClick={()=>deleteOne(String(item.id))} className="secondary-button" style={{padding:'4px 10px',fontSize:12,borderRadius:6}}>{deleting===String(item.id)?'Deleting…':'Delete'}</button> : undefined} />
        {isAuditLogs && <p style={{marginTop:8,fontSize:12,color:'#94a3b8'}}>Tip: search then delete one by one, or bulk delete by date above.</p>}
      </> : <StatePanel kind="empty">{items.length ? 'No records match this search.' : undefined}</StatePanel>}
    </section>
  </main>
}
