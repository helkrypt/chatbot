'use client'

import { useState } from 'react'
import { createUser, deleteUser, updateUserRole, resetUserPassword } from './actions'

export default function UserList({ initialUsers, currentUserId, currentUserRole }) {
    const [users, setUsers] = useState(initialUsers)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isPasswordResetModalOpen, setIsPasswordResetModalOpen] = useState(false)
    const [selectedUser, setSelectedUser] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const [activeMenu, setActiveMenu] = useState(null)
    const [error, setError] = useState('')

    // Toggle dropdown menu
    const toggleMenu = (userId, e) => {
        e.stopPropagation()
        setActiveMenu(activeMenu === userId ? null : userId)
    }

    // Close menu when clicking outside
    const closeMenu = () => setActiveMenu(null)

    // Handle form submission
    const handleCreateUser = async (e) => {
        e.preventDefault()
        setIsLoading(true)
        setError('')

        const formData = new FormData(e.target)

        const result = await createUser(formData)

        if (result.error) {
            setError(result.error)
        } else {
            setIsModalOpen(false)
            // Refresh logic usually handled by revalidatePath via server action, 
            // but for immediate UI feedback we might initially trust the server re-render
            // or just reload the page to be simple since we are in a server component architecture
            window.location.reload()
        }
        setIsLoading(false)
    }

    const handleDelete = async (userId) => {
        if (!confirm('Er du sikker på at du vil slette denne brukeren?')) return

        const result = await deleteUser(userId)
        if (result.error) {
            alert('Feil ved sletting: ' + result.error)
        } else {
            window.location.reload()
        }
    }

    const handleRoleChange = async (userId, newRole) => {
        const result = await updateUserRole(userId, newRole)
        if (result.error) {
            alert('Feil ved endring av rolle: ' + result.error)
        } else {
            setActiveMenu(null)
            window.location.reload()
        }
    }

    const handleOpenPasswordReset = (user) => {
        setSelectedUser(user)
        setIsPasswordResetModalOpen(true)
        setActiveMenu(null)
    }

    const handlePasswordReset = async (e) => {
        e.preventDefault()
        setIsLoading(true)
        setError('')

        const formData = new FormData(e.target)
        const newPassword = formData.get('newPassword')

        const result = await resetUserPassword(
            selectedUser.id,
            selectedUser.email,
            selectedUser.full_name,
            newPassword
        )

        if (result.error) {
            setError(result.error)
        } else {
            setIsPasswordResetModalOpen(false)
            setSelectedUser(null)
            alert('Passord tilbakestilt! Brukeren har fått e-post med det nye passordet.')
        }
        setIsLoading(false)
    }

    return (
        <div onClick={closeMenu}>
            <div className="page-header">
                <h1 className="page-title">Brukere</h1>
                <button
                    className="btn btn-primary"
                    onClick={(e) => {
                        e.stopPropagation()
                        setIsModalOpen(true)
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                    Legg til bruker
                </button>
            </div>

            <div className="card">
                {users && users.length > 0 ? (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Navn</th>
                                    <th>E-post</th>
                                    <th>Rolle</th>
                                    <th>Opprettet</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id}>
                                        <td>{u.full_name || '-'}</td>
                                        <td>{u.email}</td>
                                        <td>
                                            <span className={`status-badge ${u.role === 'sysadmin' ? 'sysadmin' : u.role === 'admin' ? 'escalated' : 'active'}`}>
                                                {u.role === 'sysadmin' ? 'Systemadmin' : u.role === 'admin' ? 'Administrator' : 'Agent'}
                                            </span>
                                        </td>
                                        <td>{new Date(u.created_at).toLocaleDateString('no-NO')}</td>
                                        <td style={{ position: 'relative' }}>
                                            <button
                                                className="btn btn-ghost"
                                                style={{ padding: '6px' }}
                                                onClick={(e) => toggleMenu(u.id, e)}
                                                disabled={u.id === currentUserId || u.role === 'sysadmin'}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <circle cx="12" cy="12" r="1" />
                                                    <circle cx="19" cy="12" r="1" />
                                                    <circle cx="5" cy="12" r="1" />
                                                </svg>
                                            </button>

                                            {activeMenu === u.id && (
                                                <div className="dropdown-menu" style={{
                                                    position: 'absolute',
                                                    right: '0',
                                                    top: '100%',
                                                    background: 'white',
                                                    border: '1px solid #e5e7eb',
                                                    borderRadius: '8px',
                                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                                    zIndex: 10,
                                                    minWidth: '150px',
                                                    overflow: 'hidden'
                                                }}>
                                                    {/* Role change options based on hierarchy */}
                                                    {currentUserRole === 'sysadmin' && u.role !== 'admin' && (
                                                        <button
                                                            className="dropdown-item"
                                                            onClick={() => handleRoleChange(u.id, 'admin')}
                                                            style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px' }}
                                                        >
                                                            Gjør til admin
                                                        </button>
                                                    )}
                                                    {currentUserRole === 'sysadmin' && u.role === 'admin' && (
                                                        <button
                                                            className="dropdown-item"
                                                            onClick={() => handleRoleChange(u.id, 'agent')}
                                                            style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px' }}
                                                        >
                                                            Gjør til agent
                                                        </button>
                                                    )}
                                                    {/* Admin can only toggle agent role (not promote to admin) */}
                                                    {currentUserRole === 'admin' && u.role === 'agent' && (
                                                        <button
                                                            className="dropdown-item"
                                                            onClick={() => handleRoleChange(u.id, 'admin')}
                                                            style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px' }}
                                                        >
                                                            Gjør til admin
                                                        </button>
                                                    )}
                                                    <button
                                                        className="dropdown-item"
                                                        onClick={() => handleOpenPasswordReset(u)}
                                                        style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', borderTop: '1px solid #f3f4f6' }}
                                                    >
                                                        Endre passord
                                                    </button>
                                                    <button
                                                        className="dropdown-item"
                                                        onClick={() => handleDelete(u.id)}
                                                        style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '14px', borderTop: '1px solid #f3f4f6' }}
                                                    >
                                                        Slett bruker
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="empty-state-title">Ingen brukere</div>
                        <div className="empty-state-text">
                            Legg til brukere for å gi dem tilgang til dashboardet
                        </div>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
                }} onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content" style={{
                        background: 'white', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '400px'
                    }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Legg til ny bruker</h2>

                        <form onSubmit={handleCreateUser}>
                            <div className="form-group">
                                <label className="form-label">Fullt navn</label>
                                <input name="fullName" type="text" className="form-input" placeholder="Navn Navnesen" required />
                            </div>

                            <div className="form-group">
                                <label className="form-label">E-post</label>
                                <input name="email" type="email" className="form-input" placeholder="epost@eksempel.no" required />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Passord</label>
                                <input name="password" type="password" className="form-input" placeholder="Min. 6 tegn" minLength={6} required />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Rolle</label>
                                <select name="role" className="form-input">
                                    <option value="agent">Kundeservice Agent</option>
                                    {currentUserRole === 'sysadmin' && (
                                        <option value="admin">Administrator</option>
                                    )}
                                </select>
                            </div>

                            {error && <p style={{ color: 'red', fontSize: '14px', marginBottom: '10px' }}>{error}</p>}

                            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)} style={{ flex: 1 }}>Avbryt</button>
                                <button type="submit" className="btn btn-primary" disabled={isLoading} style={{ flex: 1 }}>
                                    {isLoading ? 'Oppretter...' : 'Opprett bruker'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isPasswordResetModalOpen && selectedUser && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
                }} onClick={() => setIsPasswordResetModalOpen(false)}>
                    <div className="modal-content" style={{
                        background: 'white', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '400px'
                    }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>Tilbakestill passord</h2>
                        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                            Opprett et midlertidig passord for <strong>{selectedUser.full_name || selectedUser.email}</strong>.
                            Brukeren vil bli tvunget til å endre passordet ved neste innlogging.
                        </p>

                        <form onSubmit={handlePasswordReset}>
                            <div className="form-group">
                                <label className="form-label">Midlertidig passord</label>
                                <input
                                    name="newPassword"
                                    type="text"
                                    className="form-input"
                                    placeholder="Min. 6 tegn"
                                    minLength={6}
                                    required
                                    autoComplete="off"
                                />
                                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                    💡 Tips: Bruk et enkelt passord som "Elesco2026" - brukeren må endre det uansett
                                </p>
                            </div>

                            {error && <p style={{ color: 'red', fontSize: '14px', marginBottom: '10px' }}>{error}</p>}

                            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setIsPasswordResetModalOpen(false)} style={{ flex: 1 }}>Avbryt</button>
                                <button type="submit" className="btn btn-primary" disabled={isLoading} style={{ flex: 1 }}>
                                    {isLoading ? 'Tilbakestiller...' : 'Tilbakestill passord'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
