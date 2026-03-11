'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { revalidatePath } from 'next/cache'

export async function createUser(formData) {
    const supabaseAdmin = createAdminClient()
    const email = formData.get('email')
    const fullName = formData.get('fullName')
    const password = formData.get('password')
    const role = formData.get('role') || 'agent'

    if (!email || !password) {
        return { error: 'E-post og passord er påkrevd' }
    }

    try {
        // 1. Create user in Supabase Auth
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm for manually created users
            user_metadata: { full_name: fullName }
        })

        if (authError) throw authError

        // 2. Update profile with role and password change requirement
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update({
                role: role,
                must_change_password: true
            })
            .eq('id', authUser.user.id)

        if (profileError) throw profileError

        // 3. Send welcome email
        try {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://elesco-trondheim.vercel.app'
            const webhookUrl = process.env.N8N_NOTIFICATION_WEBHOOK_URL || 'https://n8n.helkrypt.no/webhook/elesco-trondheim'

            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: email,
                    from: '"Elesco Trondheim" <chatbot@cityrtv.no>',
                    subject: 'Velkommen til Elesco Trondheim Dashboard',
                    html: `
                        <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
                            <div style="background: #0284c7; padding: 20px 24px; border-radius: 8px 8px 0 0;">
                                <h1 style="color: white; margin: 0; font-size: 20px;">Velkommen til Elesco Trondheim!</h1>
                            </div>
                            <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                                <p>Hei ${fullName || 'der'},</p>
                                <p>En administrator har opprettet en bruker for deg i Elesco Trondheim Dashboard.</p>
                                
                                <div style="background: white; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
                                    <p style="margin: 0 0 8px 0;"><strong>Dine innloggingsdetaljer:</strong></p>
                                    <p style="margin: 4px 0;"><strong>E-post:</strong> ${email}</p>
                                    <p style="margin: 4px 0;"><strong>Midlertidig passord:</strong> ${password}</p>
                                    <p style="margin: 4px 0;"><strong>Rolle:</strong> ${role === 'sysadmin' ? 'Systemadministrator' : role === 'admin' ? 'Administrator' : 'Kundeservice Agent'}</p>
                                </div>

                                <p style="color: #dc2626; font-weight: 600;">⚠️ Viktig: Du vil bli bedt om å endre passordet ditt ved første innlogging.</p>
                                
                                <a href="${appUrl}/login" style="background: #0284c7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500; margin-top: 16px;">
                                    Logg inn nå
                                </a>
                                
                                <p style="margin-top: 24px; font-size: 14px; color: #6b7280;">
                                    Hvis du har problemer med å logge inn, ta kontakt med din administrator.
                                </p>
                            </div>
                        </div>
                    `
                })
            })
        } catch (emailError) {
            console.error('Failed to send welcome email:', emailError)
            // Don't fail the user creation if email fails
        }

        revalidatePath('/users')
        return { success: true }
    } catch (error) {
        console.error('Error creating user:', error)
        return { error: error.message }
    }
}

export async function deleteUser(userId) {
    const supabaseAdmin = createAdminClient()

    try {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
        if (error) throw error

        revalidatePath('/users')
        return { success: true }
    } catch (error) {
        console.error('Error deleting user:', error)
        return { error: error.message }
    }
}

export async function updateUserRole(userId, newRole) {
    const supabaseAdmin = createAdminClient()

    try {
        const { error } = await supabaseAdmin
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId)

        if (error) throw error

        revalidatePath('/users')
        return { success: true }
    } catch (error) {
        console.error('Error updating user role:', error)
        return { error: error.message }
    }
}

export async function resetUserPassword(userId, userEmail, userName, newPassword) {
    const supabaseAdmin = createAdminClient()

    try {
        // 1. Update user password in Supabase Auth
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
            userId,
            { password: newPassword }
        )

        if (authError) throw authError

        // 2. Set must_change_password flag
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update({ must_change_password: true })
            .eq('id', userId)

        if (profileError) throw profileError

        // 3. Send email notification to user
        try {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://elesco-trondheim.vercel.app'
            const webhookUrl = process.env.N8N_NOTIFICATION_WEBHOOK_URL || 'https://n8n.helkrypt.no/webhook/elesco-trondheim'

            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: userEmail,
                    from: '"Elesco Trondheim" <chatbot@cityrtv.no>',
                    subject: 'Ditt passord har blitt tilbakestilt',
                    html: `
                        <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
                            <div style="background: #0284c7; padding: 20px 24px; border-radius: 8px 8px 0 0;">
                                <h1 style="color: white; margin: 0; font-size: 20px;">Passord tilbakestilt</h1>
                            </div>
                            <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                                <p>Hei ${userName || 'der'},</p>
                                <p>En administrator har tilbakestilt passordet ditt for Elesco Trondheim Dashboard.</p>
                                
                                <div style="background: white; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
                                    <p style="margin: 0 0 8px 0;"><strong>Dine nye innloggingsdetaljer:</strong></p>
                                    <p style="margin: 4px 0;"><strong>E-post:</strong> ${userEmail}</p>
                                    <p style="margin: 4px 0;"><strong>Midlertidig passord:</strong> ${newPassword}</p>
                                </div>

                                <p style="color: #dc2626; font-weight: 600;">⚠️ Viktig: Du vil bli bedt om å endre passordet ditt ved neste innlogging.</p>
                                
                                <a href="${appUrl}/login" style="background: #0284c7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500; margin-top: 16px;">
                                    Logg inn nå
                                </a>
                                
                                <p style="margin-top: 24px; font-size: 14px; color: #6b7280;">
                                    Hvis du ikke har bedt om denne endringen, ta kontakt med din administrator umiddelbart.
                                </p>
                            </div>
                        </div>
                    `
                })
            })
        } catch (emailError) {
            console.error('Failed to send password reset email:', emailError)
            // Don't fail the password reset if email fails
        }

        revalidatePath('/users')
        return { success: true }
    } catch (error) {
        console.error('Error resetting user password:', error)
        return { error: error.message }
    }
}
