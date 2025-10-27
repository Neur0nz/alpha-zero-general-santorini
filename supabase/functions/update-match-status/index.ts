import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface UpdateMatchStatusRequest {
  matchId: string;
  status: 'completed' | 'abandoned';
  winnerId?: string | null;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization token' }, { status: 401 });
  }
  const token = authHeader.replace('Bearer ', '').trim();

  let payload: UpdateMatchStatusRequest;
  try {
    payload = (await req.json()) as UpdateMatchStatusRequest;
  } catch (error) {
    return jsonResponse({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload?.matchId) {
    return jsonResponse({ error: 'Missing match identifier' }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Verify auth
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
  }

  // Update match status
  const updateData: any = {
    status: payload.status,
    updated_at: new Date().toISOString(),
  };

  if (payload.winnerId !== undefined) {
    updateData.winner_id = payload.winnerId;
  }

  const { error: updateError } = await supabase
    .from('matches')
    .update(updateData)
    .eq('id', payload.matchId);

  if (updateError) {
    console.error('Failed to update match status', updateError);
    return jsonResponse({ error: 'Failed to update match status' }, { status: 500 });
  }

  return jsonResponse({ success: true }, { status: 200 });
});

