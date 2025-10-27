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
  const startTime = performance.now();
  console.log('⏱️ [START] submit-move request received');
  
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
  
  console.log(`⏱️ [${(performance.now() - startTime).toFixed(0)}ms] Payload parsed`);

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
  console.log(`⏱️ [${(performance.now() - startTime).toFixed(0)}ms] Supabase client created`);

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    console.error('Failed to authenticate request token', authError);
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
  }
  console.log(`⏱️ [${(performance.now() - startTime).toFixed(0)}ms] Auth verified`);

  // OPTIMIZATION: Combined query - profile + match + last move in ONE RPC call!
  const { data: moveData, error: moveDataError } = await supabase
    .rpc('get_move_submission_data', {
      p_auth_user_id: authData.user.id,
      p_match_id: payload.matchId,
    })
    .maybeSingle();
  console.log(`⏱️ [${(performance.now() - startTime).toFixed(0)}ms] Combined data loaded (profile + match + last move)`);

  if (moveDataError || !moveData) {
    console.error('Failed to load move submission data', moveDataError);
    return jsonResponse({ error: 'Unable to load match data' }, { status: 404 });
  }

  const { player_id: playerId, player_role: role, match_data: matchData, last_move_data: lastMoveData } = moveData;

  if (!role) {
    return jsonResponse({ error: 'You are not a participant in this match' }, { status: 403 });
  }

  // Parse match data
  const match = matchData as any;
  if (!match.opponent_id) {
    return jsonResponse({ error: 'Match has not been joined yet' }, { status: 409 });
  }

  if (match.status === 'completed' || match.status === 'abandoned') {
    return jsonResponse({ error: 'Match can no longer accept moves' }, { status: 409 });
  }

  if (!match.initial_state) {
    console.error('Match is missing initial state snapshot');
    return jsonResponse({ error: 'Match state is unavailable' }, { status: 500 });
  }

  // Parse last move (if any)
  const lastMove = lastMoveData as any;

  let engine: SantoriniEngine;
  let expectedMoveIndex = 0;

  if (lastMove && lastMove.state_snapshot) {
    // Resume from last move's snapshot (FAST!)
    try {
      console.log('Building engine from last move snapshot, move_index:', lastMove.move_index);
      engine = SantoriniEngine.fromSnapshot(lastMove.state_snapshot as SantoriniStateSnapshot);
      expectedMoveIndex = lastMove.move_index + 1;
      console.log('Engine resumed from snapshot, current player:', engine.player, 'next move index:', expectedMoveIndex);
    } catch (error) {
      console.error('Failed to build engine from snapshot', error);
      return jsonResponse({ error: 'Match state snapshot is corrupted' }, { status: 500 });
    }
  } else {
    // First move - start from initial state
    try {
      console.log('Building engine from initial state (first move)');
      engine = SantoriniEngine.fromSnapshot(match.initial_state as SantoriniStateSnapshot);
      expectedMoveIndex = 0;
      console.log('Engine created from initial state, current player:', engine.player);
    } catch (error) {
      console.error('Failed to build engine from initial state', error);
      return jsonResponse({ error: 'Match state is corrupted' }, { status: 500 });
    }
  }

  console.log('Move index validation - payload:', payload.moveIndex, 'expected:', expectedMoveIndex);
  if (typeof payload.moveIndex === 'number' && payload.moveIndex !== expectedMoveIndex) {
    console.error('Move index mismatch - payload:', payload.moveIndex, 'expected:', expectedMoveIndex);
    return jsonResponse({ error: 'Move index out of sequence' }, { status: 409 });
  }

  const actingPlayerIndex = engine.player;
  if (actingPlayerIndex === 0 && role !== 'creator') {
    return jsonResponse({ error: "It is the creator's turn" }, { status: 403 });
  }
  if (actingPlayerIndex === 1 && role !== 'opponent') {
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
  console.log(`⏱️ [${(performance.now() - startTime).toFixed(0)}ms] Move inserted`);

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
    console.log(`⏱️ [${(performance.now() - startTime).toFixed(0)}ms] Match status updated`);
  }

  console.log(`⏱️ [TOTAL: ${(performance.now() - startTime).toFixed(0)}ms] Request complete`);
  return jsonResponse({ move: insertedMove, snapshot: applyResult.snapshot });
});
