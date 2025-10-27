import { useCallback, useMemo, useRef, useState } from 'react';
import { loadScript } from '@/utils/scriptLoader';
import { Santorini } from '@game/santorini';
import { MoveSelector } from '@game/moveSelector';
import { renderCellSvg, type CellState } from '@game/svg';
import { GAME_CONSTANTS } from '@game/constants';

export interface UseSantoriniOptions {
  evaluationEnabled?: boolean;
}

const PY_FILES: Array<[string, string]> = [
  [`${import.meta.env.BASE_URL || '/'}santorini/Game.py`, 'Game.py'],
  [`${import.meta.env.BASE_URL || '/'}santorini/proxy.py`, 'proxy.py'],
  [`${import.meta.env.BASE_URL || '/'}santorini/MCTS.py`, 'MCTS.py'],
  [`${import.meta.env.BASE_URL || '/'}santorini/SantoriniDisplay.py`, 'SantoriniDisplay.py'],
  [`${import.meta.env.BASE_URL || '/'}santorini/SantoriniGame.py`, 'SantoriniGame.py'],
  [`${import.meta.env.BASE_URL || '/'}santorini/SantoriniLogicNumba.py`, 'SantoriniLogicNumba.py'],
  [`${import.meta.env.BASE_URL || '/'}santorini/SantoriniConstants.py`, 'SantoriniConstants.py'],
];

const MODEL_FILENAME = `${import.meta.env.BASE_URL || '/'}santorini/model_no_god.onnx`;
const SIZE_CB = [1, 25, 3];
const ONNX_OUTPUT_SIZE = 162;

let onnxSessionPromise: Promise<any> | null = null;

const PRACTICE_STATE_KEY = 'santorini:practiceState';

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

export type ApplyMoveOptions = {
  triggerAi?: boolean;
  asHuman?: boolean;
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

const normalizeTopMoves = (rawMoves: unknown): TopMove[] => {
  if (!Array.isArray(rawMoves)) {
    return [];
  }

  const stripAnsi = (value: string) => value.replace(/\u001b\[[0-9;]*m/g, '').trim();

  return rawMoves.map((entry) => {
    const move = entry as Record<string, unknown>;

    const actionValue = Number(move.action);
    const probValue = Number(move.prob);
    const textValue = move.text;

    const normalized: TopMove = {
      action: Number.isFinite(actionValue) ? actionValue : -1,
      prob: Number.isFinite(probValue) ? Math.min(Math.max(probValue, 0), 1) : 0,
      text:
        typeof textValue === 'string'
          ? stripAnsi(textValue)
          : textValue != null
          ? stripAnsi(String(textValue))
          : '',
    };

    if (move.eval !== undefined) {
      const evalValue = Number(move.eval);
      if (Number.isFinite(evalValue)) {
        normalized.eval = evalValue;
      }
    }

    if (move.delta !== undefined) {
      const deltaValue = Number(move.delta);
      if (Number.isFinite(deltaValue)) {
        normalized.delta = deltaValue;
      }
    }

    return normalized;
  });
};

export function useSantorini(options: UseSantoriniOptions = {}) {
  const { evaluationEnabled = true } = options;
  const [loading, setLoading] = useState(false); // Start with UI enabled
  const [board, setBoard] = useState<BoardCell[][]>(INITIAL_BOARD);
  const [selectable, setSelectable] = useState<boolean[][]>(INITIAL_SELECTABLE);
  const [buttons, setButtons] = useState<ButtonsState>({
    loading: false,
    canRedo: false,
    canUndo: false,
    editMode: 0,
    status: 'Initializing game engine...',
    setupMode: false,
    setupTurn: 0
  });
  const [evaluation, setEvaluation] = useState<EvaluationState>({ value: 0, advantage: 'Balanced', label: '0.00' });
  const [topMoves, setTopMoves] = useState<TopMove[]>([]);
  const [history, setHistory] = useState<MoveSummary[]>([]);
  const [nextPlayer, setNextPlayer] = useState(0);
  const [calcOptionsBusy, setCalcOptionsBusy] = useState(false);
  const [calcDepthOverride, setCalcDepthOverride] = useState<number | null>(null);

  const gameRef = useRef<Santorini>();
  const selectorRef = useRef<MoveSelector>();
  const aiPromiseRef = useRef<Promise<void>>(Promise.resolve());

  const persistPracticeState = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }
    const game = gameRef.current;
    if (!game?.py || !game.py.export_practice_state) {
      return;
    }
    try {
      const snapshotProxy = game.py.export_practice_state();
      if (!snapshotProxy) {
        return;
      }
      const snapshot =
        typeof snapshotProxy.toJs === 'function'
          ? snapshotProxy.toJs({ create_proxies: false })
          : snapshotProxy;
      snapshotProxy.destroy?.();
      if (!snapshot) {
        return;
      }
      window.localStorage.setItem(PRACTICE_STATE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.error('Failed to persist practice state:', error);
    }
  }, []);

  const restorePracticeState = useCallback(async () => {
    if (typeof window === 'undefined') {
      return false;
    }
    const stored = window.localStorage.getItem(PRACTICE_STATE_KEY);
    if (!stored) {
      return false;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch (error) {
      console.error('Failed to parse stored practice state:', error);
      window.localStorage.removeItem(PRACTICE_STATE_KEY);
      return false;
    }

    const game = gameRef.current;
    if (!game?.py || !game.py.import_practice_state) {
      return false;
    }

    try {
      const resultProxy = game.py.import_practice_state(parsed);
      if (!resultProxy) {
        return false;
      }
      const result =
        typeof resultProxy.toJs === 'function'
          ? resultProxy.toJs({ create_proxies: false })
          : resultProxy;
      resultProxy.destroy?.();
      if (!Array.isArray(result) || result.length < 3) {
        return false;
      }
      const [nextPlayer, gameEndedRaw, validMovesRaw] = result as [
        number,
        ArrayLike<number> | number[],
        ArrayLike<boolean> | boolean[],
      ];
      game.nextPlayer = typeof nextPlayer === 'number' ? nextPlayer : 0;
      const endArray = Array.from(gameEndedRaw ?? [], (value) => Number(value));
      game.gameEnded = (endArray.length === 2 ? endArray : [0, 0]) as [number, number];
      const validArray = Array.from(validMovesRaw ?? [], (value) => Boolean(value));
      game.validMoves =
        validArray.length > 0 ? validArray : Array(GAME_CONSTANTS.TOTAL_MOVES).fill(false);
      return true;
    } catch (error) {
      console.error('Failed to restore practice state:', error);
      window.localStorage.removeItem(PRACTICE_STATE_KEY);
      return false;
    }
  }, []);

  const initOnnxSession = useCallback(async () => {
    if (!window.ort) {
      throw new Error('ONNX runtime not available');
    }

    if (!onnxSessionPromise) {
      onnxSessionPromise = (async () => {
        try {
          // Load the model file as a binary blob to avoid content-type issues
          console.log('Loading ONNX model from:', MODEL_FILENAME);
          const response = await fetch(MODEL_FILENAME);
          if (!response.ok) {
            throw new Error(`Failed to load model: ${response.status} ${response.statusText}`);
          }
          console.log('Model response headers:', Object.fromEntries(response.headers.entries()));
          const modelBuffer = await response.arrayBuffer();
          console.log('Model buffer size:', modelBuffer.byteLength);

          // Try creating session with buffer
          let session;
          try {
            // Configure ONNX runtime for single-threaded mode to avoid SharedArrayBuffer issues
            const sessionOptions = {
              executionProviders: ['wasm'],
              graphOptimizationLevel: 'all',
              enableCpuMemArena: false,
              enableMemPattern: false,
              enableProfiling: false,
              logLevel: 'warning'
            };

            session = await window.ort.InferenceSession.create(modelBuffer, sessionOptions);
            console.log('ONNX session created successfully with buffer');
          } catch (bufferError) {
            console.warn('Failed to create session with buffer, trying URL approach:', bufferError);
            // Fallback: try loading directly from URL with same options
            const sessionOptions = {
              executionProviders: ['wasm'],
              graphOptimizationLevel: 'all',
              enableCpuMemArena: false,
              enableMemPattern: false,
              enableProfiling: false,
              logLevel: 'warning'
            };
            session = await window.ort.InferenceSession.create(MODEL_FILENAME, sessionOptions);
            console.log('ONNX session created successfully with URL');
          }
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
          return session;
        } catch (error) {
          onnxSessionPromise = null;
          console.error('Failed to initialize ONNX session:', error);
          throw error;
        }
      })();
    }

    await onnxSessionPromise;
  }, []);

  const loadPyodideRuntime = useCallback(async () => {
    try {
      const pyodideUrl = import.meta.env.VITE_PYODIDE_URL as string;
      const onnxUrl = import.meta.env.VITE_ONNX_URL as string | undefined;

      if (!pyodideUrl) {
        throw new Error('Missing required environment variable: VITE_PYODIDE_URL');
      }

      const scriptPromises: Promise<unknown>[] = [loadScript(pyodideUrl)];
      if (evaluationEnabled) {
        if (!onnxUrl) {
          throw new Error('Missing required environment variable: VITE_ONNX_URL');
        }
        scriptPromises.push(loadScript(onnxUrl));
      }

      await Promise.all(scriptPromises);
      
      // Wait a bit for the script to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const loadPyodideFn = window.loadPyodide;
      if (!loadPyodideFn) {
        throw new Error('Pyodide runtime missing - failed to load Pyodide script');
      }

      const onnxSessionInitPromise = evaluationEnabled ? initOnnxSession() : Promise.resolve();

      const fileFetchPromise = Promise.all(
        PY_FILES.map(async ([input, output]) => {
          const response = await fetch(input);
          if (!response.ok) {
            throw new Error(`Failed to load Python file: ${input}`);
          }
          const data = await response.arrayBuffer();
          return { output, data: new Uint8Array(data) };
        })
      );

      const pyodidePromise = (async () => {
        const instance = await loadPyodideFn({ fullStdLib: false });
        await instance.loadPackage('numpy');
        return instance;
      })();

      const [pyodide, fetchedFiles] = await Promise.all([pyodidePromise, fileFetchPromise]);

      fetchedFiles.forEach(({ output, data }) => {
        pyodide.FS.writeFile(output, data);
      });

      const game = new Santorini();
      game.setBackend(pyodide);
      gameRef.current = game;
      selectorRef.current = new MoveSelector(game);
      await onnxSessionInitPromise;
    } catch (error) {
      console.error('Failed to load Pyodide runtime:', error);
      throw error;
    }
  }, [evaluationEnabled, initOnnxSession]);

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
    setNextPlayer(typeof game.nextPlayer === 'number' ? game.nextPlayer : 0);
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
    if (!evaluationEnabled) {
      setEvaluation({ value: 0, advantage: 'Balanced', label: '0.00' });
      setTopMoves([]);
      return;
    }
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
        const moves = movesProxy.toJs({ create_proxies: false });
        setTopMoves(normalizeTopMoves(moves));
      }
    } catch (error) {
      console.error('Failed to refresh evaluation:', error);
      // Set default evaluation on error
      setEvaluation({ value: 0, advantage: 'Error', label: '0.00' });
      setTopMoves([]);
    }
  }, [evaluationEnabled]);

  const calculateOptions = useCallback(async () => {
    if (!evaluationEnabled) {
      setTopMoves([]);
      return;
    }
    const game = gameRef.current;
    if (!game || !game.py || !game.py.list_current_moves_with_adv) return;
    setCalcOptionsBusy(true);
    try {
      const resultProxy = await game.py.list_current_moves_with_adv(6, calcDepthOverride ?? undefined);
      const result = resultProxy.toJs({ create_proxies: false });
      setTopMoves(normalizeTopMoves(result));
    } catch (error) {
      console.error('Failed to calculate options:', error);
      setTopMoves([]);
    } finally {
      setCalcOptionsBusy(false);
    }
  }, [calcDepthOverride, evaluationEnabled]);

  const syncUi = useCallback(async (loadingState = false) => {
    readBoard();
    updateSelectable();
    await updateButtons(loadingState);
    refreshHistory();
    await persistPracticeState();
  }, [persistPracticeState, readBoard, updateSelectable, updateButtons, refreshHistory]);

  const initializeStartedRef = useRef(false);
  const initializePromiseRef = useRef<Promise<void> | null>(null);

  const initialize = useCallback(async () => {
    if (initializeStartedRef.current) {
      if (initializePromiseRef.current) {
        await initializePromiseRef.current;
      }
      return;
    }

    initializeStartedRef.current = true;

    const initPromise = (async () => {
      try {
        // Don't block UI - just update status
        setButtons((prev) => ({ ...prev, status: 'Loading game engine...' }));
        await loadPyodideRuntime();
        const game = gameRef.current;
        const selector = selectorRef.current;
        if (!game || !selector) {
          return;
        }
        game.init_game();
        await restorePracticeState();
        selector.resetAndStart();
        await syncUi(true);
        await refreshEvaluation();
        setButtons((prev) => ({ ...prev, loading: false, status: 'Ready to play!' }));
      } catch (error) {
        initializeStartedRef.current = false;
        setButtons((prev) => ({ ...prev, status: 'Failed to load game engine' }));
        throw error;
      } finally {
        initializePromiseRef.current = null;
      }
    })();

    initializePromiseRef.current = initPromise;
    await initPromise;
  }, [loadPyodideRuntime, refreshEvaluation, restorePracticeState, syncUi]);

  const aiPlayIfNeeded = useCallback(async () => {
    if (!evaluationEnabled) {
      return;
    }
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
  }, [evaluationEnabled, readBoard, refreshEvaluation, refreshHistory, updateButtons, updateSelectable]);

  const ensureAiIdle = useCallback(() => aiPromiseRef.current, []);

  const finalizeGuidedSetup = useCallback(async () => {
    const game = gameRef.current;
    const selector = selectorRef.current;
    if (!game || !selector) return;

    try {
      // Exit edit mode and normalize worker IDs
      selector.setEditMode(0);

      // Tell backend to finalize setup and refresh state triplet
      if (game.py && game.py.end_setup) {
        const data_tuple = game.py.end_setup().toJs({ create_proxies: false });
        if (Array.isArray(data_tuple) && data_tuple.length >= 3) {
          [game.nextPlayer, game.gameEnded, game.validMoves] = data_tuple;
          setNextPlayer(typeof game.nextPlayer === 'number' ? game.nextPlayer : 0);
        }
      }

      // Reset selector so normal move selection can resume
      selector.resetAndStart();

      // Refresh UI state from the finalized setup
      await syncUi();
      await refreshEvaluation();

      // Exit setup mode and show completion message
      setButtons(prev => ({
        ...prev,
        setupMode: false,
        setupTurn: 0,
        status: 'Setup complete. Ready to play!'
      }));
    } catch (error) {
      console.error('Failed to finalize setup:', error);
    }
  }, [refreshEvaluation, syncUi]);

  const placeWorkerForSetup = useCallback(async (y: number, x: number) => {
    const game = gameRef.current;
    if (!game || !game.py) return;

    const current = game.py._read_worker(y, x);
    if (current !== 0) {
      // Only allow placing on empty cells during setup
      return;
    }
    
    const setupTurn = buttons.setupTurn;
    
    // Place workers using editCell mode 2, then reassign IDs with mode 0
    game.editCell(y, x, 2); // Place worker (0 -> +1 for green, or 0 -> +1 -> -1 for red)
    
    const newSetupTurn = setupTurn + 1;
    const steps = ['Place Green piece 1', 'Place Green piece 2', 'Place Red piece 1', 'Place Red piece 2'];
    const status = newSetupTurn < steps.length ? steps[newSetupTurn] : 'Setup complete';
    
    setButtons(prev => ({
      ...prev,
      setupTurn: newSetupTurn,
      status
    }));
    
    readBoard();
    await persistPracticeState();

    if (newSetupTurn >= 4) {
      // Reassign worker IDs to ensure we have [1, 2, -1, -2]
      game.editCell(0, 0, 0); // This reassigns all worker IDs properly
      
      setButtons((prev) => ({
        ...prev,
        setupMode: false,
        status: 'Finalizing setup...'
      }));
      try {
        await finalizeGuidedSetup();
      } catch (error) {
        console.error('Guided setup finalization failed:', error);
        setButtons((prev) => ({
          ...prev,
          setupMode: true,
          status: 'Setup incomplete. Please place the workers again.',
        }));
      }
    }
  }, [buttons.setupTurn, finalizeGuidedSetup, persistPracticeState, readBoard]);

  const applyMove = useCallback(
    async (move: number, options: ApplyMoveOptions = {}) => {
      const { triggerAi = true, asHuman = true } = options;
      const game = gameRef.current;
      const selector = selectorRef.current;
      if (!game || !selector) return;
      await ensureAiIdle();
      game.move(move, asHuman);
      if (selector.resetAndStart) {
        selector.resetAndStart();
      } else {
        selector.reset();
        selector.start();
      }
      await syncUi();
      await refreshEvaluation();
      if (triggerAi) {
        aiPromiseRef.current = ensureAiIdle().then(() => aiPlayIfNeeded());
      }
    },
    [aiPlayIfNeeded, ensureAiIdle, refreshEvaluation, syncUi],
  );

  const onCellClick = useCallback(
    async (y: number, x: number) => {
      const game = gameRef.current;
      const selector = selectorRef.current;
      if (!game || !selector) return;

      // Handle setup mode
      if (buttons.setupMode) {
        await placeWorkerForSetup(y, x);
        return;
      }

      if (selector.editMode === 1 || selector.editMode === 2) {
        game.editCell(y, x, selector.editMode);
        readBoard();
        updateSelectable();
        await updateButtons(false);
        await persistPracticeState();
        return;
      }

      selector.click(y, x);
      updateSelectable();
      const move = selector.getMove();
      if (move >= 0) {
        await applyMove(move);
      } else {
        updateButtons(false);
      }
    },
    [
      applyMove,
      updateButtons,
      updateSelectable,
      buttons.setupMode,
      placeWorkerForSetup,
      persistPracticeState,
      readBoard,
    ],
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
      canUndo: false,
      canRedo: false,
      status: 'Place Green piece 1'
    }));

    // Ensure selector is in worker edit mode and clear existing highlights/history
    selector.setEditMode(2);
    selector.selectNone();
    setSelectable(
      Array.from({ length: GAME_CONSTANTS.BOARD_SIZE }, () =>
        Array.from({ length: GAME_CONSTANTS.BOARD_SIZE }, () => false),
      ),
    );
    setHistory([]);

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
    readBoard();
    await persistPracticeState();
  }, [persistPracticeState, readBoard]);

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
    applyMove,
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
    nextPlayer,
    gameEnded: gameRef.current?.gameEnded ?? [0, 0],
  };
}
