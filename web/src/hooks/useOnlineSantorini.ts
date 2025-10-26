import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSantorini } from './useSantorini';
import type { LobbyMatch } from './useMatchLobby';
import type { MatchMoveRecord, SantoriniMoveAction } from '@/types/match';
import { useToast } from '@chakra-ui/react';

export interface UseOnlineSantoriniOptions {
  match: LobbyMatch | null;
  moves: MatchMoveRecord<SantoriniMoveAction>[];
  role: 'creator' | 'opponent' | null;
  onSubmitMove: (match: LobbyMatch, index: number, action: SantoriniMoveAction) => Promise<void>;
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

export function useOnlineSantorini(options: UseOnlineSantoriniOptions) {
  const { match, moves, role, onSubmitMove } = options;
  const base = useSantorini();
  const toast = useToast();
  const [clock, setClock] = useState<ClockState>(() => deriveInitialClocks(match));
  const [clockEnabled, setClockEnabled] = useState(match?.clock_initial_seconds ? match.clock_initial_seconds > 0 : false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appliedMovesRef = useRef(0);
  const pendingLocalMoveRef = useRef<{ expectedHistoryLength: number } | null>(null);

  const currentTurn = useMemo(() => {
    if (!match) return 'creator';
    return moves.length % 2 === 0 ? 'creator' : 'opponent';
  }, [match, moves.length]);

  useEffect(() => {
    setClock(deriveInitialClocks(match));
    setClockEnabled(match?.clock_initial_seconds ? match.clock_initial_seconds > 0 : false);
    appliedMovesRef.current = 0;
    pendingLocalMoveRef.current = null;
  }, [match?.id, match?.clock_initial_seconds]);

  useEffect(() => {
    if (base.loading) return;
    if (!match) return;

    const applyNewMoves = async () => {
      if (!moves.length) return;
      while (appliedMovesRef.current < moves.length) {
        const moveRecord = moves[appliedMovesRef.current];
        const action = moveRecord.action;
        if (!action || action.kind !== 'santorini.move') {
          appliedMovesRef.current += 1;
          continue;
        }
        try {
          await base.applyMove(action.move, { triggerAi: false });
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
        } catch (error) {
          console.error('Failed to apply move from server', error);
        }
        appliedMovesRef.current += 1;
      }
    };

    applyNewMoves();
  }, [match, moves, base.loading, base.applyMove, clockEnabled, match?.clock_increment_seconds]);

  useEffect(() => {
    if (!clockEnabled || !match) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const side = moves.length % 2 === 0 ? 'creator' : 'opponent';
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
  }, [clockEnabled, match, moves.length]);

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
      if (currentTurn !== role) {
        toast({ title: "It's not your turn", status: 'warning' });
        return;
      }

      pendingLocalMoveRef.current = { expectedHistoryLength: base.history.length };
      await base.onCellClick(y, x);
    },
    [base, currentTurn, match, role, toast],
  );

  const resetMatch = useCallback(async () => {
    await base.controls.reset();
    appliedMovesRef.current = 0;
    pendingLocalMoveRef.current = null;
    setClock(deriveInitialClocks(match));
  }, [base.controls, match]);

  const localPlayerClock = role === 'creator' ? clock.creatorMs : clock.opponentMs;
  const remotePlayerClock = role === 'creator' ? clock.opponentMs : clock.creatorMs;

  return {
    ...base,
    onCellClick,
    clockEnabled,
    formatClock,
    localPlayerClock,
    remotePlayerClock,
    resetMatch,
  };
}
