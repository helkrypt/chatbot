import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (id) {
            const { data, error } = await supabase
                .from('conversations')
                .select('*')
                .eq('id', id)
                .single();

            if (error) {
                return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
            }
            return NextResponse.json(data);
        } else {
            const { data, error } = await supabase
                .from('conversations')
                .select('*')
                .order('updated_at', { ascending: false });

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
        const { id, status, visitor_name, visitor_email, visitor_phone, visitor_address } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 });
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
