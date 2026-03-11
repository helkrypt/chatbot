'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function PasswordChangeModal() {
    const [isOpen, setIsOpen] = useState(false)
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const supabase = createClient()

    useEffect(() => {
        checkPasswordChangeRequired()

        // Also listen for login events (useful when navigating from login page without full reload)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                checkPasswordChangeRequired()
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    const checkPasswordChangeRequired = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: profile } = await supabase
            .from('profiles')
            .select('must_change_password')
            .eq('id', user.id)
            .single()

        if (profile?.must_change_password) {
            setIsOpen(true)
        }
    }

    const handlePasswordChange = async (e) => {
        e.preventDefault()
        setError('')

        if (newPassword.length < 6) {
            setError('Passordet må være minst 6 tegn')
            return
        }

        if (newPassword !== confirmPassword) {
            setError('Passordene matcher ikke')
            return
        }

        setLoading(true)

        try {
            // Update password in Supabase Auth
            const { error: authError } = await supabase.auth.updateUser({
                password: newPassword
            })

            if (authError) throw authError

            // Update profile to remove password change requirement
            const { data: { user } } = await supabase.auth.getUser()
            const { error: profileError } = await supabase
                .from('profiles')
                .update({ must_change_password: false })
                .eq('id', user.id)

            if (profileError) throw profileError

            setIsOpen(false)
            alert('Passord oppdatert! Du kan nå bruke dashboardet.')
        } catch (err) {
            console.error('Password change error:', err)
            setError('Feil ved endring av passord: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
        }}>
            <div style={{
                background: 'white',
                padding: '32px',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '450px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}>
                <div style={{ marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
                        Endre passord
                    </h2>
                    <p style={{ color: '#6b7280', fontSize: '14px' }}>
                        Du må endre passordet ditt før du kan fortsette. Dette er et sikkerhetstiltak for nye brukere.
                    </p>
                </div>

                <form onSubmit={handlePasswordChange}>
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
                            Nytt passord
                        </label>
                        <input
                            type="password"
                            className="input-field"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Minimum 6 tegn"
                            minLength={6}
                            required
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
                            Bekreft nytt passord
                        </label>
                        <input
                            type="password"
                            className="input-field"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Skriv inn passordet på nytt"
                            minLength={6}
                            required
                            style={{ width: '100%' }}
                        />
                    </div>

                    {error && (
                        <div style={{
                            background: '#fee2e2',
                            border: '1px solid #fecaca',
                            color: '#dc2626',
                            padding: '12px',
                            borderRadius: '6px',
                            fontSize: '14px',
                            marginBottom: '16px'
                        }}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ width: '100%' }}
                    >
                        {loading ? 'Oppdaterer...' : 'Endre passord'}
                    </button>
                </form>

                <p style={{ marginTop: '16px', fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
                    ⚠️ Du kan ikke lukke dette vinduet før passordet er endret
                </p>
            </div>
        </div>
    )
}
