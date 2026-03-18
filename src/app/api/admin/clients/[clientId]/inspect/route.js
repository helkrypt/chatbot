import { createClient } from '@/lib/supabase-server';
import { notifySysadmin } from '@/lib/n8n';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'sysadmin') {
    return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 });
  }

  const { clientId } = params;
  const { clientName } = await request.json();

  notifySysadmin({
    type: 'client_inspection',
    title: 'Klient inspisert av superadmin',
    details: `${user.email} inspiserte klient ${clientName}`,
    clientId,
    clientName,
    severity: 'info',
  }).catch(console.error);

  return NextResponse.json({ success: true });
}
