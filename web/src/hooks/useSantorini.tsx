import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { loadScript } from '@/utils/scriptLoader';
import { Santorini } from '@game/santorini';
import { MoveSelector } from '@game/moveSelector';
import { renderCellSvg, type CellState } from '@game/svg';
import { GAME_CONSTANTS } from '@game/constants';
import type { SantoriniStateSnapshot } from '@/types/match';

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

type PlacementContext =
  | { phase: 'placement'; player: 0 | 1; workerId: 1 | 2 | -1 | -2 }
  | { phase: 'play' };

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

type PyLike = {
  toJs?: (options?: { create_proxies?: boolean }) => unknown;
  destroy?: () => void;
  valueOf?: () => unknown;
};

const toPlainValue = (value: unknown): unknown => {
  if (value && typeof value === 'object') {
    const candidate = value as PyLike;
    if (typeof candidate.toJs === 'function') {
      try {
        const plain = candidate.toJs({ create_proxies: false });
        candidate.destroy?.();
        if (plain !== value) {
          return toPlainValue(plain);
        }
        return plain;
      } catch {
        // Fall through and try other conversions
      }
    }

    if (value instanceof Map) {
      const plainObject: Record<string, unknown> = {};
      value.forEach((mapValue, key) => {
        if (typeof key === 'string' || typeof key === 'number' || typeof key === 'boolean') {
          plainObject[String(key)] = toPlainValue(mapValue);
        }
      });
      return plainObject;
    }

    if (Array.isArray(value)) {
      return value.map((item) => toPlainValue(item));
    }

    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      const iterableCandidate = value as { [Symbol.iterator]?: () => Iterator<unknown> };
      if (typeof iterableCandidate[Symbol.iterator] !== 'function') {
        return value;
      }
      const items = Array.from(iterableCandidate as unknown as Iterable<unknown>, (item) => toPlainValue(item));
      return items.length === 1 ? items[0] : items;
    }

    if (typeof candidate.valueOf === 'function') {
      try {
        const plain = candidate.valueOf();
        if (plain !== value) {
          return toPlainValue(plain);
        }
      } catch {
        // Ignore and fall through to default handling
      }
    }
  }
  return value;
};

const toFiniteNumber = (value: unknown): number | null => {
  const plain = toPlainValue(value);
  if (typeof plain === 'number') {
    return Number.isFinite(plain) ? plain : null;
  }
  if (typeof plain === 'bigint') {
    return Number(plain);
  }
  if (typeof plain === 'string') {
    const cleaned = plain.trim().replace(/,/g, '.').replace(/[^0-9.+-eE]/g, '');
    if (!cleaned) {
      return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (plain !== value) {
    return toFiniteNumber(plain);
  }
  return null;
};

const yieldToMainThread = () =>
  new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(() => resolve(), 0);
  });

const normalizeTopMoves = (rawMoves: unknown): TopMove[] => {
  if (!Array.isArray(rawMoves)) {
    return [];
  }

  const stripAnsi = (value: string) => value.replace(/\u001b\[[0-9;]*m/g, '').trim();

  return rawMoves.map((entry) => {
    const move = toPlainValue(entry) as Record<string, unknown>;

    const actionValue = toFiniteNumber(move?.action);
    const rawProb = move?.prob;
    const probValue = toFiniteNumber(rawProb);
    const textValue = toPlainValue(move?.text);

    const normalized: TopMove = {
      action: actionValue != null ? Math.trunc(actionValue) : -1,
      prob:
        probValue != null
          ? (() => {
              const base = (() => {
                if (typeof rawProb === 'string' && rawProb.includes('%')) {
                  return probValue / 100;
                }
                if (probValue > 1) {
                  return probValue / 100;
                }
                return probValue;
              })();
              return Math.min(Math.max(base, 0), 1);
            })()
          : 0,
      text:
        typeof textValue === 'string'
          ? stripAnsi(textValue)
          : textValue != null
          ? stripAnsi(String(toPlainValue(textValue)))
          : '',
    };

    if (move.eval !== undefined) {
      const evalValue = toFiniteNumber(move.eval);
      if (evalValue != null) {
        normalized.eval = evalValue;
      }
    }

    if (move.delta !== undefined) {
      const deltaValue = toFiniteNumber(move.delta);
      if (deltaValue != null) {
        normalized.delta = deltaValue;
      }
    }

    return normalized;
  });
};

function useSantoriniInternal(options: UseSantoriniOptions = {}) {
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
  const guidedSetupPlacementsRef = useRef<Array<[number, number]>>([]);

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

  const getPlacementContext = useCallback((): PlacementContext => {
    const game = gameRef.current;
    if (!game || !game.py || typeof game.py._findWorker !== 'function') {
      return { phase: 'play' };
    }

    const readWorkerPosition = (workerId: number): [number, number] | null => {
      try {
        const result = game.py._findWorker(workerId);
        if (!result) {
          return null;
        }
        const coords =
          typeof result.toJs === 'function'
            ? (result.toJs({ create_proxies: false }) as unknown)
            : result;
        if (typeof result.destroy === 'function') {
          result.destroy();
        }
        if (Array.isArray(coords) && coords.length >= 2) {
          const y = Number(coords[0]);
          const x = Number(coords[1]);
          if (Number.isInteger(y) && Number.isInteger(x) && y >= 0 && x >= 0) {
            return [y, x];
          }
        }
      } catch (_error) {
        // Ignore lookup errors; treat as missing worker.
      }
      return null;
    };

    if (!readWorkerPosition(1)) {
      return { phase: 'placement', player: 0, workerId: 1 };
    }
    if (!readWorkerPosition(2)) {
      return { phase: 'placement', player: 0, workerId: 2 };
    }
    if (!readWorkerPosition(-1)) {
      return { phase: 'placement', player: 1, workerId: -1 };
    }
    if (!readWorkerPosition(-2)) {
      return { phase: 'placement', player: 1, workerId: -2 };
    }
    return { phase: 'play' };
  }, []);

  const updateSelectable = useCallback(() => {
    const selector = selectorRef.current;
    const game = gameRef.current;
    if (!selector || !game || !game.py) return;
    selector.selectRelevantCells();
    const placement = getPlacementContext();
    if (placement.phase === 'placement') {
      const cells = Array.from({ length: GAME_CONSTANTS.BOARD_SIZE }, (_, y) =>
        Array.from({ length: GAME_CONSTANTS.BOARD_SIZE }, (_, x) =>
          game.py._read_worker(y, x) === 0,
        ),
      );
      setSelectable(cells);
      return;
    }
    setSelectable(selector.cells.map((row) => row.slice()));
  }, [getPlacementContext]);

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
    const placement = getPlacementContext();

    setButtons((prev) => {
      let status = prev.status;
      if (!prev.setupMode && placement.phase === 'placement') {
        const pieceNumber = placement.workerId === 1 || placement.workerId === -1 ? 1 : 2;
        const playerLabel = placement.player === 0 ? 'Green' : 'Red';
        status = `Setup: Place ${playerLabel} worker ${pieceNumber}`;
      } else if (!prev.setupMode) {
        if (stage <= 0) {
          status = 'Ready. Select a worker to start your move.';
        } else if (stage === 1) {
          status = 'Step 1/3: Select destination for the worker.';
        } else if (stage === 2) {
          status = 'Step 2/3: Select a build square.';
        } else {
          status = 'Confirming build.';
        }
      }
      return {
        ...prev,
        loading: loadingState,
        canUndo,
        canRedo,
        editMode: selector.editMode,
        status,
      };
    });
    setNextPlayer(typeof game.nextPlayer === 'number' ? game.nextPlayer : 0);
  }, [getPlacementContext]);

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
      // Always calculate evaluation first to ensure last_probs is populated
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
      
      // Now get the moves (last_probs should be populated from the evaluation above)
      if (game.py.list_current_moves) {
        const movesProxy = game.py.list_current_moves(10);
        const moves = movesProxy.toJs({ create_proxies: false });
        const normalizedMoves = normalizeTopMoves(moves);
        
        // If no moves or all moves have 0 probability, try the advanced version
        if (normalizedMoves.length === 0 || normalizedMoves.every(move => move.prob === 0)) {
          console.log('No moves or zero probabilities from list_current_moves, trying list_current_moves_with_adv...');
          if (game.py.list_current_moves_with_adv) {
            try {
              const advMovesProxy = await game.py.list_current_moves_with_adv(6);
              const advMoves = advMovesProxy.toJs({ create_proxies: false });
              setTopMoves(normalizeTopMoves(advMoves));
            } catch (advError) {
              console.error('Failed to get advanced moves:', advError);
              setTopMoves(normalizedMoves);
            }
          } else {
            setTopMoves(normalizedMoves);
          }
        } else {
          setTopMoves(normalizedMoves);
        }
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
    setLoading(true);

    const initPromise = (async () => {
      try {
        // Don't block UI - just update status
        setButtons((prev) => ({ ...prev, status: 'Loading game engine...' }));
        await yieldToMainThread();
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
        setLoading(false);
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
      selector.setEditMode(0);

      const py = game.py;
      let dataTuple: unknown = null;
      const placements = guidedSetupPlacementsRef.current;
      const hasRecordedPlacements =
        placements.length >= 4 &&
        placements
          .slice(0, 4)
          .every((coords) => Array.isArray(coords) && coords.length === 2);

      if (py) {
        if (hasRecordedPlacements && typeof py.force_guided_setup === 'function') {
          const [green1, green2, red1, red2] = placements.slice(0, 4) as Array<[number, number]>;
          const resultProxy = py.force_guided_setup(green1, green2, red1, red2);
          if (resultProxy && typeof resultProxy.toJs === 'function') {
            dataTuple = resultProxy.toJs({ create_proxies: false });
          }
        } else if (typeof py.end_setup === 'function') {
          const resultProxy = py.end_setup();
          if (resultProxy && typeof resultProxy.toJs === 'function') {
            dataTuple = resultProxy.toJs({ create_proxies: false });
          }
        }
      }

      if (Array.isArray(dataTuple) && dataTuple.length >= 3) {
        [game.nextPlayer, game.gameEnded, game.validMoves] = dataTuple;
        setNextPlayer(typeof game.nextPlayer === 'number' ? game.nextPlayer : 0);
      } else if (hasRecordedPlacements) {
        throw new Error('Unable to finalize guided setup after placing workers');
      }

      selector.resetAndStart();

      if (hasRecordedPlacements) {
        guidedSetupPlacementsRef.current = [];
      }

      await syncUi();
      await refreshEvaluation();

      setButtons((prev) => ({
        ...prev,
        setupMode: false,
        setupTurn: 0,
        status: 'Setup complete. Ready to play!',
      }));
    } catch (error) {
      console.error('Failed to finalize setup:', error);
      setButtons((prev) => ({
        ...prev,
        setupMode: true,
        status: 'Setup incomplete. Please place the workers again.',
      }));
    }
  }, [refreshEvaluation, syncUi]);

  const placeWorkerForSetup = useCallback(async (y: number, x: number) => {
    const game = gameRef.current;
    if (!game || !game.py) return;

    const setupTurn = buttons.setupTurn;
    if (setupTurn >= 4) {
      return;
    }

    const current = game.py._read_worker(y, x);
    if (current !== 0) {
      // Only allow placing on empty cells during setup
      return;
    }

    // Place workers with proper cycling: green workers first (turns 0,1), then red workers (turns 2,3)
    if (setupTurn < 2) {
      // Green workers: just place with +1
      game.editCell(y, x, 2); // 0 -> +1
    } else {
      // Red workers: cycle to -1
      game.editCell(y, x, 2); // 0 -> +1
      game.editCell(y, x, 2); // +1 -> -1
    }

    guidedSetupPlacementsRef.current[setupTurn] = [y, x];
    
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
      setButtons((prev) => ({
        ...prev,
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

      const placement = getPlacementContext();
      if (placement.phase === 'placement') {
        if (placement.player !== game.nextPlayer) {
          await updateButtons(false);
          return;
        }
        if (game.py && game.py._read_worker(y, x) !== 0) {
          await updateButtons(false);
          return;
        }
        const moveIndex = y * GAME_CONSTANTS.BOARD_SIZE + x;
        if (Array.isArray(game.validMoves) && game.validMoves[moveIndex]) {
          await applyMove(moveIndex);
        } else {
          await updateButtons(false);
        }
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
      getPlacementContext,
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

  const importState = useCallback(
    async (snapshot: SantoriniStateSnapshot | null | undefined) => {
      const game = gameRef.current;
      const selector = selectorRef.current;
      if (!game || !selector || !snapshot) {
        return;
      }
      if (!game.py || typeof game.py.import_practice_state !== 'function') {
        return;
      }
      try {
        const resultProxy = game.py.import_practice_state(snapshot);
        let result: unknown = resultProxy;
        if (resultProxy && typeof resultProxy.toJs === 'function') {
          result = resultProxy.toJs({ create_proxies: false });
        }
        if (Array.isArray(result) && result.length >= 3) {
          const [nextPlayerRaw, gameEndedRaw, validMovesRaw] = result as [
            number,
            ArrayLike<number> | number[],
            ArrayLike<boolean> | boolean[],
          ];
          game.nextPlayer = typeof nextPlayerRaw === 'number' ? nextPlayerRaw : 0;
          const endArray = Array.from(gameEndedRaw ?? [], (value) => Number(value));
          game.gameEnded = (endArray.length === 2 ? endArray : [0, 0]) as [number, number];
          const validArray = Array.from(validMovesRaw ?? [], (value) => Boolean(value));
          game.validMoves =
            validArray.length > 0 ? validArray : Array(GAME_CONSTANTS.TOTAL_MOVES).fill(false);
        }
        if (typeof selector.resetAndStart === 'function') {
          selector.resetAndStart();
        } else {
          selector.reset?.();
          selector.start?.();
        }
        await syncUi();
        await refreshEvaluation();
      } catch (error) {
        console.error('Failed to import game snapshot:', error);
        throw error;
      }
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

    guidedSetupPlacementsRef.current = [];

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
    importState,
  };
}

type SantoriniStore = ReturnType<typeof useSantoriniInternal>;

const SantoriniContext = createContext<SantoriniStore | null>(null);

export interface SantoriniProviderProps {
  children: ReactNode;
  evaluationEnabled?: boolean;
}

export function SantoriniProvider({ children, evaluationEnabled }: SantoriniProviderProps) {
  const store = useSantoriniInternal({ evaluationEnabled });
  return <SantoriniContext.Provider value={store}>{children}</SantoriniContext.Provider>;
}

export function useSantorini(options: UseSantoriniOptions = {}) {
  const context = useContext(SantoriniContext);
  if (context) {
    return context;
  }
  return useSantoriniInternal(options);
}
