import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSantorini } from './useSantorini';
import type { LobbyMatch } from './useMatchLobby';
import type { MatchAction, MatchMoveRecord, SantoriniMoveAction, SantoriniStateSnapshot } from '@/types/match';
import { useToast } from '@chakra-ui/react';

export interface UseOnlineSantoriniOptions {
  match: LobbyMatch | null;
  moves: MatchMoveRecord<MatchAction>[];
  role: 'creator' | 'opponent' | null;
  onSubmitMove: (match: LobbyMatch, index: number, action: SantoriniMoveAction) => Promise<void>;
  onGameComplete?: (winnerId: string | null) => void;
}

interface ClockState {
  creatorMs: number;
  opponentMs: number;
}

const TICK_INTERVAL = 1000;

function deriveInitialClocks(match: LobbyMatch | null): ClockState {
  if (!match || match.clock_initial_seconds <= 0) {
    return { creatorMs: 0, opponentMs: 0 };
  }
  const baseMs = match.clock_initial_seconds * 1000;
  return { creatorMs: baseMs, opponentMs: baseMs };
}

function isSantoriniMoveAction(action: MatchAction | null | undefined): action is SantoriniMoveAction {
  return Boolean(action && (action as SantoriniMoveAction).kind === 'santorini.move');
}

export function useOnlineSantorini(options: UseOnlineSantoriniOptions) {
  const { match, moves, role, onSubmitMove, onGameComplete } = options;
  const base = useSantorini({ evaluationEnabled: false });
  const matchId = match?.id ?? null;
  const toast = useToast();
  const [clock, setClock] = useState<ClockState>(() => deriveInitialClocks(match));
  const [clockEnabled, setClockEnabled] = useState(match?.clock_initial_seconds ? match.clock_initial_seconds > 0 : false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appliedMovesRef = useRef(0);
  const pendingLocalMoveRef = useRef<{ expectedHistoryLength: number } | null>(null);
  const lastSyncedRef = useRef<{ matchId: string | null; moveIndex: number }>({ matchId: null, moveIndex: -1 });
  const resetMatch = useCallback(async () => {
    if (!match) {
      return;
    }
    try {
      await base.importState(match.initial_state);
      const latestMove = moves.length > 0 ? moves[moves.length - 1] : null;
      appliedMovesRef.current = moves.length;
      pendingLocalMoveRef.current = null;
      lastSyncedRef.current = { matchId: match.id, moveIndex: latestMove ? latestMove.move_index : -1 };
      setClock(deriveInitialClocks(match));
    } catch (error) {
      console.error('Failed to reset match to server snapshot', error);
    }
  }, [base.importState, match, moves]);
  const lockedControls = useMemo(
    () => ({
      ...base.controls,
      reset: resetMatch,
      refreshEvaluation: async () => {},
      calculateOptions: async () => {},
      updateCalcDepth: (_depth: number | null) => {},
      setGameMode: async (_mode: 'P0' | 'P1' | 'Human' | 'AI') => {},
      changeDifficulty: (_sims: number) => {},
    }),
    [base.controls, resetMatch],
  );
  const previousMatchRef = useRef<{ id: string | null; status: LobbyMatch['status'] | null; clockSeconds: number | null }>({
    id: match?.id ?? null,
    status: match?.status ?? null,
    clockSeconds: match?.clock_initial_seconds ?? null,
  });

  useEffect(() => {
    if (!matchId) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await base.initialize();
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error('Failed to initialize Santorini engine', error);
        toast({
          title: 'Failed to load game engine',
          status: 'error',
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [base.initialize, matchId, toast]);

  const currentTurn = useMemo<'creator' | 'opponent'>(() => {
    if (!match) return 'creator';
    return base.nextPlayer === 0 ? 'creator' : 'opponent';
  }, [base.nextPlayer, match?.id]);

  useEffect(() => {
    const previous = previousMatchRef.current;

    if (!match) {
      setClock(deriveInitialClocks(null));
      setClockEnabled(false);
      appliedMovesRef.current = 0;
      pendingLocalMoveRef.current = null;
      previousMatchRef.current = { id: null, status: null, clockSeconds: null };
      return;
    }

    const next: typeof previous = {
      id: match.id,
      status: match.status,
      clockSeconds: match.clock_initial_seconds ?? null,
    };

    const shouldResetClock =
      previous.id !== next.id ||
      previous.clockSeconds !== next.clockSeconds ||
      (previous.status === 'waiting_for_opponent' && next.status === 'in_progress');

    if (shouldResetClock) {
      setClock(deriveInitialClocks(match));
      appliedMovesRef.current = 0;
      pendingLocalMoveRef.current = null;
    }

    setClockEnabled(match.clock_initial_seconds ? match.clock_initial_seconds > 0 : false);
    previousMatchRef.current = next;
  }, [match?.id, match?.clock_initial_seconds, match?.status, match]);

  useEffect(() => {
    if (!match) return;
    while (appliedMovesRef.current < moves.length) {
      const moveRecord = moves[appliedMovesRef.current];
      const action = moveRecord.action;
      if (isSantoriniMoveAction(action)) {
        if (action.clocks) {
          setClock({ creatorMs: action.clocks.creatorMs, opponentMs: action.clocks.opponentMs });
        } else if (clockEnabled && match.clock_increment_seconds > 0) {
          const increment = match.clock_increment_seconds * 1000;
          if (action.by === 'creator') {
            setClock((prev) => ({ ...prev, creatorMs: prev.creatorMs + increment }));
          } else {
            setClock((prev) => ({ ...prev, opponentMs: prev.opponentMs + increment }));
          }
        }
      }
      appliedMovesRef.current += 1;
    }
  }, [clockEnabled, match, match?.clock_increment_seconds, moves]);

  useEffect(() => {
    if (!match) {
      lastSyncedRef.current = { matchId: null, moveIndex: -1 };
      return;
    }
    if (base.loading) {
      return;
    }

    let snapshotSource: MatchMoveRecord<MatchAction> | null = null;
    for (let index = moves.length - 1; index >= 0; index -= 1) {
      const candidate = moves[index];
      if (candidate?.state_snapshot) {
        snapshotSource = candidate;
        break;
      }
    }
    const snapshot: SantoriniStateSnapshot | null =
      snapshotSource?.state_snapshot ?? match.initial_state ?? null;
    if (!snapshot) {
      return;
    }

    const lastSynced = lastSyncedRef.current;
    const targetIndex = snapshotSource ? snapshotSource.move_index : -1;
    if (lastSynced.matchId === match.id && lastSynced.moveIndex === targetIndex) {
      return;
    }

    (async () => {
      try {
        await base.importState(snapshot);
        lastSyncedRef.current = { matchId: match.id, moveIndex: targetIndex };
      } catch (error) {
        console.error('Failed to synchronize board with server snapshot', error);
      }
    })();
  }, [base.importState, base.loading, match, moves]);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!clockEnabled || !match || match.status !== 'in_progress') {
      return;
    }

    const side = currentTurn;
    timerRef.current = setInterval(() => {
      setClock((prev) => {
        const next = { ...prev };
        if (side === 'creator') {
          next.creatorMs = Math.max(0, next.creatorMs - TICK_INTERVAL);
        } else {
          next.opponentMs = Math.max(0, next.opponentMs - TICK_INTERVAL);
        }
        return next;
      });
    }, TICK_INTERVAL);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [clockEnabled, currentTurn, match?.status, match]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const pending = pendingLocalMoveRef.current;
    if (!pending) return;
    if (base.history.length <= pending.expectedHistoryLength) return;
    if (!match || !role) return;

    const lastMove = base.history[base.history.length - 1];
    if (!lastMove) {
      pendingLocalMoveRef.current = null;
      return;
    }

    const nextIndex = base.history.length - 1;
    const updatedClock = clockEnabled
      ? {
          creatorMs: clock.creatorMs,
          opponentMs: clock.opponentMs,
        }
      : undefined;

    const movePayload: SantoriniMoveAction = {
      kind: 'santorini.move',
      move: lastMove.action ?? -1,
      by: role,
      clocks: updatedClock,
    };

    onSubmitMove(match, nextIndex, movePayload)
      .catch((error) => {
        console.error('Failed to submit move', error);
        toast({
          title: 'Failed to send move',
          status: 'error',
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      })
      .finally(() => {
        pendingLocalMoveRef.current = null;
      });
  }, [base.history, clock, clockEnabled, match, onSubmitMove, role, toast]);

  const formatClock = useCallback((ms: number) => {
    if (!clockEnabled) return '--:--';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [clockEnabled]);

  const onCellClick = useCallback(
    async (y: number, x: number) => {
      if (!match || !role) {
        toast({ title: 'Join a match first', status: 'info' });
        return;
      }
      if (match.status !== 'in_progress') {
        toast({ title: 'Waiting for opponent', status: 'info' });
        return;
      }
      if (currentTurn !== role) {
        toast({ title: "It's not your turn", status: 'warning' });
        return;
      }

      pendingLocalMoveRef.current = { expectedHistoryLength: base.history.length };
      await base.onCellClick(y, x);
    },
    [base, currentTurn, match, role, toast],
  );

  const localPlayerClock = role === 'opponent' ? clock.opponentMs : clock.creatorMs;
  const remotePlayerClock = role === 'opponent' ? clock.creatorMs : clock.opponentMs;

  return {
    ...base,
    controls: lockedControls,
    onCellClick,
    clockEnabled,
    formatClock,
    localPlayerClock,
    remotePlayerClock,
    resetMatch,
    currentTurn,
    creatorClockMs: clock.creatorMs,
    opponentClockMs: clock.opponentMs,
  };
}
