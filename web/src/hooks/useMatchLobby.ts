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
  myMatches: LobbyMatch[];
  loading: boolean;
  activeMatchId: string | null;
  activeMatch: LobbyMatch | null;
  moves: MatchMoveRecord<MatchAction>[];
  joinCode: string | null;
}

const INITIAL_STATE: UseMatchLobbyState = {
  matches: [],
  myMatches: [],
  loading: false,
  activeMatchId: null,
  activeMatch: null,
  moves: [],
  joinCode: null,
};

const TRACKED_MATCH_STATUSES: MatchStatus[] = ['waiting_for_opponent', 'in_progress'];

const MATCH_WITH_PROFILES =
  '*, creator:creator_id (id, auth_user_id, display_name, rating, games_played, created_at, updated_at), '
  + 'opponent:opponent_id (id, auth_user_id, display_name, rating, games_played, created_at, updated_at)';

function normalizeAction(action: unknown): MatchAction {
  if (typeof action === 'object' && action !== null) {
    return action as MatchAction;
  }
  return { kind: 'unknown' } as MatchAction;
}

function upsertMatch(list: LobbyMatch[], match: LobbyMatch): LobbyMatch[] {
  const index = list.findIndex((item) => item.id === match.id);
  if (index >= 0) {
    const next = [...list];
    next[index] = { ...next[index], ...match };
    return next;
  }
  return [match, ...list];
}

function removeMatch(list: LobbyMatch[], matchId: string): LobbyMatch[] {
  return list.filter((match) => match.id !== matchId);
}

function selectPreferredMatch(matches: LobbyMatch[]): LobbyMatch | null {
  if (!matches.length) return null;
  return matches.find((match) => match.status === 'in_progress') ?? matches[0] ?? null;
}

export function useMatchLobby(profile: PlayerProfile | null) {
  const [state, setState] = useState<UseMatchLobbyState>(INITIAL_STATE);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const playersRef = useRef<Record<string, PlayerProfile>>({});
  const [playersVersion, setPlayersVersion] = useState(0);

  const matchId = state.activeMatchId;

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
    if (!client || !profile) {
      setState((prev) => ({ ...prev, myMatches: [], activeMatchId: null, activeMatch: null }));
      return undefined;
    }

    let isMounted = true;

    const fetchMyMatches = async () => {
      const { data, error } = await client
        .from('matches')
        .select(MATCH_WITH_PROFILES)
        .in('status', TRACKED_MATCH_STATUSES)
        .or(`creator_id.eq.${profile.id},opponent_id.eq.${profile.id}`)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch player matches', error);
        return;
      }

      if (!isMounted) return;

      const rawRecords = Array.isArray(data) ? data : [];
      const records = rawRecords as unknown as Array<MatchRecord & Partial<LobbyMatch>>;
      const profilesToCache: PlayerProfile[] = [];
      records.forEach((record) => {
        if (record.creator) profilesToCache.push(record.creator);
        if (record.opponent) profilesToCache.push(record.opponent);
      });
      mergePlayers(profilesToCache);
      const hydrated = records.map((record) => attachProfiles(record) ?? { ...record, creator: null, opponent: null });

      setState((prev) => {
        const myMatches = hydrated;
        const activeMatchId = (() => {
          if (prev.activeMatchId && myMatches.some((match) => match.id === prev.activeMatchId)) {
            return prev.activeMatchId;
          }
          const preferred = selectPreferredMatch(myMatches);
          return preferred?.id ?? null;
        })();
        const activeMatch = activeMatchId
          ? myMatches.find((match) => match.id === activeMatchId) ?? prev.activeMatch
          : null;
        return {
          ...prev,
          myMatches,
          activeMatchId,
          activeMatch,
          joinCode: activeMatchId ? activeMatch?.private_join_code ?? prev.joinCode : null,
        };
      });

      void ensurePlayersLoaded(records.flatMap((match) => [match.creator_id, match.opponent_id ?? undefined]));
    };

    fetchMyMatches();

    const channel = client
      .channel(`public:my_matches:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `or=(creator_id.eq.${profile.id},opponent_id.eq.${profile.id})`,
        },
        (payload: RealtimePostgresChangesPayload<MatchRecord>) => {
          const updated = payload.eventType === 'DELETE' ? (payload.old as MatchRecord) : (payload.new as MatchRecord);
          const isTracked = TRACKED_MATCH_STATUSES.includes(updated.status as MatchStatus);

          setState((prev) => {
            let myMatches = prev.myMatches;
            if (payload.eventType === 'DELETE' || !isTracked) {
              myMatches = removeMatch(prev.myMatches, updated.id);
            } else {
              const hydrated = attachProfiles({
                ...(prev.myMatches.find((match) => match.id === updated.id) ?? {}),
                ...updated,
              });
              const matchRecord = hydrated ?? { ...updated, creator: null, opponent: null };
              myMatches = upsertMatch(prev.myMatches, matchRecord);
            }

            let activeMatchId = prev.activeMatchId;
            let activeMatch = prev.activeMatch;
            if (activeMatchId && activeMatchId === updated.id) {
              if (payload.eventType === 'DELETE' || !isTracked) {
                const fallback = selectPreferredMatch(myMatches);
                activeMatchId = fallback?.id ?? null;
                activeMatch = fallback ?? null;
              } else {
                activeMatch = myMatches.find((match) => match.id === updated.id) ?? null;
              }
            } else if (!activeMatchId && isTracked && myMatches.length > 0) {
              const fallback = selectPreferredMatch(myMatches);
              activeMatchId = fallback?.id ?? null;
              activeMatch = fallback ?? null;
            }

            const joinCode = activeMatch ? activeMatch.private_join_code ?? null : null;

            return { ...prev, myMatches, activeMatchId, activeMatch, joinCode };
          });

          void ensurePlayersLoaded([updated.creator_id, updated.opponent_id ?? undefined]);
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      client.removeChannel(channel);
    };
  }, [attachProfiles, ensurePlayersLoaded, mergePlayers, profile]);

  useEffect(() => {
    const client = supabase;
    if (!client || !matchId) {
      if (channelRef.current) {
        client?.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setState((prev) => ({ ...prev, moves: [], activeMatch: null, joinCode: null }));
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
      setState((prev) => {
        if (prev.activeMatchId !== matchId) {
          return prev;
        }
        return {
          ...prev,
          activeMatch: hydrated,
          joinCode: record?.private_join_code ?? prev.joinCode,
        };
      });
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

      setState((prev) => {
        if (prev.activeMatchId !== matchId) {
          return prev;
        }
        return {
          ...prev,
          moves: (data ?? []).map((move: MatchMoveRecord) => ({
            ...move,
            action: normalizeAction(move.action),
          })),
        };
      });
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
          setState((prev) => {
            if (prev.activeMatchId !== matchId) {
              return prev;
            }
            return {
              ...prev,
              activeMatch:
                attachProfiles({ ...prev.activeMatch, ...updated }) ??
                (prev.activeMatch
                  ? { ...prev.activeMatch, ...updated }
                  : { ...updated, creator: null, opponent: null }),
            };
          });
          void ensurePlayersLoaded([updated.creator_id, updated.opponent_id ?? undefined]);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_moves', filter: `match_id=eq.${matchId}` },
        (payload: RealtimePostgresChangesPayload<MatchMoveRecord>) => {
          setState((prev) => {
            if (prev.activeMatchId !== matchId) {
              return prev;
            }
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

      const { data, error } = await client.functions.invoke('create-match', {
        body: {
          visibility: payload.visibility,
          rated: payload.rated,
          hasClock: payload.hasClock,
          clockInitialMinutes: payload.clockInitialMinutes,
          clockIncrementSeconds: payload.clockIncrementSeconds,
        },
      });

      if (error) {
        console.error('Failed to create match', error);
        throw error;
      }

      const record = (data as { match?: MatchRecord & Partial<LobbyMatch> } | null)?.match;
      if (!record) {
        throw new Error('Match creation response was malformed.');
      }
      if (record.creator) mergePlayers([record.creator]);
      const enriched = attachProfiles(record) ?? { ...record, creator: profile, opponent: null };
      const joinCode = record.private_join_code ?? null;
      setState((prev) => ({
        ...prev,
        activeMatchId: enriched.id,
        activeMatch: enriched,
        joinCode,
        moves: [],
        myMatches: upsertMatch(prev.myMatches, enriched),
      }));
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
        setState((prev) => ({
          ...prev,
          activeMatchId: selfMatch.id,
          activeMatch: selfMatch,
          joinCode: targetMatch.private_join_code,
          moves: [],
          myMatches: upsertMatch(prev.myMatches, selfMatch),
        }));
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
      setState((prev) => ({
        ...prev,
        activeMatchId: enriched.id,
        activeMatch: enriched,
        joinCode: targetMatch.private_join_code,
        moves: [],
        myMatches: upsertMatch(prev.myMatches, enriched),
      }));
      void ensurePlayersLoaded([joined.creator_id, joined.opponent_id ?? undefined]);
      return enriched;
    },
    [attachProfiles, ensurePlayersLoaded, mergePlayers, profile],
  );

  const leaveMatch = useCallback(
    async (matchId?: string | null) => {
      const client = supabase;
      if (!client || !profile) {
        setState((prev) => ({ ...prev, activeMatchId: null, activeMatch: null, moves: [], joinCode: null }));
        return;
      }

      const targetId = matchId ?? state.activeMatchId;
      if (!targetId) {
        setState((prev) => ({ ...prev, activeMatchId: null, activeMatch: null, moves: [], joinCode: null }));
        return;
      }

      const candidate =
        state.activeMatch && state.activeMatch.id === targetId
          ? state.activeMatch
          : state.myMatches.find((match) => match.id === targetId) ?? null;

      const updates: Partial<MatchRecord> = { status: 'abandoned' };
      if (candidate?.status === 'in_progress') {
        const opponentId = profile.id === candidate.creator_id ? candidate.opponent_id : candidate.creator_id;
        if (opponentId) {
          updates.winner_id = opponentId;
        }
      }

      const { error } = await client.from('matches').update(updates).eq('id', targetId);
      if (error) {
        console.error('Failed to mark match as abandoned', error);
        return;
      }

      setState((prev) => {
        const remaining = removeMatch(prev.myMatches, targetId);
        const wasActive = prev.activeMatchId === targetId;
        const fallback = wasActive ? selectPreferredMatch(remaining) : null;
        return {
          ...prev,
          myMatches: remaining,
          activeMatchId: wasActive ? fallback?.id ?? null : prev.activeMatchId,
          activeMatch: wasActive ? fallback ?? null : prev.activeMatch,
          moves: wasActive ? [] : prev.moves,
          joinCode: wasActive && fallback ? fallback.private_join_code ?? null : wasActive ? null : prev.joinCode,
        };
      });
    },
    [profile, state.activeMatch, state.activeMatchId, state.myMatches],
  );

  const submitMove = useCallback(
    async (match: LobbyMatch, moveIndex: number, movePayload: SantoriniMoveAction) => {
      const client = supabase;
      if (!client || !profile) {
        throw new Error('Authentication required.');
      }
      const { error } = await client.functions.invoke('submit-move', {
        body: {
          matchId: match.id,
          moveIndex,
          action: movePayload,
        },
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
    if (!client || !state.activeMatchId) return;
    const { error } = await client
      .from('matches')
      .update({ status, winner_id: payload?.winner_id ?? null })
      .eq('id', state.activeMatchId);
    if (error) {
      console.error('Failed to update match status', error);
    }
  }, [state.activeMatchId]);

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
      setState((prev) => ({
        ...prev,
        activeMatchId: enriched.id,
        activeMatch: enriched,
        moves: [],
        joinCode: record.private_join_code,
        myMatches: upsertMatch(prev.myMatches, enriched),
      }));
      void ensurePlayersLoaded([record.creator_id, record.opponent_id ?? undefined]);
      return enriched;
    },
    [attachProfiles, ensurePlayersLoaded, mergePlayers, profile, state.activeMatch],
  );

  const setActiveMatch = useCallback(
    (matchId: string | null) => {
      setState((prev) => {
        if (!matchId) {
          return { ...prev, activeMatchId: null, activeMatch: null, moves: [], joinCode: null };
        }
        const nextMatch =
          prev.myMatches.find((match) => match.id === matchId) ??
          (prev.activeMatch?.id === matchId ? prev.activeMatch : null);
        const hydrated = nextMatch ? attachProfiles(nextMatch) ?? nextMatch : null;
        const sameMatch = prev.activeMatchId === matchId;
        return {
          ...prev,
          activeMatchId: matchId,
          activeMatch: hydrated,
          moves: sameMatch ? prev.moves : [],
          joinCode: hydrated?.private_join_code ?? (sameMatch ? prev.joinCode : null),
        };
      });
    },
    [attachProfiles],
  );

  const activeRole = useMemo<'creator' | 'opponent' | null>(() => {
    if (!profile || !state.activeMatch) return null;
    if (state.activeMatch.creator_id === profile.id) return 'creator';
    if (state.activeMatch.opponent_id === profile.id) return 'opponent';
    return null;
  }, [profile, state.activeMatch]);

  const myMatchesWithProfiles = useMemo(
    () =>
      state.myMatches.map((match) => {
        const enriched = attachProfiles(match);
        return enriched ?? { ...match, creator: null, opponent: null };
      }),
    [attachProfiles, state.myMatches],
  );

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
    myMatches: myMatchesWithProfiles,
    loading: state.loading,
    activeMatchId: state.activeMatchId,
    activeMatch: activeMatchWithProfiles,
    moves: state.moves,
    joinCode: state.joinCode,
    activeRole,
    setActiveMatch,
    createMatch,
    joinMatch,
    leaveMatch,
    submitMove,
    updateMatchStatus,
    offerRematch,
  };
}
