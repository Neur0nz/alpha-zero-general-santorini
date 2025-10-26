import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type {
  MatchAction,
  MatchMoveRecord,
  MatchRecord,
  MatchStatus,
  MatchVisibility,
  PlayerProfile,
  SantoriniMoveAction,
} from '@/types/match';

export interface CreateMatchPayload {
  visibility: MatchVisibility;
  rated: boolean;
  hasClock: boolean;
  clockInitialMinutes: number;
  clockIncrementSeconds: number;
}

export interface LobbyMatch extends MatchRecord {
  creator?: PlayerProfile | null;
  opponent?: PlayerProfile | null;
}

export interface UseMatchLobbyState {
  matches: LobbyMatch[];
  loading: boolean;
  activeMatch: LobbyMatch | null;
  moves: MatchMoveRecord<MatchAction>[];
  joinCode: string | null;
}

const INITIAL_STATE: UseMatchLobbyState = {
  matches: [],
  loading: false,
  activeMatch: null,
  moves: [],
  joinCode: null,
};

function normalizeAction(action: unknown): MatchAction {
  if (typeof action === 'object' && action !== null) {
    return action as MatchAction;
  }
  return { kind: 'unknown' } as MatchAction;
}

function generateJoinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function useMatchLobby(profile: PlayerProfile | null) {
  const [state, setState] = useState<UseMatchLobbyState>(INITIAL_STATE);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);

  const matchId = state.activeMatch?.id ?? null;

  useEffect(() => {
    const client = supabase;
    if (!client) return undefined;

    const fetchMatches = async () => {
      setState((prev) => ({ ...prev, loading: true }));
      const { data, error } = await client
        .from('matches')
        .select('*')
        .eq('status', 'waiting_for_opponent')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Failed to fetch matches', error);
        setState((prev) => ({ ...prev, loading: false }));
        return;
      }

      setState((prev) => ({ ...prev, loading: false, matches: (data ?? []) as LobbyMatch[] }));
    };

    fetchMatches();

    const channel = client
      .channel('public:lobby')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        (payload: RealtimePostgresChangesPayload<LobbyMatch>) => {
          setState((prev) => {
            const matches = [...prev.matches];
            if (payload.eventType === 'INSERT') {
              const record = payload.new as LobbyMatch;
              if (record.status === 'waiting_for_opponent') {
                matches.unshift(record);
              }
            } else if (payload.eventType === 'UPDATE') {
              const updated = payload.new as LobbyMatch;
              const index = matches.findIndex((m) => m.id === updated.id);
              if (index >= 0) {
                matches[index] = updated;
              } else if (updated.status === 'waiting_for_opponent') {
                matches.unshift(updated);
              }
              if (updated.status !== 'waiting_for_opponent') {
                return { ...prev, matches: matches.filter((m) => m.id !== updated.id) };
              }
            } else if (payload.eventType === 'DELETE') {
              return { ...prev, matches: matches.filter((m) => m.id !== (payload.old as MatchRecord).id) };
            }
            return { ...prev, matches };
          });
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client || !matchId) {
      if (channelRef.current) {
        client?.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setState((prev) => ({ ...prev, moves: [] }));
      return undefined;
    }

    const fetchMatch = async () => {
      const { data, error } = await client
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .maybeSingle();

      if (error) {
        console.error('Failed to load active match', error);
        return;
      }

      setState((prev) => ({ ...prev, activeMatch: (data ?? null) as LobbyMatch | null }));
    };

    const fetchMoves = async () => {
      const { data, error } = await client
        .from('match_moves')
        .select('*')
        .eq('match_id', matchId)
        .order('move_index', { ascending: true });

      if (error) {
        console.error('Failed to load match moves', error);
        return;
      }

      setState((prev) => ({
        ...prev,
        moves: (data ?? []).map((move: MatchMoveRecord) => ({
          ...move,
          action: normalizeAction(move.action),
        })),
      }));
    };

    fetchMatch();
    fetchMoves();

    const channel = client
      .channel(`public:match:${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        (payload: RealtimePostgresChangesPayload<LobbyMatch>) => {
          setState((prev) => ({ ...prev, activeMatch: payload.new as LobbyMatch }));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_moves', filter: `match_id=eq.${matchId}` },
        (payload: RealtimePostgresChangesPayload<MatchMoveRecord>) => {
          setState((prev) => {
            if (payload.eventType === 'INSERT') {
              const newMove = payload.new as MatchMoveRecord;
              const moveRecord: MatchMoveRecord<MatchAction> = {
                ...newMove,
                action: normalizeAction(newMove.action),
              };
              const exists = prev.moves.some((move) => move.id === moveRecord.id);
              if (exists) {
                return prev;
              }
              return { ...prev, moves: [...prev.moves, moveRecord] };
            }
            return prev;
          });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [matchId]);

  const createMatch = useCallback(
    async (payload: CreateMatchPayload) => {
      const client = supabase;
      if (!client || !profile) {
        throw new Error('Authentication required.');
      }

      const joinCode = payload.visibility === 'private' ? generateJoinCode() : null;
      const baseRecord = {
        creator_id: profile.id,
        visibility: payload.visibility,
        rated: payload.rated,
        private_join_code: joinCode,
        clock_initial_seconds: payload.hasClock ? Math.max(0, Math.round(payload.clockInitialMinutes * 60)) : 0,
        clock_increment_seconds: payload.hasClock ? Math.max(0, Math.round(payload.clockIncrementSeconds)) : 0,
      };

      const { data, error } = await client.from('matches').insert(baseRecord).select('*').single();

      if (error) {
        console.error('Failed to create match', error);
        throw error;
      }

      setState((prev) => ({ ...prev, activeMatch: data as LobbyMatch, joinCode }));
      return data as LobbyMatch;
    },
    [profile],
  );

  const joinMatch = useCallback(
    async (idOrCode: string) => {
      const client = supabase;
      if (!client || !profile) {
        throw new Error('Authentication required.');
      }

      const isCode = idOrCode.length <= 8;
      let targetMatch: LobbyMatch | null = null;

      if (isCode) {
        const { data, error } = await client
          .from('matches')
          .select('*')
          .eq('private_join_code', idOrCode)
          .maybeSingle();
        if (error) {
          console.error('Failed to find match by code', error);
          throw error;
        }
        targetMatch = (data ?? null) as LobbyMatch | null;
      } else {
        const { data, error } = await client
          .from('matches')
          .select('*')
          .eq('id', idOrCode)
          .maybeSingle();
        if (error) {
          console.error('Failed to find match by id', error);
          throw error;
        }
        targetMatch = (data ?? null) as LobbyMatch | null;
      }

      if (!targetMatch) {
        throw new Error('Match not found.');
      }

      if (targetMatch.creator_id === profile.id) {
        setState((prev) => ({ ...prev, activeMatch: targetMatch, joinCode: targetMatch.private_join_code }));
        return targetMatch;
      }

      const { data, error } = await client
        .from('matches')
        .update({ opponent_id: profile.id, status: 'in_progress' })
        .eq('id', targetMatch.id)
        .is('opponent_id', null)
        .select('*')
        .single();

      if (error) {
        console.error('Failed to join match', error);
        throw error;
      }

      setState((prev) => ({ ...prev, activeMatch: data as LobbyMatch, joinCode: targetMatch.private_join_code }));
      return data as LobbyMatch;
    },
    [profile],
  );

  const leaveMatch = useCallback(async () => {
    setState((prev) => ({ ...prev, activeMatch: null, moves: [], joinCode: null }));
  }, []);

  const submitMove = useCallback(
    async (match: LobbyMatch, moveIndex: number, movePayload: SantoriniMoveAction) => {
      const client = supabase;
      if (!client || !profile) {
        throw new Error('Authentication required.');
      }
      const { error } = await client.from('match_moves').insert({
        match_id: match.id,
        move_index: moveIndex,
        player_id: profile.id,
        action: movePayload,
      });
      if (error) {
        console.error('Failed to submit move', error);
        throw error;
      }
    },
    [profile],
  );

  const updateMatchStatus = useCallback(async (status: MatchStatus, payload?: { winner_id?: string | null }) => {
    const client = supabase;
    if (!client || !state.activeMatch) return;
    const { error } = await client
      .from('matches')
      .update({ status, winner_id: payload?.winner_id ?? null })
      .eq('id', state.activeMatch.id);
    if (error) {
      console.error('Failed to update match status', error);
    }
  }, [state.activeMatch]);

  const offerRematch = useCallback(
    async () => {
      const client = supabase;
      if (!client || !profile || !state.activeMatch) return null;
      const { data, error } = await client
        .from('matches')
        .insert({
          creator_id: profile.id,
          visibility: state.activeMatch.visibility,
          rated: state.activeMatch.rated,
          clock_initial_seconds: state.activeMatch.clock_initial_seconds,
          clock_increment_seconds: state.activeMatch.clock_increment_seconds,
          rematch_parent_id: state.activeMatch.id,
        })
        .select('*')
        .single();
      if (error) {
        console.error('Failed to create rematch', error);
        throw error;
      }
      return data as LobbyMatch;
    },
    [profile, state.activeMatch],
  );

  const activeRole = useMemo<'creator' | 'opponent' | null>(() => {
    if (!profile || !state.activeMatch) return null;
    if (state.activeMatch.creator_id === profile.id) return 'creator';
    if (state.activeMatch.opponent_id === profile.id) return 'opponent';
    return null;
  }, [profile, state.activeMatch]);

  return {
    ...state,
    activeRole,
    createMatch,
    joinMatch,
    leaveMatch,
    submitMove,
    updateMatchStatus,
    offerRematch,
  };
}
