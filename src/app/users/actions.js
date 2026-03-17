'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { revalidatePath } from 'next/cache'
import { sendWelcomeEmail, sendPasswordResetEmail } from '@/lib/n8n'

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

        // 3. Send welcome email via n8n
        try {
            await sendWelcomeEmail({
                to: email,
                name: fullName || email,
                role,
                clientId: 'elesco-trondheim',
                clientName: 'Elesco Trondheim',
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

        // 3. Send password reset notification via n8n
        try {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.helkrypt.no'
            await sendPasswordResetEmail({
                to: userEmail,
                name: userName || userEmail,
                resetUrl: `${appUrl}/login`,
                expiresInMinutes: 0, // Admin-reset — no expiry
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
