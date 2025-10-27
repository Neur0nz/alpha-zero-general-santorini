import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { SantoriniEngine, SantoriniStateSnapshot } from '../_shared/santorini.ts';

interface SantoriniMoveAction {
  kind: 'santorini.move';
  move: number;
  by?: 'creator' | 'opponent';
  clocks?: { creatorMs?: number; opponentMs?: number } | null;
}

interface SubmitMoveRequest {
  matchId?: string;
  moveIndex?: number;
  action?: SantoriniMoveAction;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase configuration environment variables');
}

function jsonResponse(body: Record<string, unknown>, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 
      'content-type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    ...init,
  });
}

function sanitizeClocks(value: unknown): { creatorMs: number; opponentMs: number } | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const clocks = value as Record<string, unknown>;
  const creator = Number(clocks.creatorMs);
  const opponent = Number(clocks.opponentMs);
  if (!Number.isFinite(creator) || !Number.isFinite(opponent)) {
    return undefined;
  }
  return {
    creatorMs: Math.max(0, Math.round(creator)),
    opponentMs: Math.max(0, Math.round(opponent)),
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return jsonResponse({}, { status: 200 });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization token' }, { status: 401 });
  }
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return jsonResponse({ error: 'Invalid authorization token' }, { status: 401 });
  }

  let payload: SubmitMoveRequest;
  try {
    payload = (await req.json()) as SubmitMoveRequest;
  } catch (error) {
    console.error('Failed to parse submit-move payload', error);
    return jsonResponse({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload?.matchId || typeof payload.matchId !== 'string') {
    return jsonResponse({ error: 'Missing match identifier' }, { status: 400 });
  }
  if (!payload.action || payload.action.kind !== 'santorini.move') {
    return jsonResponse({ error: 'Unsupported action payload' }, { status: 400 });
  }
  if (!Number.isInteger(payload.action.move) || payload.action.move < 0) {
    return jsonResponse({ error: 'Move must be a non-negative integer' }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    console.error('Failed to authenticate request token', authError);
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('players')
    .select('id')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    console.error('Player profile missing for auth user', profileError);
    return jsonResponse({ error: 'Player profile not found' }, { status: 403 });
  }

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('id, creator_id, opponent_id, status, winner_id, initial_state')
    .eq('id', payload.matchId)
    .maybeSingle();

  if (matchError || !match) {
    console.error('Unable to load match', matchError);
    return jsonResponse({ error: 'Match not found' }, { status: 404 });
  }

  if (!match.opponent_id) {
    return jsonResponse({ error: 'Match has not been joined yet' }, { status: 409 });
  }

  if (match.status === 'completed' || match.status === 'abandoned') {
    return jsonResponse({ error: 'Match can no longer accept moves' }, { status: 409 });
  }

  const playerId = profile.id as string;
  const isCreator = playerId === match.creator_id;
  const isOpponent = playerId === match.opponent_id;
  if (!isCreator && !isOpponent) {
    return jsonResponse({ error: 'You are not a participant in this match' }, { status: 403 });
  }

  if (!match.initial_state) {
    console.error('Match is missing initial state snapshot');
    return jsonResponse({ error: 'Match state is unavailable' }, { status: 500 });
  }

  let engine: SantoriniEngine;
  try {
    console.log('Building engine from initial state:', JSON.stringify(match.initial_state, null, 2));
    engine = SantoriniEngine.fromSnapshot(match.initial_state as SantoriniStateSnapshot);
    console.log('Engine created successfully, current player:', engine.player);
  } catch (error) {
    console.error('Failed to build engine from initial state', error);
    console.error('Initial state was:', JSON.stringify(match.initial_state, null, 2));
    return jsonResponse({ error: 'Match state is corrupted' }, { status: 500 });
  }

  const { data: existingMoves, error: movesError } = await supabase
    .from('match_moves')
    .select('id, move_index, action')
    .eq('match_id', match.id)
    .order('move_index', { ascending: true });

  if (movesError) {
    console.error('Failed to load existing moves', movesError);
    return jsonResponse({ error: 'Unable to load move history' }, { status: 500 });
  }

  let expectedMoveIndex = 0;
  if (Array.isArray(existingMoves)) {
    for (const record of existingMoves) {
      if (!Number.isInteger(record.move_index) || record.move_index !== expectedMoveIndex) {
        console.error('Detected inconsistent move history ordering', record);
        return jsonResponse({ error: 'Match history is inconsistent' }, { status: 500 });
      }
      const action = record.action as SantoriniMoveAction | null;
      if (action?.kind === 'santorini.move' && Number.isInteger(action.move)) {
        try {
          engine.applyMove(action.move);
        } catch (error) {
          console.error('Detected invalid historical move', error);
          return jsonResponse({ error: 'Existing move history failed validation' }, { status: 500 });
        }
      }
      expectedMoveIndex += 1;
    }
  }

  console.log('Move index validation - payload:', payload.moveIndex, 'expected:', expectedMoveIndex);
  if (typeof payload.moveIndex === 'number' && payload.moveIndex !== expectedMoveIndex) {
    console.error('Move index mismatch - payload:', payload.moveIndex, 'expected:', expectedMoveIndex);
    return jsonResponse({ error: 'Move index out of sequence' }, { status: 409 });
  }

  const actingPlayerIndex = engine.player;
  if (actingPlayerIndex === 0 && !isCreator) {
    return jsonResponse({ error: "It is the creator's turn" }, { status: 403 });
  }
  if (actingPlayerIndex === 1 && !isOpponent) {
    return jsonResponse({ error: "It is the opponent's turn" }, { status: 403 });
  }

  const sanitizedClocks = sanitizeClocks(payload.action.clocks ?? undefined);

  let applyResult;
  try {
    console.log('Applying move:', payload.action.move, 'for player:', actingPlayerIndex);
    console.log('Engine state before move - player:', engine.player, 'validMoves count:', engine.validMoves.filter(v => v).length);
    applyResult = engine.applyMove(payload.action.move);
    console.log('Move applied successfully, winner:', applyResult.winner);
  } catch (error) {
    console.error('Rejected illegal move', error);
    console.error('Move was:', payload.action.move, 'Player:', actingPlayerIndex);
    console.error('Engine player:', engine.player);
    return jsonResponse({ error: 'Illegal move' }, { status: 422 });
  }

  const actionRecord: SantoriniMoveAction = {
    kind: 'santorini.move',
    move: payload.action.move,
    by: actingPlayerIndex === 0 ? 'creator' : 'opponent',
    clocks: sanitizedClocks ?? undefined,
  };

  const insertPayload = {
    match_id: match.id,
    move_index: expectedMoveIndex,
    player_id: playerId,
    action: actionRecord,
    state_snapshot: applyResult.snapshot,
  };

  const { data: insertedMove, error: insertError } = await supabase
    .from('match_moves')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insertError || !insertedMove) {
    console.error('Failed to persist move', insertError);
    return jsonResponse({ error: 'Failed to store move' }, { status: 500 });
  }

  let winnerId: string | null = null;
  if (applyResult.winner === 0) {
    winnerId = match.creator_id;
  } else if (applyResult.winner === 1) {
    winnerId = match.opponent_id;
  }

  if (winnerId && winnerId !== match.winner_id) {
    const { error: updateError } = await supabase
      .from('matches')
      .update({ status: 'completed', winner_id: winnerId })
      .eq('id', match.id);
    if (updateError) {
      console.error('Failed to mark match as completed', updateError);
    }
  }

  return jsonResponse({ move: insertedMove, snapshot: applyResult.snapshot });
});
