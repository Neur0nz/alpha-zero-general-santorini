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

/**
 * Synchronizes the shared Santorini board with a remote Supabase-powered match.
 *
 * This hook should only be instantiated when an online match is active. Local matches
 * should render directly against the base `useSantorini` store via `SantoriniProvider`.
 */

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
  const lastSyncedStateRef = useRef<{ matchId: string | null; snapshotMoveIndex: number; appliedMoveCount: number }>({ 
    matchId: null, 
    snapshotMoveIndex: -1,
    appliedMoveCount: 0
  });
  const pendingLocalMoveRef = useRef<{ expectedHistoryLength: number; expectedMoveIndex: number } | null>(null);
  
  const resetMatch = useCallback(async () => {
    if (!match) {
      return;
    }
    try {
      await base.importState(match.initial_state);
      lastSyncedStateRef.current = { 
        matchId: match.id, 
        snapshotMoveIndex: -1,
        appliedMoveCount: 0
      };
      pendingLocalMoveRef.current = null;
      setClock(deriveInitialClocks(match));
    } catch (error) {
      console.error('Failed to reset match to server snapshot', error);
    }
  }, [base.importState, match]);
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
      lastSyncedStateRef.current = { matchId: null, snapshotMoveIndex: -1, appliedMoveCount: 0 };
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
      lastSyncedStateRef.current = { matchId: match.id, snapshotMoveIndex: -1, appliedMoveCount: 0 };
      pendingLocalMoveRef.current = null;
    }

    setClockEnabled(match.clock_initial_seconds ? match.clock_initial_seconds > 0 : false);
    previousMatchRef.current = next;
  }, [match?.id, match?.clock_initial_seconds, match?.status, match]);

  // This effect is now handled by the main state sync effect below

  // Main state synchronization effect - imports snapshot and replays moves
  useEffect(() => {
    if (!match || base.loading) {
      if (!match) {
        lastSyncedStateRef.current = { matchId: null, snapshotMoveIndex: -1, appliedMoveCount: 0 };
      }
      return;
    }

    const lastSynced = lastSyncedStateRef.current;
    
    // Check if we need to resync (match changed or moves changed)
    const needsResync = lastSynced.matchId !== match.id || lastSynced.appliedMoveCount !== moves.length;
    
    if (!needsResync) {
      return;
    }

    console.log('useOnlineSantorini: Syncing state', { 
      matchId: match.id, 
      movesCount: moves.length,
      lastSynced 
    });

    // Find the most recent snapshot
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
      console.warn('useOnlineSantorini: No snapshot available');
      return;
    }

    const snapshotMoveIndex = snapshotSource ? snapshotSource.move_index : -1;

    (async () => {
      try {
        console.log('useOnlineSantorini: Importing snapshot from move', snapshotMoveIndex);
        
        // Import the snapshot
        await base.importState(snapshot);
        
        // Find moves that come after the snapshot
        const movesToReplay = moves.filter(m => m.move_index > snapshotMoveIndex);
        
        console.log('useOnlineSantorini: Replaying', movesToReplay.length, 'moves after snapshot');
        
        // Replay each move after the snapshot
        for (const moveRecord of movesToReplay) {
          const action = moveRecord.action;
          if (isSantoriniMoveAction(action) && typeof action.move === 'number') {
            try {
              await base.applyMove(action.move, { triggerAi: false, asHuman: false });
              console.log('useOnlineSantorini: Replayed move', action.move, 'at index', moveRecord.move_index);
            } catch (error) {
              console.error('useOnlineSantorini: Failed to replay move', action.move, error);
              // Don't throw - continue with next moves
            }
          }
        }
        
        // Update clock states from all moves
        setClock(deriveInitialClocks(match));
        for (const moveRecord of moves) {
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
        }
        
        lastSyncedStateRef.current = { 
          matchId: match.id, 
          snapshotMoveIndex,
          appliedMoveCount: moves.length
        };
        
        console.log('useOnlineSantorini: State sync complete');
      } catch (error) {
        console.error('useOnlineSantorini: Failed to synchronize board with server', error);
      }
    })();
  }, [base.applyMove, base.importState, base.loading, clockEnabled, match, moves]);

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

  // Move submission effect - submits local moves to the server
  useEffect(() => {
    const pending = pendingLocalMoveRef.current;
    if (!pending || !match || !role) {
      return;
    }

    // Check if the local history has grown (new move was made)
    if (base.history.length <= pending.expectedHistoryLength) {
      return;
    }

    const lastMove = base.history[base.history.length - 1];
    if (!lastMove || typeof lastMove.action !== 'number') {
      pendingLocalMoveRef.current = null;
      return;
    }

    const expectedMoveIndex = pending.expectedMoveIndex;
    
    // Check if this move has already been received from the server
    const serverHasThisMove = moves.length > expectedMoveIndex;
    
    if (serverHasThisMove) {
      // The server already has this move (received via real-time from our submission or opponent's move)
      const serverMove = moves[expectedMoveIndex];
      const serverAction = serverMove?.action;
      
      if (isSantoriniMoveAction(serverAction) && serverAction.move === lastMove.action) {
        console.log('useOnlineSantorini: Move already received from server, skipping submission', {
          moveIndex: expectedMoveIndex,
          move: lastMove.action
        });
        pendingLocalMoveRef.current = null;
        return;
      }
    }

    // Clear the pending move ref before submission to prevent duplicate submissions
    pendingLocalMoveRef.current = null;

    const updatedClock = clockEnabled
      ? {
          creatorMs: clock.creatorMs,
          opponentMs: clock.opponentMs,
        }
      : undefined;

    const movePayload: SantoriniMoveAction = {
      kind: 'santorini.move',
      move: lastMove.action,
      by: role,
      clocks: updatedClock,
    };

    console.log('useOnlineSantorini: Submitting move to server', { 
      moveIndex: expectedMoveIndex, 
      move: lastMove.action,
      by: role 
    });

    onSubmitMove(match, expectedMoveIndex, movePayload)
      .catch((error) => {
        console.error('useOnlineSantorini: Failed to submit move', error);
        toast({
          title: 'Failed to send move',
          status: 'error',
          description: error instanceof Error ? error.message : 'Unknown error',
        });
        
        // On error, we might want to retry or reset the local state
        // For now, just log it - the user can retry by making the move again
      });
  }, [base.history, clock, clockEnabled, match, moves, onSubmitMove, role, toast]);

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
      if (pendingLocalMoveRef.current) {
        toast({ title: 'Please wait - syncing previous move', status: 'info' });
        return;
      }
      if (currentTurn !== role) {
        toast({ title: "It's not your turn", status: 'warning' });
        return;
      }
      
      // Don't allow moves while state is still syncing
      const lastSynced = lastSyncedStateRef.current;
      if (lastSynced.matchId !== match.id || lastSynced.appliedMoveCount !== moves.length) {
        toast({ title: 'Please wait - syncing game state', status: 'info' });
        return;
      }

      // Calculate the correct move index based on existing moves
      const nextMoveIndex = moves.length;
      const historyLengthBeforeMove = base.history.length;
      
      // Set pending move ref BEFORE making the move
      pendingLocalMoveRef.current = { 
        expectedHistoryLength: historyLengthBeforeMove, 
        expectedMoveIndex: nextMoveIndex 
      };
      
      try {
        await base.onCellClick(y, x);
        
        // If the move didn't add to history (e.g., invalid move), clear the pending ref
        if (base.history.length === historyLengthBeforeMove) {
          pendingLocalMoveRef.current = null;
        }
      } catch (error) {
        // If move failed, clear the pending ref
        pendingLocalMoveRef.current = null;
        console.error('useOnlineSantorini: Move failed', error);
      }
    },
    [base, currentTurn, match, moves.length, role, toast],
  );

  // Game completion detection effect
  useEffect(() => {
    if (!match || !onGameComplete || match.status !== 'in_progress') {
      return;
    }
    
    // Check if game has ended based on game engine state
    const [p0Score, p1Score] = base.gameEnded;
    if (p0Score !== 0 || p1Score !== 0) {
      // Game ended - determine winner
      let winnerId: string | null = null;
      if (p0Score > 0) {
        winnerId = match.creator_id; // Player 0 (creator) won
      } else if (p1Score > 0) {
        winnerId = match.opponent_id; // Player 1 (opponent) won
      }
      
      console.log('useOnlineSantorini: Game completed detected, winner:', winnerId);
      onGameComplete(winnerId);
    }
  }, [base.gameEnded, match, onGameComplete]);

  // Clock timeout detection effect
  useEffect(() => {
    if (!clockEnabled || !match || match.status !== 'in_progress' || !role || !onGameComplete) {
      return;
    }
    
    // Check if either clock has run out (with small buffer to avoid floating point issues)
    if (clock.creatorMs <= 100 && currentTurn === 'creator') {
      // Creator ran out of time, opponent wins
      console.log('useOnlineSantorini: Creator ran out of time, opponent wins');
      if (match.opponent_id) {
        onGameComplete(match.opponent_id);
      }
    } else if (clock.opponentMs <= 100 && currentTurn === 'opponent') {
      // Opponent ran out of time, creator wins
      console.log('useOnlineSantorini: Opponent ran out of time, creator wins');
      onGameComplete(match.creator_id);
    }
  }, [clock, clockEnabled, currentTurn, match, onGameComplete, role]);

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
