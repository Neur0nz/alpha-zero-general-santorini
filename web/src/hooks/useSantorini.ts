import { useCallback, useMemo, useRef, useState } from 'react';
import { loadScript } from '@/utils/scriptLoader';
import { Santorini } from '@game/santorini';
import { MoveSelector } from '@game/moveSelector';
import { renderCellSvg, type CellState } from '@game/svg';
import { GAME_CONSTANTS } from '@game/constants';

const PY_FILES: Array<[string, string]> = [
  ['santorini/Game.py', 'Game.py'],
  ['santorini/proxy.py', 'proxy.py'],
  ['santorini/MCTS.py', 'MCTS.py'],
  ['santorini/SantoriniDisplay.py', 'SantoriniDisplay.py'],
  ['santorini/SantoriniGame.py', 'SantoriniGame.py'],
  ['santorini/SantoriniLogicNumba.py', 'SantoriniLogicNumba.py'],
  ['santorini/SantoriniConstants.py', 'SantoriniConstants.py'],
];

const MODEL_FILENAME = '/santorini/model_no_god.onnx';
const SIZE_CB = [1, 25, 3];
const ONNX_OUTPUT_SIZE = 162;

export type BoardCell = CellState & {
  svg: string;
  highlight: boolean;
};

export type ButtonsState = {
  loading: boolean;
  canUndo: boolean;
  canRedo: boolean;
  editMode: number;
  status: string;
  setupMode: boolean;
  setupTurn: number;
};

export type EvaluationState = {
  value: number;
  advantage: string;
  label: string;
};

export type MoveSummary = {
  description: string;
  player: number;
  action: number | null;
};

export type TopMove = {
  action: number;
  prob: number;
  text: string;
  eval?: number;
  delta?: number;
};

export type Controls = {
  reset: () => Promise<void>;
  setGameMode: (mode: 'P0' | 'P1' | 'Human' | 'AI') => Promise<void>;
  changeDifficulty: (sims: number) => void;
  toggleEdit: () => void;
  setEditMode: (mode: number) => void;
  refreshEvaluation: () => Promise<void>;
  calculateOptions: () => Promise<void>;
  updateCalcDepth: (depth: number | null) => void;
  jumpToMove: (index: number) => Promise<void>;
  startGuidedSetup: () => Promise<void>;
  finalizeGuidedSetup: () => Promise<void>;
};

const INITIAL_BOARD: BoardCell[][] = Array.from({ length: GAME_CONSTANTS.BOARD_SIZE }, () =>
  Array.from({ length: GAME_CONSTANTS.BOARD_SIZE }, () => ({ levels: 0, worker: 0, svg: '', highlight: false })),
);

const INITIAL_SELECTABLE = Array.from({ length: GAME_CONSTANTS.BOARD_SIZE }, () =>
  Array.from({ length: GAME_CONSTANTS.BOARD_SIZE }, () => false),
);

export function useSantorini() {
  const [loading, setLoading] = useState(true);
  const [board, setBoard] = useState<BoardCell[][]>(INITIAL_BOARD);
  const [selectable, setSelectable] = useState<boolean[][]>(INITIAL_SELECTABLE);
  const [buttons, setButtons] = useState<ButtonsState>({
    loading: true,
    canRedo: false,
    canUndo: false,
    editMode: 0,
    status: 'Loading engine...',
    setupMode: false,
    setupTurn: 0
  });
  const [evaluation, setEvaluation] = useState<EvaluationState>({ value: 0, advantage: 'Balanced', label: '0.00' });
  const [topMoves, setTopMoves] = useState<TopMove[]>([]);
  const [history, setHistory] = useState<MoveSummary[]>([]);
  const [calcOptionsBusy, setCalcOptionsBusy] = useState(false);
  const [calcDepthOverride, setCalcDepthOverride] = useState<number | null>(null);

  const gameRef = useRef<Santorini>();
  const selectorRef = useRef<MoveSelector>();
  const aiPromiseRef = useRef<Promise<void>>(Promise.resolve());

  const initOnnxSession = useCallback(async () => {
    if (!window.ort) {
      throw new Error('ONNX runtime not available');
    }
    try {
      const session = await window.ort.InferenceSession.create(MODEL_FILENAME);
      (window as any).onnxSession = session;
      (window as any).predict = async (canonicalBoard: any, valids: any) => {
        const boardArray = Array.from(canonicalBoard) as number[];
        const validsArray = Array.from(valids) as number[];
        const tensorBoard = new window.ort.Tensor('float32', Float32Array.from(boardArray), SIZE_CB);
        const tensorValid = new window.ort.Tensor('bool', new Uint8Array(validsArray), [1, ONNX_OUTPUT_SIZE]);
        const results = await session.run({
          board: tensorBoard,
          valid_actions: tensorValid,
        });
        return {
          pi: Array.from(results.pi.data),
          v: Array.from(results.v.data),
        };
      };
    } catch (error) {
      console.error('Failed to initialize ONNX session:', error);
      throw error;
    }
  }, []);

  const loadPyodideRuntime = useCallback(async () => {
    try {
      const pyodideUrl = import.meta.env.VITE_PYODIDE_URL as string;
      const onnxUrl = import.meta.env.VITE_ONNX_URL as string;
      
      
      if (!pyodideUrl || !onnxUrl) {
        throw new Error('Missing required environment variables: VITE_PYODIDE_URL and VITE_ONNX_URL');
      }
      
      await Promise.all([loadScript(pyodideUrl), loadScript(onnxUrl)]);
      
      // Wait a bit for the script to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (!window.loadPyodide) {
        throw new Error('Pyodide runtime missing - failed to load Pyodide script');
      }
      
      const pyodide = await window.loadPyodide({ fullStdLib: false });
      await pyodide.loadPackage('numpy');
      
      for (const [input, output] of PY_FILES) {
        const response = await fetch(input);
        if (!response.ok) {
          throw new Error(`Failed to load Python file: ${input}`);
        }
        const data = await response.arrayBuffer();
        pyodide.FS.writeFile(output, new Uint8Array(data));
      }
      
      const game = new Santorini();
      game.setBackend(pyodide);
      gameRef.current = game;
      selectorRef.current = new MoveSelector(game);
      await initOnnxSession();
    } catch (error) {
      console.error('Failed to load Pyodide runtime:', error);
      throw error;
    }
  }, [initOnnxSession]);

  const readBoard = useCallback(() => {
    const game = gameRef.current;
    if (!game || !game.py) return;
    const nextBoard: BoardCell[][] = Array.from({ length: GAME_CONSTANTS.BOARD_SIZE }, (_, y) =>
      Array.from({ length: GAME_CONSTANTS.BOARD_SIZE }, (_, x) => {
        const cell: CellState = {
          levels: game.py._read_level(y, x),
          worker: game.py._read_worker(y, x),
        };
        const highlight = game.has_changed_on_last_move([y, x]);
        return { ...cell, svg: renderCellSvg(cell), highlight };
      }),
    );
    setBoard(nextBoard);
  }, []);

  const updateSelectable = useCallback(() => {
    const selector = selectorRef.current;
    if (!selector) return;
    selector.selectRelevantCells();
    setSelectable(selector.cells.map((row) => row.slice()));
  }, []);

  const updateButtons = useCallback(async (loadingState = false) => {
    const game = gameRef.current;
    const selector = selectorRef.current;
    if (!game || !selector) return;
    const py = game.py;
    let canUndo = false;
    let canRedo = false;
    if (py && py.get_history_length) {
      canUndo = py.get_history_length() > 0;
    }
    if (py && py.get_redo_count) {
      canRedo = py.get_redo_count() > 0;
    }
    const stage = selector.stage;
    let status = '';
    if (stage <= 0) {
      status = 'Ready. Select a worker to start your move.';
    } else if (stage === 1) {
      status = 'Step 1/3: Select destination for the worker.';
    } else if (stage === 2) {
      status = 'Step 2/3: Select a build square.';
    } else {
      status = 'Confirming build.';
    }
    setButtons(prev => ({
      ...prev,
      loading: loadingState,
      canUndo,
      canRedo,
      editMode: selector.editMode,
      status,
    }));
  }, []);

  const refreshHistory = useCallback(() => {
    const game = gameRef.current;
    if (!game || !game.py || !game.py.get_history_snapshot) return;
    const snapshot = game.py.get_history_snapshot().toJs({ create_proxies: false }) as Array<{
      player: number;
      action: number;
      description: string;
    }>;
    setHistory(snapshot);
  }, []);

  const refreshEvaluation = useCallback(async () => {
    const game = gameRef.current;
    if (!game || !game.py) return;
    
    try {
      if (game.py.calculate_eval_for_current_position) {
        const resultProxy = await game.py.calculate_eval_for_current_position();
        const result = Array.isArray(resultProxy)
          ? resultProxy
          : resultProxy.toJs({ create_proxies: false });
        if (Array.isArray(result) && result.length >= 2) {
          const value = Number(result[0]);
          const label = value >= 0 ? `+${value.toFixed(3)}` : value.toFixed(3);
          const advantage = value > 0 ? 'Player 0 ahead' : value < 0 ? 'Player 1 ahead' : 'Balanced';
          setEvaluation({ value, label, advantage });
        }
      }
      if (game.py.list_current_moves) {
        const movesProxy = game.py.list_current_moves(10);
        const moves = movesProxy.toJs({ create_proxies: false }) as TopMove[];
        setTopMoves(moves ?? []);
      }
    } catch (error) {
      console.error('Failed to refresh evaluation:', error);
      // Set default evaluation on error
      setEvaluation({ value: 0, advantage: 'Error', label: '0.00' });
      setTopMoves([]);
    }
  }, []);

  const calculateOptions = useCallback(async () => {
    const game = gameRef.current;
    if (!game || !game.py || !game.py.list_current_moves_with_adv) return;
    setCalcOptionsBusy(true);
    try {
      const resultProxy = await game.py.list_current_moves_with_adv(6, calcDepthOverride ?? undefined);
      const result = resultProxy.toJs({ create_proxies: false }) as TopMove[];
      setTopMoves(result ?? []);
    } catch (error) {
      console.error('Failed to calculate options:', error);
      setTopMoves([]);
    } finally {
      setCalcOptionsBusy(false);
    }
  }, [calcDepthOverride]);

  const syncUi = useCallback(async (loadingState = false) => {
    readBoard();
    updateSelectable();
    await updateButtons(loadingState);
    refreshHistory();
  }, [readBoard, updateSelectable, updateButtons, refreshHistory]);

  const initialize = useCallback(async () => {
    setLoading(true);
    await loadPyodideRuntime();
    const game = gameRef.current;
    const selector = selectorRef.current;
    if (!game || !selector) return;
    game.init_game();
    selector.resetAndStart();
    await syncUi(true);
    await refreshEvaluation();
    setLoading(false);
    setButtons((prev) => ({ ...prev, loading: false }));
  }, [loadPyodideRuntime, refreshEvaluation, syncUi]);

  const aiPlayIfNeeded = useCallback(async () => {
    const game = gameRef.current;
    const selector = selectorRef.current;
    if (!game || !selector) return;
    await updateButtons(true);
    while (game.gameEnded.every((x: number) => !x) && !game.is_human_player('next')) {
      selector.selectNone();
      readBoard();
      await game.ai_guess_and_move();
      readBoard();
      updateSelectable();
      await refreshEvaluation();
      refreshHistory();
    }
    await updateButtons(false);
  }, [readBoard, refreshEvaluation, refreshHistory, updateButtons, updateSelectable]);

  const ensureAiIdle = useCallback(() => aiPromiseRef.current, []);

  const finalizeGuidedSetup = useCallback(async () => {
    const game = gameRef.current;
    const selector = selectorRef.current;
    if (!game || !selector) return;
    
    try {
      // Normalize worker IDs and exit edit mode
      game.editCell(-1, -1, 0);
      selector.selectRelevantCells();
      
      // Tell backend to finalize setup and refresh state triplet
      if (game.py && game.py.end_setup) {
        const data_tuple = game.py.end_setup().toJs({ create_proxies: false });
        if (Array.isArray(data_tuple) && data_tuple.length >= 3) {
          [game.nextPlayer, game.gameEnded, game.validMoves] = data_tuple;
        }
      }
      
      // Exit setup mode
      setButtons(prev => ({
        ...prev,
        setupMode: false,
        setupTurn: 0,
        editMode: 0,
        status: 'Setup complete. Ready to play!'
      }));
      
      // Refresh UI
      readBoard();
      updateSelectable();
      await refreshEvaluation();
      refreshHistory();
    } catch (error) {
      console.error('Failed to finalize setup:', error);
    }
  }, [readBoard, updateSelectable, refreshEvaluation, refreshHistory]);

  const placeWorkerForSetup = useCallback((y: number, x: number) => {
    const game = gameRef.current;
    if (!game || !game.py) return;
    
    const current = game.py._read_worker(y, x);
    if (current !== 0) {
      // Only allow placing on empty cells during setup
      return;
    }
    
    const setupTurn = buttons.setupTurn;
    const placingGreen = (setupTurn === 0 || setupTurn === 1);
    
    // editCell mode 2 cycles: 0 -> +1 -> -1 -> 0 ...
    if (placingGreen) {
      game.editCell(y, x, 2); // 0 -> +1
    } else {
      game.editCell(y, x, 2); // 0 -> +1
      game.editCell(y, x, 2); // +1 -> -1
    }
    
    const newSetupTurn = setupTurn + 1;
    const steps = ['Place Green piece 1', 'Place Green piece 2', 'Place Red piece 1', 'Place Red piece 2'];
    const status = newSetupTurn < steps.length ? steps[newSetupTurn] : 'Setup complete';
    
    setButtons(prev => ({
      ...prev,
      setupTurn: newSetupTurn,
      status
    }));
    
    readBoard();
    
    if (newSetupTurn >= 4) {
      finalizeGuidedSetup();
    }
  }, [buttons.setupTurn, readBoard, finalizeGuidedSetup]);

  const onCellClick = useCallback(
    async (y: number, x: number) => {
      const game = gameRef.current;
      const selector = selectorRef.current;
      if (!game || !selector) return;
      
      // Handle setup mode
      if (buttons.setupMode) {
        placeWorkerForSetup(y, x);
        return;
      }
      
      selector.click(y, x);
      updateSelectable();
      const move = selector.getMove();
      if (move >= 0) {
        game.move(move, true);
        selector.reset();
        selector.start();
        await syncUi();
        await refreshEvaluation();
        aiPromiseRef.current = ensureAiIdle().then(() => aiPlayIfNeeded());
      } else {
        updateButtons(false);
      }
    },
    [aiPlayIfNeeded, ensureAiIdle, refreshEvaluation, syncUi, updateButtons, updateSelectable, buttons.setupMode, placeWorkerForSetup],
  );

  const onCellHover = useCallback((_y: number, _x: number) => {
    // Placeholder for future hover previews.
  }, []);

  const onCellLeave = useCallback((_y: number, _x: number) => {
    // Placeholder for future hover previews.
  }, []);

  const undo = useCallback(async () => {
    const game = gameRef.current;
    const selector = selectorRef.current;
    if (!game || !selector || !game.py) return;
    await ensureAiIdle();
    game.revert_to_previous_human_move();
    selector.resetAndStart();
    await syncUi();
    await refreshEvaluation();
  }, [ensureAiIdle, refreshEvaluation, syncUi]);

  const redo = useCallback(async () => {
    const game = gameRef.current;
    const selector = selectorRef.current;
    if (!game || !selector || !game.py || !game.py.redo_next_move) return;
    await ensureAiIdle();
    const resultProxy = game.py.redo_next_move();
    if (resultProxy && resultProxy.toJs) {
      resultProxy.toJs({ create_proxies: false });
    }
    selector.resetAndStart();
    await syncUi();
    await refreshEvaluation();
  }, [ensureAiIdle, refreshEvaluation, syncUi]);

  const reset = useCallback(async () => {
    const game = gameRef.current;
    const selector = selectorRef.current;
    if (!game || !selector) return;
    await ensureAiIdle();
    game.init_game();
    selector.resetAndStart();
    await syncUi();
    await refreshEvaluation();
  }, [ensureAiIdle, refreshEvaluation, syncUi]);

  const setGameMode = useCallback(
    async (mode: 'P0' | 'P1' | 'Human' | 'AI') => {
      const game = gameRef.current;
      const selector = selectorRef.current;
      if (!game || !selector) return;
      game.gameMode = mode;
      await ensureAiIdle();
      selector.resetAndStart();
      await aiPlayIfNeeded();
      await syncUi();
    },
    [aiPlayIfNeeded, ensureAiIdle, syncUi],
  );

  const changeDifficulty = useCallback((sims: number) => {
    const game = gameRef.current;
    if (!game) return;
    game.change_difficulty(sims);
  }, []);

  const toggleEdit = useCallback(() => {
    const selector = selectorRef.current;
    if (!selector) return;
    selector.edit();
    updateSelectable();
    updateButtons(false);
  }, [updateButtons, updateSelectable]);

  const setEditMode = useCallback(
    (mode: number) => {
      const selector = selectorRef.current;
      if (!selector) return;
      selector.setEditMode(mode);
      updateSelectable();
      updateButtons(false);
    },
    [updateButtons, updateSelectable],
  );

  const jumpToMove = useCallback(
    async (index: number) => {
      const game = gameRef.current;
      const selector = selectorRef.current;
      if (!game || !selector || !game.py || !game.py.jump_to_move_index) return;
      const historyLength = game.py.get_history_length();
      const reverseIndex = historyLength - 1 - index;
      const resultProxy = game.py.jump_to_move_index(reverseIndex);
      if (resultProxy && resultProxy.toJs) {
        const result = resultProxy.toJs({ create_proxies: false });
        if (Array.isArray(result) && result.length >= 3) {
          [game.nextPlayer, game.gameEnded, game.validMoves] = result;
        }
      }
      selector.resetAndStart();
      await syncUi();
      await refreshEvaluation();
    },
    [refreshEvaluation, syncUi],
  );

  const updateCalcDepth = useCallback((depth: number | null) => {
    setCalcDepthOverride(depth);
  }, []);

  const startGuidedSetup = useCallback(async () => {
    const game = gameRef.current;
    const selector = selectorRef.current;
    if (!game || !selector) return;
    
    // Enter setup mode
    setButtons(prev => ({
      ...prev,
      setupMode: true,
      setupTurn: 0,
      editMode: 2, // Edit workers mode
      status: 'Place Green piece 1'
    }));
    
    // Clear all workers from the board
    if (game.py) {
      try {
        // Inform backend to clear history so setup becomes baseline
        if (game.py.begin_setup) {
          game.py.begin_setup();
        }
        
        // Clear all workers and levels from the board
        for (let y = 0; y < GAME_CONSTANTS.BOARD_SIZE; y++) {
          for (let x = 0; x < GAME_CONSTANTS.BOARD_SIZE; x++) {
            // Clear levels (buildings) back to 0
            let lvl = game.py._read_level(y, x);
            let guard = 0;
            while (lvl !== 0 && guard < 6) {
              game.editCell(y, x, 1);
              lvl = game.py._read_level(y, x);
              guard++;
            }

            const w = game.py._read_worker(y, x);
            if (w > 0) {
              // >0 -> -1
              game.editCell(y, x, 2);
              // -1 -> 0
              game.editCell(y, x, 2);
            } else if (w < 0) {
              // <0 -> 0
              game.editCell(y, x, 2);
            }
          }
        }
      } catch (error) {
        console.error('Failed to clear board for setup:', error);
      }
    }
    
    // Clear selectable cells and refresh board
    selector.selectNone();
    readBoard();
    updateSelectable();
  }, [readBoard, updateSelectable]);

  const controls: Controls = useMemo(
    () => ({
      reset,
      setGameMode,
      changeDifficulty,
      toggleEdit,
      setEditMode,
      refreshEvaluation,
      calculateOptions,
      updateCalcDepth,
      jumpToMove,
      startGuidedSetup,
      finalizeGuidedSetup,
    }),
    [calculateOptions, changeDifficulty, jumpToMove, refreshEvaluation, reset, setEditMode, setGameMode, toggleEdit, updateCalcDepth, startGuidedSetup, finalizeGuidedSetup],
  );

  return {
    loading,
    initialize,
    board,
    selectable,
    onCellClick,
    onCellHover,
    onCellLeave,
    buttons,
    evaluation,
    topMoves,
    controls,
    history,
    undo,
    redo,
    calcOptionsBusy,
  };
}
