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

  const visibleItems = items.filter(item => matchesSearch(item, searchQuery, config.columns.map(column => column.key)))

  return <main className="portal-content"><PageHeading eyebrow={config.eyebrow || 'OPERATIONS'} title={config.title} description={config.description}/>
    <section className="content-card">
      <CardToolbar
        title={config.title}
        meta={searchQuery ? `${visibleItems.length} of ${items.length} records` : `${items.length} records`}
        search={{ value: searchInput, onChange: setSearchInput, onSubmit: () => applySearch(), placeholder: 'Search records…', label: `Search ${config.title}` }}
        onRefresh={() => void load()}
      />
      {loading ? <StatePanel kind="loading"/> : error ? <StatePanel kind="error">{error}</StatePanel> : visibleItems.length ? <DataTable columns={config.columns} items={visibleItems}/> : <StatePanel kind="empty">{items.length ? 'No records match this search.' : undefined}</StatePanel>}
    </section>
  </main>
}
