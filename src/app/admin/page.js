import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import Sidebar from '@/components/Sidebar'
import Link from 'next/link'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'sysadmin') redirect('/')

  const { data: clients } = await admin
    .from('clients')
    .select('id, name, plan, modules, active, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Helkrypt AI — Kundeadmin</h1>
          <Link href="/admin/clients/new" className="btn btn-primary">
            + Ny kunde
          </Link>
        </div>

        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Bedrift</th>
                  <th>ID</th>
                  <th>Pakke</th>
                  <th>Moduler</th>
                  <th>Status</th>
                  <th>Opprettet</th>
                </tr>
              </thead>
              <tbody>
                {clients?.map(c => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/admin/clients/${c.id}`} style={{ color: 'var(--color-accent)', fontWeight: '500' }}>
                        {c.name}
                      </Link>
                    </td>
                    <td>
                      <code style={{ fontSize: '12px', background: 'var(--color-bg-subtle)', padding: '2px 6px', borderRadius: '4px' }}>
                        {c.id}
                      </code>
                    </td>
                    <td>{c.plan}</td>
                    <td style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      {c.modules?.join(', ') || '—'}
                    </td>
                    <td>
                      <span style={{
                        fontSize: '12px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: c.active ? '#d1fae5' : '#f3f4f6',
                        color: c.active ? '#065f46' : '#6b7280',
                      }}>
                        {c.active ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      {new Date(c.created_at).toLocaleDateString('no-NO')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
