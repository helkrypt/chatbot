import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import Sidebar from '@/components/Sidebar'
import UserList from './UserList'

export default async function UsersPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Check if current user is admin
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'admin' && profile?.role !== 'sysadmin') {
        redirect('/')
    }

    const currentRole = profile.role

    // Fetch users — admin cannot see sysadmin users (sysadmin is a "ghost")
    let query = supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

    if (currentRole !== 'sysadmin') {
        query = query.neq('role', 'sysadmin')
    }

    const { data: users } = await query

    return (
        <div className="app-container">
            <Sidebar />
            <main className="main-content">
                <UserList initialUsers={users} currentUserId={user.id} currentUserRole={currentRole} />
            </main>
        </div>
    )
}
