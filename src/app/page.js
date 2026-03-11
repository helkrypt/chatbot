'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [stats, setStats] = useState({
    conversationsToday: 0,
    newInquiries: 0,
    openInquiries: 0,
    resolvedToday: 0,
    totalConversations: 0,
    escalatedConversations: 0
  })
  const [dailyStats, setDailyStats] = useState([])
  const [recentConversations, setRecentConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    checkAuth()
    loadStats()
  }, [])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
    }
  }

  // Helper to get YYYY-MM-DD in local time
  const getLocalDateKey = (dateObj) => {
    const year = dateObj.getFullYear()
    const month = String(dateObj.getMonth() + 1).padStart(2, '0')
    const day = String(dateObj.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const loadStats = async () => {
    const now = new Date()

    // Use local midnight (not UTC) so stats match the chart
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayStr = todayLocal.toISOString()

    // Fetch last 7 days
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
    const cutoffStr = startDate.toISOString()

    const { data: chartData, error: chartError } = await supabase
      .from('conversations')
      .select('created_at')
      .gte('created_at', cutoffStr)

    const { count: conversationsToday } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStr)

    const { count: totalConversations } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', cutoffStr)

    const { count: escalatedConversations } = await supabase
      .from('inquiries')
      .select('conversation_id', { count: 'exact', head: true })
      .gte('created_at', cutoffStr)

    const { count: newInquiries } = await supabase
      .from('inquiries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'new')

    const { count: openInquiries } = await supabase
      .from('inquiries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'in_progress')

    const { count: resolvedToday } = await supabase
      .from('inquiries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'resolved')
      .gte('updated_at', todayStr)


    const { data: recent } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(5)

    // PROCESS CHART DATA
    const statsMap = {}

    // Generate last 7 days keys
    const dates = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = getLocalDateKey(d)
      statsMap[key] = 0
      dates.push({
        key: key,
        label: d.toLocaleDateString('no-NO', { weekday: 'short', day: 'numeric', month: 'numeric' })
      })
    }

    if (chartData) {
      chartData.forEach(c => {
        const d = new Date(c.created_at)
        const key = getLocalDateKey(d)
        if (statsMap[key] !== undefined) {
          statsMap[key]++
        }
      })
    }

    const dailyStatsArray = dates.map(d => ({
      date: d.key,
      count: statsMap[d.key],
      label: d.label
    }))

    setStats({
      conversationsToday: conversationsToday || 0,
      newInquiries: newInquiries || 0,
      openInquiries: openInquiries || 0,
      resolvedToday: resolvedToday || 0,
      totalConversations: totalConversations || 0,
      escalatedConversations: escalatedConversations || 0
    })
    setDailyStats(dailyStatsArray)
    setRecentConversations(recent || [])
    setLoading(false)
  }

  // Bar Chart Component
  const BarChart = () => {
    const counts = dailyStats.map(d => d.count)
    const maxVal = Math.max(...counts, 1)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', height: '200px' }}>
        {/* Chart Area */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '100%', paddingBottom: '10px', borderBottom: '1px solid var(--color-border)' }}>
          {dailyStats.map((day, i) => {
            const heightDetails = (day.count / maxVal) * 100

            return (
              // KEY FIX: Added height: '100%' and justifyContent: 'flex-end' to the wrapper
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', width: '100%', height: '100%' }}>
                <div
                  title={`${day.count} samtaler ${day.label}`}
                  style={{
                    width: '50%',
                    // Use literal color code to ensure visibility
                    height: day.count > 0 ? `${heightDetails}%` : '2px',
                    background: day.count > 0 ? '#00c9b7' : '#f3f4f6',
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s ease',
                    position: 'relative'
                  }}
                >
                  {day.count > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '-25px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      color: 'var(--color-text)'
                    }}>
                      {day.count}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {/* X-Axis Labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {dailyStats.map((day, i) => (
            <div key={i} style={{ width: '100%', textAlign: 'center', fontSize: '11px', color: 'var(--color-text-muted)' }}>
              {day.label.split(' ')[0]}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Pie Chart
  const totalChats = stats.totalConversations || 1
  const escalatedPercent = ((stats.escalatedConversations / totalChats) * 100).toFixed(1)
  const normalPercent = (100 - parseFloat(escalatedPercent)).toFixed(1)

  const PieChart = () => {
    const radius = 70
    const circumference = 2 * Math.PI * radius
    const escalatedDashOffset = circumference - (circumference * stats.escalatedConversations / totalChats)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <svg width="180" height="180" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r={radius} fill="none" stroke="var(--color-accent)" strokeWidth="30" />
          <circle
            cx="90" cy="90" r={radius} fill="none" stroke="#ef4444" strokeWidth="30"
            strokeDasharray={circumference} strokeDashoffset={escalatedDashOffset} transform="rotate(-90 90 90)"
          />
          <text x="90" y="85" textAnchor="middle" fontSize="24" fontWeight="bold" fill="var(--color-text)">
            {stats.totalConversations}
          </text>
          <text x="90" y="105" textAnchor="middle" fontSize="12" fill="var(--color-text-muted)">
            samtaler totalt
          </text>
        </svg>
        <div style={{ display: 'flex', gap: '24px', fontSize: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--color-accent)' }}></div>
            <span>Normal ({normalPercent}%)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }}></div>
            <span>Eskalert ({escalatedPercent}%)</span>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <div className="loading"><div className="spinner"></div></div>
        </main>
      </div>
    )
  }


  return (
    <div className="app-container">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="main-content">
        <Navbar onMenuClick={() => setIsSidebarOpen(true)} />

        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Totale samtaler i dag</div>
            <div className="stat-value">{stats.conversationsToday}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Nye henvendelser</div>
            <div className="stat-value">{stats.newInquiries}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Åpne henvendelser</div>
            <div className="stat-value">{stats.openInquiries}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Løst i dag</div>
            <div className="stat-value">{stats.resolvedToday}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginTop: '24px' }}>
          {/* Daily Activity Chart */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Aktivitet siste 7 dager</h2>
            </div>
            <div style={{ padding: '32px' }}>
              <BarChart />
            </div>
          </div>

          {/* Pie Chart */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Fordeling</h2>
            </div>
            <div style={{ padding: '32px', display: 'flex', justifyContent: 'center' }}>
              <PieChart />
            </div>
          </div>
        </div>

        {/* Recent Conversations */}
        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-header">
            <h2 className="card-title">Nylige samtaler</h2>
          </div>

          {recentConversations && recentConversations.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Kunde</th>
                    <th>E-post</th>
                    <th>Telefon</th>
                    <th>Opprettet</th>
                  </tr>
                </thead>
                <tbody>
                  {recentConversations.map((conv) => (
                    <tr
                      key={conv.id}
                      onClick={() => router.push(`/conversations/${conv.id}`)}
                      style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-subtle)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td>{conv.visitor_name || 'Gjest'}</td>
                      <td>{conv.visitor_email || '-'}</td>
                      <td>{conv.visitor_phone || '-'}</td>
                      <td>{new Date(conv.created_at).toLocaleDateString('no-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="empty-state-title">Ingen samtaler ennå</div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
