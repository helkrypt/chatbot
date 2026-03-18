'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { Suspense } from 'react'

const ACTION_LABELS = {
  'client.create': 'Klient opprettet',
  'client.update': 'Klient oppdatert',
  'client.delete': 'Klient slettet',
  'client.retrigger_onboarding': 'Onboarding re-trigget',
  'prompt.generate': 'Prompt-forslag generert',
  'prompt.approve': 'Prompt godkjent',
  'prompt.reject': 'Prompt avvist',
  'file.upload': 'Fil lastet opp',
  'opening_hours.create': 'Åpningstid opprettet',
  'opening_hours.delete': 'Åpningstid slettet',
}

function LogsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [expandedRow, setExpandedRow] = useState(null)

  // Filters
  const [clientFilter, setClientFilter] = useState(searchParams.get('client') || '')
  const [actionFilter, setActionFilter] = useState(searchParams.get('action') || '')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const LIMIT = 50

  const fetchLogs = async (offset = 0) => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('limit', LIMIT)
    params.set('offset', offset)
    if (clientFilter) params.set('client_id', clientFilter)
    if (actionFilter) params.set('action', actionFilter)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)

    try {
      const res = await fetch(`/api/admin/logs?${params}`)
      if (res.status === 401) { router.push('/login'); return }
      if (!res.ok) throw new Error('Feil ved henting av logger')
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchLogs(page * LIMIT)
  }, [page])

  const handleFilter = (e) => {
    e.preventDefault()
    setPage(0)
    fetchLogs(0)
  }

  const totalPages = Math.ceil(total / LIMIT)

  const formatDate = (iso) => {
    const d = new Date(iso)
    return d.toLocaleString('no-NO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Logger</h1>
        </div>

        {/* Filters */}
        <form onSubmit={handleFilter} style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Klient-ID</label>
            <input
              className="form-input"
              value={clientFilter}
              onChange={e => setClientFilter(e.target.value)}
              placeholder="f.eks. elesco-trondheim"
              style={{ width: '200px', padding: '6px 10px', fontSize: '13px' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Handling</label>
            <select
              className="form-input"
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              style={{ width: '200px', padding: '6px 10px', fontSize: '13px' }}
            >
              <option value="">Alle</option>
              {Object.entries(ACTION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Fra dato</label>
            <input
              className="form-input"
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '13px' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Til dato</label>
            <input
              className="form-input"
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '13px' }}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ padding: '6px 16px', fontSize: '13px' }}>
            Filtrer
          </button>
          {(clientFilter || actionFilter || fromDate || toDate) && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '6px 16px', fontSize: '13px' }}
              onClick={() => {
                setClientFilter('')
                setActionFilter('')
                setFromDate('')
                setToDate('')
                setPage(0)
                setTimeout(() => fetchLogs(0), 0)
              }}
            >
              Nullstill
            </button>
          )}
        </form>

        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
          {total} {total === 1 ? 'oppføring' : 'oppføringer'} totalt
        </div>

        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Tidspunkt</th>
                  <th>Handling</th>
                  <th>Klient</th>
                  <th>Bruker</th>
                  <th>Detaljer</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px' }}>Laster...</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>Ingen logger funnet</td></tr>
                ) : logs.map(log => (
                  <tr
                    key={log.id}
                    onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                    style={{ cursor: log.details ? 'pointer' : 'default' }}
                  >
                    <td style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {formatDate(log.created_at)}
                    </td>
                    <td>
                      <span style={{
                        fontSize: '12px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: log.action.startsWith('prompt.') ? '#ede9fe' :
                                   log.action.includes('delete') ? '#fef2f2' :
                                   log.action.includes('create') ? '#d1fae5' : '#f3f4f6',
                        color: log.action.startsWith('prompt.') ? '#6d28d9' :
                               log.action.includes('delete') ? '#dc2626' :
                               log.action.includes('create') ? '#065f46' : '#374151',
                      }}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td>
                      {log.client_id ? (
                        <Link
                          href={`/admin/clients/${log.client_id}`}
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: '13px', color: 'var(--color-accent)' }}
                        >
                          {log.client_id}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: '13px' }}>
                      {log.user_id?.slice(0, 8) || '—'}
                    </td>
                    <td style={{ fontSize: '13px' }}>
                      {log.details ? (
                        expandedRow === log.id ? (
                          <pre style={{
                            margin: 0, fontSize: '12px', background: 'var(--color-bg-subtle)',
                            padding: '8px', borderRadius: '6px', whiteSpace: 'pre-wrap',
                            maxWidth: '400px', overflow: 'auto',
                          }}>
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                            {Object.keys(log.details).join(', ')}
                          </span>
                        )
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
            <button
              className="btn btn-secondary"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              style={{ padding: '6px 14px', fontSize: '13px' }}
            >
              Forrige
            </button>
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
              Side {page + 1} av {totalPages}
            </span>
            <button
              className="btn btn-secondary"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              style={{ padding: '6px 14px', fontSize: '13px' }}
            >
              Neste
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

export default function LogsPage() {
  return (
    <Suspense fallback={null}>
      <LogsPageInner />
    </Suspense>
  )
}
