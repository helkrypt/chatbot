import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifySysadmin } from '@/lib/n8n';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');
        const clientId = formData.get('client_id');

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        if (!clientId) {
            return NextResponse.json({ error: 'Missing client_id' }, { status: 401 });
        }

        // Valider at klienten finnes og er aktiv
        const { data: client } = await supabase
            .from('clients')
            .select('id')
            .eq('id', clientId)
            .eq('active', true)
            .single();

        if (!client) {
            return NextResponse.json({ error: 'Ugyldig eller inaktiv klient' }, { status: 401 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Create a unique filename scoped to client
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const filename = `${clientId}/${Date.now()}-${sanitizedName}`;

        // Upload to 'uploads' bucket defined in schema
        const { data, error } = await supabase.storage
            .from('uploads')
            .upload(filename, buffer, {
                contentType: file.type,
                upsert: false
            });

        if (error) {
            console.error('Storage error:', error);
            return NextResponse.json({ error: 'Upload failed', details: error.message }, { status: 500 });
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('uploads')
            .getPublicUrl(filename);

        return NextResponse.json({ url: publicUrl, filename });

    } catch (error) {
        console.error('Upload API error:', error);
        notifySysadmin({
            type: 'upload_error',
            title: 'Filopplasting feilet',
            details: error.message,
            severity: 'error',
        }).catch(() => {});
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
