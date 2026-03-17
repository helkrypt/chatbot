import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Hjelpefunksjon: hent innlogget brukers profil med client_id og rolle
async function getAuthProfile() {
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return null;

    const admin = createAdminClient();
    const { data: profile } = await admin
        .from('profiles')
        .select('role, client_id')
        .eq('id', user.id)
        .single();

    return profile ? { ...profile, userId: user.id } : null;
}

export async function POST(request) {
    const auth = request.headers.get('authorization');
    if (!auth || auth !== `Bearer ${process.env.INTERNAL_API_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { visitor_name, visitor_email, visitor_phone, visitor_address, status = 'active', client_id } = await request.json();

        const { data, error } = await supabase
            .from('conversations')
            .insert([
                {
                    visitor_name,
                    visitor_email,
                    visitor_phone,
                    visitor_address,
                    status,
                    client_id: client_id || null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }
            ])
            .select()
            .single();

        if (error) {
            console.error('Supabase error:', error);
            return NextResponse.json(
                { error: 'Failed to create conversation', details: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json(data);

    } catch (error) {
        console.error('Conversations API error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        );
    }
}

export async function GET(request) {
    try {
        const profile = await getAuthProfile();
        if (!profile) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (id) {
            let query = supabase.from('conversations').select('*').eq('id', id);
            // Ikke-sysadmin kan kun se egne klienters samtaler
            if (profile.role !== 'sysadmin') {
                query = query.eq('client_id', profile.client_id);
            }
            const { data, error } = await query.single();

            if (error) {
                return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
            }
            return NextResponse.json(data);
        } else {
            let query = supabase.from('conversations').select('*').order('updated_at', { ascending: false });
            if (profile.role !== 'sysadmin') {
                query = query.eq('client_id', profile.client_id);
            }
            const { data, error } = await query;

            if (error) {
                return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
            }
            return NextResponse.json(data);
        }
    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const profile = await getAuthProfile();
        if (!profile) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, status, visitor_name, visitor_email, visitor_phone, visitor_address } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 });
        }

        // Verifiser at samtalen tilhører brukerens klient
        if (profile.role !== 'sysadmin') {
            const { data: conv } = await supabase
                .from('conversations')
                .select('client_id')
                .eq('id', id)
                .single();
            if (!conv || conv.client_id !== profile.client_id) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        const updateData = { updated_at: new Date().toISOString() };
        if (status) updateData.status = status;
        if (visitor_name) updateData.visitor_name = visitor_name;
        if (visitor_email) updateData.visitor_email = visitor_email;
        if (visitor_phone) updateData.visitor_phone = visitor_phone;
        if (visitor_address) updateData.visitor_address = visitor_address;

        const { data, error } = await supabase
            .from('conversations')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 });
        }
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
