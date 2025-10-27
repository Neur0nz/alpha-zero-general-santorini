import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { SantoriniEngine, type SantoriniSnapshot } from '@/lib/santoriniEngine';
import { renderCellSvg } from '@game/svg';
import { useToast } from '@chakra-ui/react';

export interface BoardCell {
  worker: number;
  level: number;
  levels: number;
  svg: string;
  highlight: boolean;
}

/**
 * TypeScript-based LOCAL Santorini hook (human vs human, no AI)
 * 
 * NO PYTHON/PYODIDE! Pure TypeScript for instant loading.
 * For AI features, use useSantorini.tsx instead.
 */

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

function computeSelectable(validMoves: boolean[], snapshot: SantoriniSnapshot): boolean[][] {
  const selectable: boolean[][] = Array.from({ length: 5 }, () => Array(5).fill(false));
  
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
  
  // During game phase: Don't auto-highlight cells
  // The move selection requires clicking a worker first, then showing valid moves/builds
  // This would require move selector state which we'll skip for now
  // Just return empty selectable - user can still click cells and the engine will validate
  
  return selectable;
}

export function useLocalSantorini() {
  const toast = useToast();
  
  // Game state
  const [engine, setEngine] = useState<SantoriniEngine>(() => SantoriniEngine.createInitial().engine);
  const [board, setBoard] = useState<BoardCell[][]>(() => engineToBoard(engine.snapshot));
  const [selectable, setSelectable] = useState<boolean[][]>(() => computeSelectable(engine.getValidMoves(), engine.snapshot));
  const [history, setHistory] = useState<Array<{ action: number; description: string }>>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  const nextPlayer = useMemo(() => engine.player, [engine]);
  
  const gameEnded = useMemo(() => {
    const [p0Score, p1Score] = engine.getGameEnded();
    return p0Score !== 0 || p1Score !== 0;
  }, [engine]);
  
  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex < history.length - 1;

  const initialize = useCallback(async () => {
    const { engine: newEngine } = SantoriniEngine.createInitial();
    setEngine(newEngine);
    setBoard(engineToBoard(newEngine.snapshot));
    setSelectable(computeSelectable(newEngine.getValidMoves(), newEngine.snapshot));
    setHistory([]);
    setHistoryIndex(-1);
  }, []);

  const reset = useCallback(async () => {
    await initialize();
  }, [initialize]);

  const onCellClick = useCallback(
    (y: number, x: number) => {
      if (gameEnded) {
        toast({ title: 'Game has ended', status: 'info' });
        return;
      }

      const validMoves = engine.getValidMoves();
      
      // During placement phase
      const placementAction = y * 5 + x;
      if (placementAction < 25 && validMoves[placementAction]) {
        try {
          const result = engine.applyMove(placementAction);
          const newEngine = SantoriniEngine.fromSnapshot(result.snapshot);
          
          setEngine(newEngine);
          setBoard(engineToBoard(newEngine.snapshot));
          setSelectable(computeSelectable(newEngine.getValidMoves(), newEngine.snapshot));
          
          // Update history
          const newHistory = history.slice(0, historyIndex + 1);
          newHistory.push({
            action: placementAction,
            description: `Place worker at (${x}, ${y})`,
          });
          setHistory(newHistory);
          setHistoryIndex(newHistory.length - 1);
        } catch (error) {
          console.error('Move failed:', error);
          toast({ title: 'Invalid move', status: 'error' });
        }
        return;
      }

      // For game phase moves, simplified implementation
      toast({ title: 'Move selection not yet fully implemented for game phase', status: 'warning' });
    },
    [engine, gameEnded, history, historyIndex, toast],
  );

  const undo = useCallback(async () => {
    if (!canUndo) return;

    try {
      // Rebuild engine from initial state + history up to new index
      const { engine: newEngine } = SantoriniEngine.createInitial();
      let currentEngine = newEngine;
      
      const newIndex = historyIndex - 1;
      for (let i = 0; i <= newIndex; i++) {
        const result = currentEngine.applyMove(history[i].action);
        currentEngine = SantoriniEngine.fromSnapshot(result.snapshot);
      }
      
      setEngine(currentEngine);
      setBoard(engineToBoard(currentEngine.snapshot));
      setSelectable(computeSelectable(currentEngine.getValidMoves(), currentEngine.snapshot));
      setHistoryIndex(newIndex);
    } catch (error) {
      console.error('Undo failed:', error);
      toast({ title: 'Undo failed', status: 'error' });
    }
  }, [canUndo, historyIndex, history, toast]);

  const redo = useCallback(async () => {
    if (!canRedo) return;

    try {
      const newIndex = historyIndex + 1;
      const move = history[newIndex];
      
      const result = engine.applyMove(move.action);
      const newEngine = SantoriniEngine.fromSnapshot(result.snapshot);
      
      setEngine(newEngine);
      setBoard(engineToBoard(newEngine.snapshot));
      setSelectable(computeSelectable(newEngine.getValidMoves(), newEngine.snapshot));
      setHistoryIndex(newIndex);
    } catch (error) {
      console.error('Redo failed:', error);
      toast({ title: 'Redo failed', status: 'error' });
    }
  }, [canRedo, historyIndex, history, engine, toast]);

  // Stub functions for compatibility
  const onCellHover = useCallback(async () => {}, []);
  const onCellLeave = useCallback(async () => {}, []);

  // Memoize controls to prevent infinite re-renders
  const controls = useMemo(
    () => ({
      triggerAi: async () => {},
      applyBestMove: async () => {},
      enableEvaluation: async () => {},
      disableEvaluation: async () => {},
      setGameMode: async (_mode: string) => {},
      reset: async () => { await reset(); },
    }),
    [reset],
  );

  return {
    loading: false,
    board,
    selectable,
    onCellClick,
    onCellHover,
    onCellLeave,
    initialize,
    reset,
    undo,
    redo,
    nextPlayer,
    gameEnded,
    history,
    buttons: {
      loading: false,
      canUndo,
      canRedo,
      status: '',
      editMode: 0,
      setupMode: false,
      setupTurn: 0,
    },
    controls,
  };
}

