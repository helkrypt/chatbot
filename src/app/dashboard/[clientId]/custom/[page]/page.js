'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

// Module registry — add new modules here
const MODULE_PAGES = {
  'kolliretur': () => import('@/modules/kolliretur/pages/DashboardPage'),
}

export default function CustomModulePage() {
  const { clientId, page } = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [ModuleComponent, setModuleComponent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    checkAuthAndLoadModule()
  }, [clientId, page])

  const checkAuthAndLoadModule = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase.from('profiles').select('role, client_id').eq('id', user.id).single()
    if (!profile) { router.push('/login'); return }
    if (profile.role !== 'sysadmin' && profile.client_id !== clientId) { router.push('/'); return }

    // Check if client has this module enabled
    const { data: client } = await supabase.from('clients').select('modules').eq('id', clientId).single()
    if (!client?.modules?.includes(page)) { router.push(`/dashboard/${clientId}`); return }

    const loader = MODULE_PAGES[page]
    if (!loader) { router.push(`/dashboard/${clientId}`); return }

    const mod = await loader()
    setModuleComponent(() => mod.default)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="app-container">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <main className="main-content"><div className="loading"><div className="spinner"></div></div></main>
      </div>
    )
  }

  if (!ModuleComponent) return null

  return <ModuleComponent clientId={clientId} />
}
