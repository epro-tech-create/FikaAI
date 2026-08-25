import { useEffect, useState } from 'react'
import { api, message } from '../../services/api'
import { DataTable, PageHeading, StatePanel, type TableColumn } from '../../components/PortalUI'

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

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    api.get(config.endpoint).then(response => { if (active) setItems(rowsFrom(response.data)) }).catch(requestError => { if (active) setError(message(requestError)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [config.endpoint])

  return <main className="portal-content"><PageHeading eyebrow={config.eyebrow || 'OPERATIONS'} title={config.title} description={config.description}/>
    <section className="content-card"><div className="card-toolbar"><div><b>{config.title}</b><span>{items.length} records</span></div><button onClick={() => window.location.reload()}>Refresh</button></div>
      {loading ? <StatePanel kind="loading"/> : error ? <StatePanel kind="error">{error}</StatePanel> : items.length ? <DataTable columns={config.columns} items={items}/> : <StatePanel kind="empty"/>}
    </section>
  </main>
}
