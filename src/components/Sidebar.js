'use client'

import Link from 'next/link'
import { usePathname, useSearchParams, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEffect, useState, Suspense } from 'react'

// Icons as SVG components
const DashboardIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
)

const ChatIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
)

const UsersIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
)

const SettingsIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
    </svg>
)

const LogoutIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
)

const InboxIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
)

const BuildingIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </svg>
)

const XIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
)

// SYSADMIN-navigasjon — kun kunder-oversikt
const sysadminNavItems = [
    { href: '/admin', label: 'Kunder', icon: BuildingIcon },
]

// KLIENT-navigasjon — vises for admin og agent
const clientNavItems = [
    { href: '/dashboard/[clientId]', label: 'Dashboard', icon: DashboardIcon },
    { href: '/conversations', label: 'Samtaler', icon: ChatIcon },
    { href: '/inquiries', label: 'Henvendelser', icon: InboxIcon },
    { href: '/users', label: 'Brukere', icon: UsersIcon },
    { href: '/settings', label: 'Innstillinger', icon: SettingsIcon },
]

function SidebarInner({ isOpen, onClose }) {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const params = useParams()
    const [user, setUser] = useState(null)
    const [profile, setProfile] = useState(null)
    const [client, setClient] = useState(null)
    const supabase = createClient()

    const isInspecting = searchParams.get('inspect') === 'true'
    const urlClientId = params?.clientId || searchParams.get('client_id')

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            setUser(user)

            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single()
                setProfile(profile)

                if (profile?.client_id && profile.role !== 'sysadmin') {
                    const { data: clientData } = await supabase
                        .from('clients')
                        .select('name')
                        .eq('id', profile.client_id)
                        .single()
                    setClient(clientData)
                } else if (profile?.role === 'sysadmin') {
                    // In inspect mode, fetch the inspected client's name
                    const inspectedId = params?.clientId || searchParams.get('client_id')
                    if (inspectedId) {
                        const { data: clientData } = await supabase
                            .from('clients')
                            .select('name')
                            .eq('id', inspectedId)
                            .single()
                        setClient(clientData)
                    }
                }
            }
        }
        getUser()
    }, [])

    const handleLogout = async () => {
        await supabase.auth.signOut()
        window.location.href = '/login'
    }

    const getInitials = (name) => {
        if (!name) return user?.email?.[0]?.toUpperCase() || 'U'
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }

    // Bestem hvilken meny som skal vises
    const navToShow = (profile?.role === 'sysadmin' && !isInspecting)
        ? sysadminNavItems
        : clientNavItems

    // Bestem hvilken clientId som gjelder for lenker
    const effectiveClientId = isInspecting ? urlClientId : profile?.client_id

    // Bygg riktige hrefs
    const resolvedNavItems = navToShow.map(item => {
        let href = item.href
        if (href === '/dashboard/[clientId]') {
            href = effectiveClientId ? `/dashboard/${effectiveClientId}` : '/dashboard'
            if (isInspecting && effectiveClientId) href += `?inspect=true`
        } else if (isInspecting && effectiveClientId) {
            // Inspect-modus: legg til inspect + client_id som query params
            href = `${href}?inspect=true&client_id=${effectiveClientId}`
        }
        return { ...item, href }
    })

    // Filtrer brukere/innstillinger for agent-rolle
    const filteredNavItems = resolvedNavItems.filter(item => {
        if (profile?.role === 'agent') {
            if (item.label === 'Brukere' || item.label === 'Innstillinger') return false
        }
        return true
    })

    return (
        <>
            <div
                className={`sidebar-overlay ${isOpen ? 'visible' : ''}`}
                onClick={onClose}
            />
            <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <div className="sidebar-logo-icon">H</div>
                        <span className="sidebar-logo-text">
                            {profile?.role === 'sysadmin' && !isInspecting
                                ? 'Helkrypt AI'
                                : (client?.name || 'Helkrypt AI')}
                        </span>
                    </div>
                    <button className="close-sidebar" onClick={onClose} aria-label="Lukk meny">
                        <XIcon />
                    </button>
                </div>

                <nav className="sidebar-nav">
                    <div className="nav-section">
                        <div className="nav-section-title">Hovedmeny</div>
                        {filteredNavItems.map((item) => {
                            const Icon = item.icon
                            const hrefBase = item.href.split('?')[0]
                            const isActive = pathname === hrefBase ||
                                (hrefBase !== '/' && hrefBase !== '/admin' && pathname.startsWith(hrefBase))

                            return (
                                <Link
                                    key={item.label}
                                    href={item.href}
                                    className={`nav-link ${isActive ? 'active' : ''}`}
                                    onClick={onClose}
                                >
                                    <Icon />
                                    <span>{item.label}</span>
                                </Link>
                            )
                        })}
                    </div>
                </nav>

                <div className="sidebar-footer">
                    <div className="user-info">
                        <div className="user-avatar">
                            {getInitials(profile?.full_name)}
                        </div>
                        <div className="user-details">
                            <div className="user-name">
                                {profile?.full_name || user?.email || 'Laster...'}
                            </div>
                            <div className="user-role">
                                {profile?.role === 'sysadmin' ? 'Systemadministrator' : profile?.role === 'admin' ? 'Administrator' : 'Agent'}
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="logout-button"
                            title="Logg ut"
                        >
                            <LogoutIcon />
                        </button>
                    </div>
                </div>
            </aside>
        </>
    )
}

export default function Sidebar({ isOpen, onClose }) {
    return (
        <Suspense fallback={null}>
            <SidebarInner isOpen={isOpen} onClose={onClose} />
        </Suspense>
    )
}
