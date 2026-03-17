import { createClient } from '@/lib/supabase-server';
import { sendKollireturnNotification } from '@/lib/n8n';
import { NextResponse } from 'next/server';

// Trigger Kolliretur-notifikasjon for én enkelt retur
export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Ikke autorisert' }, { status: 401 });

  const {
    returnId,
    notificationType = 'both',
    customerEmail,
    customerName,
    storeEmail,
    productDescription,
    trackingNumber,
  } = await request.json();

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user.id)
    .single();

  try {
    await sendKollireturnNotification({
      notificationType,
      clientId: profile?.client_id,
      returnId,
      customerEmail,
      customerName,
      storeEmail,
      productDescription,
      trackingNumber,
    });
  } catch (err) {
    console.error('[Kolliretur] n8n notifikasjon feilet:', err);
    return NextResponse.json({ error: 'Notifikasjon feilet' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
