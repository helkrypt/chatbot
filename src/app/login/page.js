'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [isFirstUser, setIsFirstUser] = useState(false)
    const [checkingUsers, setCheckingUsers] = useState(true)

    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        checkFirstUser()
    }, [])

    const checkFirstUser = async () => {
        try {
            const { data: count, error } = await supabase.rpc('get_user_count')

            if (error) throw error

            setIsFirstUser(count === 0)
        } catch (err) {
            console.error('Error checking user count:', err)
            // Function might not exist or connection error, default to false to be safe, 
            // or handle gracefully. For now, matching previous behavior but logging error.
            setIsFirstUser(false)
        }
        setCheckingUsers(false)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            if (isFirstUser) {
                // Sign up first user as admin
                const { data, error: signUpError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: fullName
                        }
                    }
                })

                if (signUpError) throw signUpError

                // The trigger in Supabase will create the profile with admin role
                router.push('/')
            } else {
                // Regular sign in
                const { data, error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })

                if (signInError) throw signInError

                router.push('/')
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    if (checkingUsers) {
        return (
            <div className="login-container">
                <div className="login-card">
                    <div className="loading">
                        <div className="spinner"></div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-logo">
                    <div className="sidebar-logo-icon" style={{ background: '#00c9b7' }}>E</div>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '24px', fontWeight: 700 }}>
                        Elesco
                    </span>
                </div>

                <h1 className="login-title">
                    {isFirstUser ? 'Opprett systemadministrator' : 'Logg inn'}
                </h1>
                <p className="login-subtitle">
                    {isFirstUser
                        ? 'Første bruker registreres som systemadministrator med full tilgang'
                        : 'Logg inn for å administrere kundeservice'}
                </p>

                <form onSubmit={handleSubmit}>
                    {isFirstUser && (
                        <div className="form-group">
                            <label className="form-label">Fullt navn</label>
                            <input
                                type="text"
                                className="form-input"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="Ola Nordmann"
                                required
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">E-post</label>
                        <input
                            type="email"
                            className="form-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="din@epost.no"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Passord</label>
                        <input
                            type="password"
                            className="form-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            minLength={6}
                            required
                        />
                    </div>

                    {error && (
                        <div style={{
                            color: '#ef4444',
                            fontSize: '14px',
                            marginBottom: '16px',
                            padding: '12px',
                            background: '#fef2f2',
                            borderRadius: '8px'
                        }}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '14px' }}
                        disabled={loading}
                    >
                        {loading ? 'Vennligst vent...' : (isFirstUser ? 'Opprett konto' : 'Logg inn')}
                    </button>
                </form>
            </div>
        </div>
    )
}
