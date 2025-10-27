import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SantoriniEngine, type SantoriniSnapshot } from '@/lib/santoriniEngine';
import { TypeScriptMoveSelector } from '@/lib/moveSelectorTS';
import { renderCellSvg } from '@game/svg';
import type { LobbyMatch } from './useMatchLobby';
import type { MatchAction, MatchMoveRecord, SantoriniMoveAction } from '@/types/match';
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

export interface BoardCell {
  worker: number;
  level: number;
  levels: number;
  svg: string;
  highlight: boolean;
}

/**
 * TypeScript-based online Santorini hook
 * 
 * NO PYTHON/PYODIDE! Pure TypeScript for fast loading and validation.
 * Uses the lightweight SantoriniEngine for all game logic.
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

function engineToBoard(snapshot: SantoriniSnapshot): BoardCell[][] {
  const board: BoardCell[][] = [];
  for (let y = 0; y < 5; y++) {
    const row: BoardCell[] = [];
    for (let x = 0; x < 5; x++) {
      const cell = snapshot.board[y][x];
      const worker = cell[0] || 0;
      const level = cell[1] || 0;
      row.push({
        worker,
        level,
        levels: level,
        svg: renderCellSvg({ levels: level, worker }),
        highlight: false,
      });
    }
    board.push(row);
  }
  return board;
}

function computeSelectable(
  validMoves: boolean[], 
  snapshot: SantoriniSnapshot,
  moveSelector: TypeScriptMoveSelector | null,
  isMyTurn: boolean
): boolean[][] {
  const selectable: boolean[][] = Array.from({ length: 5 }, () => Array(5).fill(false));
  
  // If it's not my turn, don't highlight anything!
  if (!isMyTurn) {
    return selectable;
  }
  
  // During placement phase (first 25 actions are placements)
  const hasPlacementMoves = validMoves.slice(0, 25).some(v => v);
  if (hasPlacementMoves) {
    for (let i = 0; i < 25; i++) {
      if (validMoves[i]) {
        const y = Math.floor(i / 5);
        const x = i % 5;
        selectable[y][x] = true;
      }
    }
    return selectable;
  }
  
  // During game phase: Use move selector to highlight relevant cells
  if (moveSelector) {
    return moveSelector.computeSelectable(snapshot.board, validMoves, snapshot.player);
  }
  
  return selectable;
}

export function useOnlineSantorini(options: UseOnlineSantoriniOptions) {
  const { match, moves, role, onSubmitMove, onGameComplete } = options;
  const matchId = match?.id ?? null;
  const toast = useToast();
  
  // Game engine state - pure TypeScript!
  const [engine, setEngine] = useState<SantoriniEngine>(() => SantoriniEngine.createInitial().engine);
  const [board, setBoard] = useState<BoardCell[][]>(() => engineToBoard(engine.snapshot));
  const moveSelectorRef = useRef<TypeScriptMoveSelector>(new TypeScriptMoveSelector());
  const [selectable, setSelectable] = useState<boolean[][]>(() => computeSelectable(engine.getValidMoves(), engine.snapshot, moveSelectorRef.current, false));
  
  // Clock state
  const [clock, setClock] = useState<ClockState>(() => deriveInitialClocks(match));
  const [clockEnabled, setClockEnabled] = useState(match?.clock_initial_seconds ? match.clock_initial_seconds > 0 : false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Sync tracking
  const lastSyncedStateRef = useRef<{ matchId: string | null; snapshotMoveIndex: number; appliedMoveCount: number }>({ 
    matchId: null, 
    snapshotMoveIndex: -1,
    appliedMoveCount: 0
  });
  const pendingLocalMoveRef = useRef<{ expectedHistoryLength: number; expectedMoveIndex: number; moveAction?: number } | null>(null);
  const gameCompletedRef = useRef<string | null>(null);
  const submissionLockRef = useRef<boolean>(false);
  
  const resetMatch = useCallback(() => {
    if (!match) return;
    
    try {
      const newEngine = SantoriniEngine.fromSnapshot(match.initial_state);
      setEngine(newEngine);
      setBoard(engineToBoard(newEngine.snapshot));
      moveSelectorRef.current.reset();
      const myTurn = role !== null && (newEngine.player === 0 ? 'creator' : 'opponent') === role;
      setSelectable(computeSelectable(newEngine.getValidMoves(), newEngine.snapshot, moveSelectorRef.current, myTurn));
      
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
  }, [match]);

  const previousMatchRef = useRef<{
    id: string | null;
    status: string | null;
    clockSeconds: number | null;
  }>({ id: null, status: null, clockSeconds: null });

  // Match change effect - reset clocks when match changes
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
      clockSeconds: match.clock_initial_seconds,
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

  // State synchronization effect - import snapshots and replay moves
  useEffect(() => {
    if (!match) {
      lastSyncedStateRef.current = { matchId: null, snapshotMoveIndex: -1, appliedMoveCount: 0 };
      return;
    }

    const lastSynced = lastSyncedStateRef.current;
    
    const needsResync = 
      lastSynced.matchId !== match.id || 
      lastSynced.appliedMoveCount !== moves.length;

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
    
    const snapshot: SantoriniSnapshot | null =
      snapshotSource?.state_snapshot ?? match.initial_state ?? null;
    if (!snapshot) {
      console.warn('useOnlineSantorini: No snapshot available');
      return;
    }

    const snapshotMoveIndex = snapshotSource ? snapshotSource.move_index : -1;

    try {
      console.log('useOnlineSantorini: Importing snapshot from move', snapshotMoveIndex);
      
      // Import the snapshot - pure TypeScript, instant!
      let newEngine = SantoriniEngine.fromSnapshot(snapshot);
      
      // Find moves that come after the snapshot
      const movesToReplay = moves.filter(m => m.move_index > snapshotMoveIndex);
      
      console.log('useOnlineSantorini: Replaying', movesToReplay.length, 'moves after snapshot');
      
      // Replay each move after the snapshot
      for (const moveRecord of movesToReplay) {
        const action = moveRecord.action;
        if (isSantoriniMoveAction(action) && typeof action.move === 'number') {
          try {
            const result = newEngine.applyMove(action.move);
            newEngine = SantoriniEngine.fromSnapshot(result.snapshot);
            console.log('useOnlineSantorini: Replayed move', action.move, 'at index', moveRecord.move_index);
          } catch (error) {
            console.error('useOnlineSantorini: Failed to replay move', action.move, error);
            // Don't throw - continue with next moves
          }
        }
      }
      
      // Update engine and board state
      setEngine(newEngine);
      setBoard(engineToBoard(newEngine.snapshot));
      moveSelectorRef.current.reset();
      const myTurn = role !== null && (newEngine.player === 0 ? 'creator' : 'opponent') === role;
      setSelectable(computeSelectable(newEngine.getValidMoves(), newEngine.snapshot, moveSelectorRef.current, myTurn));
      
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
  }, [clockEnabled, match, moves]);

  // Clock tick effect
  const currentTurn = useMemo(() => {
    if (!match) return null;
    return engine.player === 0 ? 'creator' : 'opponent';
  }, [engine, match]);
  
  const isMyTurn = useMemo(() => {
    return role !== null && currentTurn === role;
  }, [role, currentTurn]);

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

  // Move submission effect
  useEffect(() => {
    const pending = pendingLocalMoveRef.current;
    if (!pending || !match || !role) {
      return;
    }
    
    if (submissionLockRef.current) {
      console.log('useOnlineSantorini: Submission already in progress, skipping');
      return;
    }

    // Check if we actually have a new move
    const expectedMoveIndex = pending.expectedMoveIndex;
    
    // Check if the server already has this move
    const serverHasThisMove = moves.length > expectedMoveIndex;
    
    if (serverHasThisMove) {
      console.log('useOnlineSantorini: Move already received from server, skipping submission');
      pendingLocalMoveRef.current = null;
      return;
    }

    // Get the move from pending ref
    const moveAction = pending.moveAction;
    if (!moveAction) {
      pendingLocalMoveRef.current = null;
      return;
    }

    const updatedClock = clockEnabled
      ? {
          creatorMs: clock.creatorMs,
          opponentMs: clock.opponentMs,
        }
      : undefined;

    const movePayload: SantoriniMoveAction = {
      kind: 'santorini.move',
      move: moveAction,
      by: role,
      clocks: updatedClock,
    };

    console.log('useOnlineSantorini: Submitting move to server', { 
      moveIndex: expectedMoveIndex, 
      move: moveAction,
      by: role 
    });

    submissionLockRef.current = true;

    onSubmitMove(match, expectedMoveIndex, movePayload)
      .then(() => {
        console.log('useOnlineSantorini: Move submitted successfully');
        pendingLocalMoveRef.current = null;
      })
      .catch((error) => {
        console.error('useOnlineSantorini: Failed to submit move', error);
        toast({
          title: 'Failed to send move',
          status: 'error',
          description: error instanceof Error ? error.message : 'Unknown error',
        });
        pendingLocalMoveRef.current = null;
      })
      .finally(() => {
        submissionLockRef.current = false;
      });
  }, [clock, clockEnabled, match, moves, onSubmitMove, role, toast]);

  const formatClock = useCallback((ms: number) => {
    if (!clockEnabled) return '--:--';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [clockEnabled]);

  const onCellClick = useCallback(
    (y: number, x: number) => {
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
        console.log('useOnlineSantorini: Cannot make move - state not synced', {
          lastSynced,
          currentMatchId: match.id,
          currentMovesLength: moves.length,
        });
        toast({ title: 'Please wait - syncing game state', status: 'info' });
        return;
      }

      // Find valid move for this cell click
      const validMoves = engine.getValidMoves();
      
      // During placement, the action is simply y * 5 + x
      const placementAction = y * 5 + x;
      if (placementAction < 25 && validMoves[placementAction]) {
        try {
          const result = engine.applyMove(placementAction);
          const newEngine = SantoriniEngine.fromSnapshot(result.snapshot);
          setEngine(newEngine);
          setBoard(engineToBoard(newEngine.snapshot));
          moveSelectorRef.current.reset();
          const myTurn = role !== null && (newEngine.player === 0 ? 'creator' : 'opponent') === role;
          setSelectable(computeSelectable(newEngine.getValidMoves(), newEngine.snapshot, moveSelectorRef.current, myTurn));
          
          // Calculate the correct move index
          const pendingCount = pendingLocalMoveRef.current ? 1 : 0;
          const nextMoveIndex = moves.length + pendingCount;
          
          // Store pending move
          pendingLocalMoveRef.current = { 
            expectedHistoryLength: 0, // Not used in TS version
            expectedMoveIndex: nextMoveIndex,
            moveAction: placementAction,
          };
        } catch (error) {
          console.error('useOnlineSantorini: Move failed', error);
          toast({ title: 'Invalid move', status: 'error' });
        }
        return;
      }

      // During game phase: Use move selector
      const moveSelector = moveSelectorRef.current;
      const clicked = moveSelector.click(y, x, engine.snapshot.board, validMoves, engine.player);
      
      if (!clicked) {
        toast({ title: 'Invalid selection', status: 'warning' });
        return;
      }
      
      // Update highlighting for next stage
      setSelectable(computeSelectable(validMoves, engine.snapshot, moveSelector, isMyTurn));
      
      // Check if move is complete
      const action = moveSelector.getAction();
      if (action >= 0) {
        // Move is complete - apply it and submit
        try {
          const result = engine.applyMove(action);
          const newEngine = SantoriniEngine.fromSnapshot(result.snapshot);
          setEngine(newEngine);
          setBoard(engineToBoard(newEngine.snapshot));
          moveSelector.reset();
          const myTurn = role !== null && (newEngine.player === 0 ? 'creator' : 'opponent') === role;
          setSelectable(computeSelectable(newEngine.getValidMoves(), newEngine.snapshot, moveSelector, myTurn));
          
          // Calculate move index and submit
          const pendingCount = pendingLocalMoveRef.current ? 1 : 0;
          const nextMoveIndex = moves.length + pendingCount;
          
          pendingLocalMoveRef.current = {
            expectedHistoryLength: 0,
            expectedMoveIndex: nextMoveIndex,
            moveAction: action,
          };
        } catch (error) {
          console.error('useOnlineSantorini: Move failed', error);
          toast({ title: 'Move failed', status: 'error' });
          moveSelector.reset();
          setSelectable(computeSelectable(validMoves, engine.snapshot, moveSelector, isMyTurn));
        }
      }
    },
    [currentTurn, engine, isMyTurn, match, moves.length, role, toast],
  );

  // Game completion detection
  useEffect(() => {
    if (!match || !onGameComplete || match.status !== 'in_progress') {
      if (!match || match.status !== 'in_progress') {
        gameCompletedRef.current = null;
      }
      return;
    }
    
    if (gameCompletedRef.current === match.id) {
      return;
    }

    const [p0Score, p1Score] = engine.getGameEnded();
    if (p0Score === 0 && p1Score === 0) {
      return;
    }

    gameCompletedRef.current = match.id;

    const winnerId = p0Score === 1 ? match.creator_id : p1Score === 1 ? match.opponent_id : null;
    
    console.log('useOnlineSantorini: Game completed detected, winner:', winnerId);
    onGameComplete(winnerId);
  }, [engine, match, onGameComplete]);

  // Clock timeout detection
  useEffect(() => {
    if (!match || !onGameComplete || !clockEnabled || match.status !== 'in_progress') {
      return;
    }
    
    if (gameCompletedRef.current === match.id) {
      return;
    }

    if (clock.creatorMs <= 100 && currentTurn === 'creator') {
      gameCompletedRef.current = match.id;
      console.log('useOnlineSantorini: Creator ran out of time, opponent wins');
      onGameComplete(match.opponent_id);
      return;
    }

    if (clock.opponentMs <= 100 && currentTurn === 'opponent') {
      gameCompletedRef.current = match.id;
      console.log('useOnlineSantorini: Opponent ran out of time, creator wins');
      onGameComplete(match.creator_id);
    }
  }, [clock, clockEnabled, currentTurn, match, onGameComplete]);

  // Stub functions for compatibility with GameBoard component
  const onCellHover = useCallback(async () => {}, []);
  const onCellLeave = useCallback(async () => {}, []);
  const undo = useCallback(async () => {}, []);
  const redo = useCallback(async () => {}, []);

  return {
    board,
    selectable,
    onCellClick,
    onCellHover,
    onCellLeave,
    resetMatch,
    currentTurn,
    creatorClockMs: clock.creatorMs,
    opponentClockMs: clock.opponentMs,
    formatClock,
    gameEnded: engine.getGameEnded(),
    buttons: { loading: false, canUndo: false, canRedo: false, status: '', editMode: 0, setupMode: false, setupTurn: 0 },
    undo,
    redo,
    history: [] as Array<{ action: number; description: string }>,
  };
}
