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

const MATCH_WITH_PROFILES =
  '*, creator:creator_id (id, auth_user_id, display_name, rating, games_played, created_at, updated_at), '
  + 'opponent:opponent_id (id, auth_user_id, display_name, rating, games_played, created_at, updated_at)';

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
  const playersRef = useRef<Record<string, PlayerProfile>>({});
  const [playersVersion, setPlayersVersion] = useState(0);

  const matchId = state.activeMatch?.id ?? null;

  const mergePlayers = useCallback((records: PlayerProfile[]): void => {
    if (!records.length) return;
    const next = { ...playersRef.current };
    let changed = false;
    records.forEach((record) => {
      if (!record?.id) return;
      const existing = next[record.id];
      if (!existing || existing.updated_at !== record.updated_at || existing.display_name !== record.display_name) {
        next[record.id] = record;
        changed = true;
      }
    });
    if (changed) {
      playersRef.current = next;
      setPlayersVersion((prev) => prev + 1);
    }
  }, []);

  const ensurePlayersLoaded = useCallback(
    async (ids: Array<string | null | undefined>): Promise<void> => {
      const client = supabase;
      if (!client) return;
      const missing = Array.from(
        new Set(
          ids
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
            .filter((id) => !playersRef.current[id]),
        ),
      );
      if (!missing.length) return;
      const { data, error } = await client.from('players').select('*').in('id', missing);
      if (error) {
        console.error('Failed to load player profiles', error);
        return;
      }
      mergePlayers((data ?? []) as PlayerProfile[]);
    },
    [mergePlayers],
  );

  const attachProfiles = useCallback(
    (match: (MatchRecord & Partial<LobbyMatch>) | null): LobbyMatch | null => {
      if (!match) return null;
      const creatorProfile = (match as LobbyMatch).creator ?? null;
      const opponentProfile = (match as LobbyMatch).opponent ?? null;
      return {
        ...match,
        creator:
          creatorProfile ?? (match.creator_id ? playersRef.current[match.creator_id] ?? null : null),
        opponent:
          opponentProfile ?? (match.opponent_id ? playersRef.current[match.opponent_id] ?? null : null),
      };
    },
    [playersVersion],
  );

  useEffect(() => {
    if (profile) {
      mergePlayers([profile]);
    }
  }, [mergePlayers, profile]);

  useEffect(() => {
    const client = supabase;
    if (!client) return undefined;

    const channel = client
      .channel('public:players')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players' }, (payload) => {
        const record = payload.new as PlayerProfile | null;
        if (record) {
          mergePlayers([record]);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players' }, (payload) => {
        const record = payload.new as PlayerProfile | null;
        if (record) {
          mergePlayers([record]);
        }
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [mergePlayers]);

  useEffect(() => {
    const client = supabase;
    if (!client || !profile) return undefined;

    const cleanup = async () => {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { error } = await client
        .from('matches')
        .update({ status: 'abandoned' })
        .eq('creator_id', profile.id)
        .eq('status', 'waiting_for_opponent')
        .lt('created_at', cutoff);
      if (error) {
        console.error('Failed to clean stale matches', error);
      }
    };

    cleanup();
    const timer = setInterval(cleanup, 5 * 60 * 1000);
    return () => {
      clearInterval(timer);
    };
  }, [profile]);

  useEffect(() => {
    const client = supabase;
    if (!client) return undefined;

    const fetchMatches = async () => {
      setState((prev) => ({ ...prev, loading: true }));
      const { data, error } = await client
        .from('matches')
        .select(MATCH_WITH_PROFILES)
        .eq('status', 'waiting_for_opponent')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Failed to fetch matches', error);
        setState((prev) => ({ ...prev, loading: false }));
        return;
      }

      const rawRecords = Array.isArray(data) ? data : [];
      const records = rawRecords as unknown as Array<MatchRecord & Partial<LobbyMatch>>;
      const profilesToCache: PlayerProfile[] = [];
      records.forEach((record) => {
        if (record.creator) profilesToCache.push(record.creator);
        if (record.opponent) profilesToCache.push(record.opponent);
      });
      mergePlayers(profilesToCache);
      const hydrated = records.map((record) => attachProfiles(record) ?? { ...record, creator: null, opponent: null });
      setState((prev) => ({ ...prev, loading: false, matches: hydrated }));
      void ensurePlayersLoaded(
        records.flatMap((match) => [match.creator_id, match.opponent_id ?? undefined]),
      );
    };

    fetchMatches();

    const channel = client
      .channel('public:lobby')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        (payload: RealtimePostgresChangesPayload<MatchRecord>) => {
          setState((prev) => {
            const matches = [...prev.matches];
            if (payload.eventType === 'INSERT') {
              const record = payload.new as MatchRecord;
              if (record.status === 'waiting_for_opponent') {
                matches.unshift(attachProfiles(record) ?? { ...record, creator: null, opponent: null });
              }
              void ensurePlayersLoaded([record.creator_id, record.opponent_id ?? undefined]);
            } else if (payload.eventType === 'UPDATE') {
              const updated = payload.new as MatchRecord;
              const index = matches.findIndex((m) => m.id === updated.id);
              if (index >= 0) {
                matches[index] = attachProfiles({ ...matches[index], ...updated }) ?? {
                  ...matches[index],
                  ...updated,
                };
              } else if (updated.status === 'waiting_for_opponent') {
                matches.unshift(attachProfiles(updated) ?? { ...updated, creator: null, opponent: null });
              }
              if (updated.status !== 'waiting_for_opponent') {
                return { ...prev, matches: matches.filter((m) => m.id !== updated.id) };
              }
              void ensurePlayersLoaded([updated.creator_id, updated.opponent_id ?? undefined]);
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
        .select(MATCH_WITH_PROFILES)
        .eq('id', matchId)
        .maybeSingle();

      if (error) {
        console.error('Failed to load active match', error);
        return;
      }

      const record = (data ?? null) as unknown as (MatchRecord & Partial<LobbyMatch>) | null;
      if (record?.creator) mergePlayers([record.creator]);
      if (record?.opponent) mergePlayers([record.opponent]);
      const hydrated = attachProfiles(record);
      setState((prev) => ({ ...prev, activeMatch: hydrated }));
      if (record) {
        void ensurePlayersLoaded([record.creator_id, record.opponent_id ?? undefined]);
      }
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
        (payload: RealtimePostgresChangesPayload<MatchRecord>) => {
          const updated = payload.new as MatchRecord;
          setState((prev) => ({
            ...prev,
            activeMatch:
              attachProfiles({ ...prev.activeMatch, ...updated }) ??
              (prev.activeMatch
                ? { ...prev.activeMatch, ...updated }
                : { ...updated, creator: null, opponent: null }),
          }));
          void ensurePlayersLoaded([updated.creator_id, updated.opponent_id ?? undefined]);
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
  }, [attachProfiles, ensurePlayersLoaded, matchId, mergePlayers]);

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

      const { data, error } = await client
        .from('matches')
        .insert(baseRecord)
        .select(MATCH_WITH_PROFILES)
        .single();

      if (error) {
        console.error('Failed to create match', error);
        throw error;
      }

      const record = data as unknown as MatchRecord & Partial<LobbyMatch>;
      if (record.creator) mergePlayers([record.creator]);
      const enriched = attachProfiles(record) ?? { ...record, creator: profile, opponent: null };
      setState((prev) => ({ ...prev, activeMatch: enriched, joinCode, moves: [] }));
      void ensurePlayersLoaded([record.creator_id, record.opponent_id ?? undefined]);
      return enriched;
    },
    [attachProfiles, ensurePlayersLoaded, mergePlayers, profile],
  );

  const joinMatch = useCallback(
    async (idOrCode: string) => {
      const client = supabase;
      if (!client || !profile) {
        throw new Error('Authentication required.');
      }

      const isCode = idOrCode.length <= 8;
      let targetMatch: (MatchRecord & Partial<LobbyMatch>) | null = null;

      if (isCode) {
        const { data, error } = await client
          .from('matches')
          .select(MATCH_WITH_PROFILES)
          .eq('private_join_code', idOrCode)
          .maybeSingle();
        if (error) {
          console.error('Failed to find match by code', error);
          throw error;
        }
        targetMatch = (data ?? null) as (MatchRecord & Partial<LobbyMatch>) | null;
      } else {
        const { data, error } = await client
          .from('matches')
          .select(MATCH_WITH_PROFILES)
          .eq('id', idOrCode)
          .maybeSingle();
        if (error) {
          console.error('Failed to find match by id', error);
          throw error;
        }
        targetMatch = (data ?? null) as (MatchRecord & Partial<LobbyMatch>) | null;
      }

      if (!targetMatch) {
        throw new Error('Match not found.');
      }

      if (targetMatch.status !== 'waiting_for_opponent') {
        throw new Error('Match is no longer accepting players.');
      }

      if (targetMatch.opponent_id !== null) {
        throw new Error('Match is no longer available or has already been joined by another player.');
      }

      const selfMatch = attachProfiles(targetMatch) ?? { ...targetMatch, creator: null, opponent: null };
      if (targetMatch.creator_id === profile.id) {
        setState((prev) => ({ ...prev, activeMatch: selfMatch, joinCode: targetMatch.private_join_code, moves: [] }));
        void ensurePlayersLoaded([targetMatch.creator_id, targetMatch.opponent_id ?? undefined]);
        return selfMatch;
      }

      const { data, error } = await client
        .from('matches')
        .update({ opponent_id: profile.id, status: 'in_progress' })
        .eq('id', targetMatch.id)
        .is('opponent_id', null)
        .select(MATCH_WITH_PROFILES)
        .maybeSingle();

      if (error) {
        console.error('Failed to join match', error);
        throw error;
      }

      if (!data) {
        throw new Error('Match is no longer available or has already been joined by another player.');
      }

      const joined = data as unknown as MatchRecord & Partial<LobbyMatch>;
      const mergedProfiles: PlayerProfile[] = [];
      if (joined.creator) mergedProfiles.push(joined.creator);
      if (joined.opponent) mergedProfiles.push(joined.opponent);
      mergePlayers(mergedProfiles);
      const enriched = attachProfiles(joined) ?? {
        ...joined,
        creator: selfMatch.creator,
        opponent: profile,
      };
      setState((prev) => ({ ...prev, activeMatch: enriched, joinCode: targetMatch.private_join_code, moves: [] }));
      void ensurePlayersLoaded([joined.creator_id, joined.opponent_id ?? undefined]);
      return enriched;
    },
    [attachProfiles, ensurePlayersLoaded, mergePlayers, profile],
  );

  const leaveMatch = useCallback(async () => {
    const client = supabase;
    const active = state.activeMatch;
    if (client && active && profile) {
      const updates: Partial<MatchRecord> = { status: 'abandoned' };
      if (active.status === 'in_progress') {
        const opponentId = profile.id === active.creator_id ? active.opponent_id : active.creator_id;
        if (opponentId) {
          updates.winner_id = opponentId;
        }
      }
      const { error } = await client.from('matches').update(updates).eq('id', active.id);
      if (error) {
        console.error('Failed to mark match as abandoned', error);
      }
    }
    setState((prev) => ({ ...prev, activeMatch: null, moves: [], joinCode: null }));
  }, [profile, state.activeMatch]);

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
        .select(MATCH_WITH_PROFILES)
        .single();
      if (error) {
        console.error('Failed to create rematch', error);
        throw error;
      }
      const record = data as unknown as MatchRecord & Partial<LobbyMatch>;
      const cachedProfiles: PlayerProfile[] = [];
      if (record.creator) cachedProfiles.push(record.creator);
      if (record.opponent) cachedProfiles.push(record.opponent);
      mergePlayers(cachedProfiles);
      const enriched = attachProfiles(record) ?? { ...record, creator: profile, opponent: null };
      setState((prev) => ({ ...prev, activeMatch: enriched, moves: [], joinCode: record.private_join_code }));
      void ensurePlayersLoaded([record.creator_id, record.opponent_id ?? undefined]);
      return enriched;
    },
    [attachProfiles, ensurePlayersLoaded, mergePlayers, profile, state.activeMatch],
  );

  const activeRole = useMemo<'creator' | 'opponent' | null>(() => {
    if (!profile || !state.activeMatch) return null;
    if (state.activeMatch.creator_id === profile.id) return 'creator';
    if (state.activeMatch.opponent_id === profile.id) return 'opponent';
    return null;
  }, [profile, state.activeMatch]);

  const matchesWithProfiles = useMemo(
    () =>
      state.matches.map((match) => {
        const enriched = attachProfiles(match);
        return enriched ?? { ...match, creator: null, opponent: null };
      }),
    [attachProfiles, state.matches],
  );

  const activeMatchWithProfiles = useMemo(() => attachProfiles(state.activeMatch), [attachProfiles, state.activeMatch]);

  return {
    matches: matchesWithProfiles,
    loading: state.loading,
    activeMatch: activeMatchWithProfiles,
    moves: state.moves,
    joinCode: state.joinCode,
    activeRole,
    createMatch,
    joinMatch,
    leaveMatch,
    submitMove,
    updateMatchStatus,
    offerRematch,
  };
}
