import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
    try {
        const { conversation_id, role, content, file_url, client_id } = await request.json();

        if (!conversation_id || !role || !content) {
            return NextResponse.json(
                { error: 'conversation_id, role, and content are required' },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from('messages')
            .insert([
                {
                    conversation_id,
                    role,
                    content,
                    file_url,
                    client_id: client_id || null,
                    created_at: new Date().toISOString()
                }
            ])
            .select()
            .single();

        if (error) {
            console.error('Supabase error:', error);
            return NextResponse.json(
                { error: 'Failed to create message', details: error.message },
                { status: 500 }
            );
        }

        // Update updated_at
        await supabase
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversation_id);

        return NextResponse.json(data);

    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const conversation_id = searchParams.get('conversation_id');

        if (!conversation_id) {
            return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversation_id)
            .order('created_at', { ascending: true });

        if (error) {
            return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
