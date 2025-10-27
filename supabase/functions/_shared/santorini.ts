const BOARD_SIZE = 5;
const NO_MOVE = 4;
const NO_BUILD = 4;
const NB_GODS = 1;
const ACTION_SIZE = NB_GODS * 2 * 9 * 9; // 162 total actions with no god powers

const DIRECTIONS: Array<[number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 0],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

export interface SantoriniSnapshot {
  version: number;
  player: number;
  board: number[][][]; // 5x5x3 array [worker, level, meta]
  history: unknown[];
  future: unknown[];
  gameEnded: [number, number];
  validMoves: boolean[];
}

interface InternalBoardState {
  workers: number[][];
  levels: number[][];
  round: number;
}

interface HistoryEntry {
  player: number;
  board: InternalBoardState;
  action: number | null;
}

function cloneGrid(source: number[][]): number[][] {
  return source.map((row) => row.slice());
}

function inBounds(y: number, x: number): boolean {
  return y >= 0 && y < BOARD_SIZE && x >= 0 && x < BOARD_SIZE;
}

function decodeAction(action: number): [number, number, number, number] {
  const worker = Math.floor(action / (NB_GODS * 9 * 9));
  const remainderAfterWorker = action % (NB_GODS * 9 * 9);
  const power = Math.floor(remainderAfterWorker / (9 * 9));
  const remainderAfterPower = remainderAfterWorker % (9 * 9);
  const moveDirection = Math.floor(remainderAfterPower / 9);
  const buildDirection = remainderAfterPower % 9;
  return [worker, power, moveDirection, buildDirection];
}

function encodeAction(worker: number, power: number, moveDirection: number, buildDirection: number): number {
  return NB_GODS * 9 * 9 * worker + 9 * 9 * power + 9 * moveDirection + buildDirection;
}

function applyDirection(y: number, x: number, direction: number): [number, number] {
  const delta = DIRECTIONS[direction];
  return [y + delta[0], x + delta[1]];
}

function packBoard(state: InternalBoardState): number[][][] {
  const { workers, levels, round } = state;
  const board = Array.from({ length: BOARD_SIZE }, (_, y) =>
    Array.from({ length: BOARD_SIZE }, (_, x) => [workers[y][x], levels[y][x], 0]),
  );
  board[0][0][2] = round;
  return board;
}

function unpackBoard(board: number[][][]): InternalBoardState {
  if (!Array.isArray(board) || board.length !== BOARD_SIZE) {
    throw new Error('Invalid board payload: expected 5 rows');
  }
  const workers: number[][] = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  const levels: number[][] = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  let round = 0;
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    const row = board[y];
    if (!Array.isArray(row) || row.length !== BOARD_SIZE) {
      throw new Error('Invalid board payload: expected 5 columns per row');
    }
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const cell = row[x];
      if (!Array.isArray(cell) || cell.length !== 3) {
        throw new Error('Invalid board payload: expected 3 channels');
      }
      workers[y][x] = Number(cell[0]) || 0;
      levels[y][x] = Number(cell[1]) || 0;
      if (y === 0 && x === 0) {
        round = Number(cell[2]) || 0;
      }
    }
  }
  return { workers, levels, round };
}

function cloneBoardState(state: InternalBoardState): InternalBoardState {
  return {
    workers: cloneGrid(state.workers),
    levels: cloneGrid(state.levels),
    round: state.round,
  };
}

export class SantoriniEngine {
  private workers: number[][];
  private levels: number[][];
  private round: number;
  private currentPlayer: number;
  private gameEnded: [number, number];
  private validMoves: boolean[];
  private history: HistoryEntry[];

  private constructor(board: InternalBoardState, player: number, validMoves: boolean[], gameEnded: [number, number]) {
    this.workers = cloneGrid(board.workers);
    this.levels = cloneGrid(board.levels);
    this.round = board.round;
    this.currentPlayer = player;
    this.gameEnded = [Number(gameEnded[0]) || 0, Number(gameEnded[1]) || 0];
    this.validMoves = validMoves.slice();
    this.history = [];
  }

  static createInitial(startingPlayer: number = 0): { engine: SantoriniEngine; snapshot: SantoriniSnapshot } {
    const workers = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
    const levels = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
    const round = 0;
    const baseState: InternalBoardState = { workers, levels, round };
    const player = startingPlayer === 1 ? 1 : 0; // Ensure it's 0 or 1
    const engine = new SantoriniEngine(baseState, player, Array(ACTION_SIZE).fill(false), [0, 0]);
    // BUG FIX: Compute valid moves for the ACTUAL starting player, not always player 0
    const placementPlayer = engine.getNextPlacement()?.player ?? 0;
    engine.validMoves = engine.computeValidMoves(placementPlayer);
    engine.gameEnded = engine.computeGameEnded(placementPlayer);
    engine.history = [];
    return { engine, snapshot: engine.toSnapshot() };
  }

  static fromSnapshot(snapshot: SantoriniSnapshot): SantoriniEngine {
    if (!snapshot || snapshot.version !== 1) {
      throw new Error('Unsupported snapshot version');
    }
    const board = unpackBoard(snapshot.board);
    const player = Number(snapshot.player) || 0;
    const validMoves = Array.isArray(snapshot.validMoves)
      ? snapshot.validMoves.map((value) => Boolean(value))
      : Array(ACTION_SIZE).fill(false);
    const gameEnded: [number, number] = [
      Array.isArray(snapshot.gameEnded) ? Number(snapshot.gameEnded[0]) || 0 : 0,
      Array.isArray(snapshot.gameEnded) ? Number(snapshot.gameEnded[1]) || 0 : 0,
    ];
    const engine = new SantoriniEngine(board, player, validMoves, gameEnded);
    engine.validMoves = engine.computeValidMoves(player);
    engine.gameEnded = engine.computeGameEnded(player);
    const historyEntries: HistoryEntry[] = [];
    if (Array.isArray(snapshot.history)) {
      for (const entry of snapshot.history) {
        if (!entry || typeof entry !== 'object') continue;
        const raw = entry as Record<string, unknown>;
        const boardPayload = raw.board as number[][][] | undefined;
        if (!boardPayload) continue;
        try {
          const parsedBoard = unpackBoard(boardPayload);
          const playerValue = Number(raw.player);
          const actionValue = raw.action === null || raw.action === undefined ? null : Number(raw.action);
          historyEntries.push({
            player: Number.isFinite(playerValue) ? playerValue : 0,
            board: parsedBoard,
            action: Number.isFinite(actionValue) ? Number(actionValue) : null,
          });
        } catch (_error) {
          // Ignore malformed history entries
        }
      }
    }
    engine.history = historyEntries;
    return engine;
  }

  get player(): number {
    return this.currentPlayer;
  }

  get snapshot(): SantoriniSnapshot {
    return this.toSnapshot();
  }

  applyMove(action: number): { snapshot: SantoriniSnapshot; winner: 0 | 1 | null } {
    if (!Number.isInteger(action) || action < 0 || action >= ACTION_SIZE) {
      throw new Error('Action out of bounds');
    }
    const placement = this.getNextPlacement();
    if (placement) {
      if (!this.validMoves[action]) {
        throw new Error('Illegal placement for current position');
      }
      const targetY = Math.floor(action / BOARD_SIZE);
      const targetX = action % BOARD_SIZE;
      if (targetY < 0 || targetY >= BOARD_SIZE || targetX < 0 || targetX >= BOARD_SIZE) {
        throw new Error('Placement move out of bounds');
      }
      if (this.workers[targetY][targetX] !== 0) {
        throw new Error('Cannot place a worker on an occupied tile');
      }

      this.history.push({
        player: this.currentPlayer,
        board: cloneBoardState({ workers: this.workers, levels: this.levels, round: this.round }),
        action,
      });

      this.workers[targetY][targetX] = placement.workerId;

      if (placement.workerId === 1 || placement.workerId === -1) {
        this.currentPlayer = placement.player;
      } else {
        this.currentPlayer = (1 - placement.player) as 0 | 1;
      }

      this.validMoves = this.computeValidMoves(this.currentPlayer);
      this.gameEnded = this.computeGameEnded(this.currentPlayer);

      let winner: 0 | 1 | null = null;
      if (this.gameEnded[0] === 1) {
        winner = 0;
      } else if (this.gameEnded[1] === 1) {
        winner = 1;
      }

      return { snapshot: this.toSnapshot(), winner };
    }

    if (!this.validMoves[action]) {
      throw new Error('Illegal move for current position');
    }
    const [workerIndex, power, moveDirection, buildDirection] = decodeAction(action);
    if (power !== 0) {
      throw new Error('God powers are disabled in this build');
    }

    const workerId = (workerIndex + 1) * (this.currentPlayer === 0 ? 1 : -1);
    const workerPosition = this.findWorker(workerId);
    if (!workerPosition) {
      throw new Error('Unable to locate worker for move');
    }

    this.history.push({
      player: this.currentPlayer,
      board: cloneBoardState({ workers: this.workers, levels: this.levels, round: this.round }),
      action,
    });

    const [moveY, moveX] = applyDirection(workerPosition[0], workerPosition[1], moveDirection);
    if (!this.canMove(workerPosition, [moveY, moveX])) {
      throw new Error('Move destination is not reachable');
    }

    this.workers[workerPosition[0]][workerPosition[1]] = 0;
    this.workers[moveY][moveX] = workerId;

    if (buildDirection !== NO_BUILD) {
      const [buildY, buildX] = applyDirection(moveY, moveX, buildDirection);
      if (!this.canBuild([buildY, buildX], workerId)) {
        throw new Error('Cannot build on the requested tile');
      }
      this.levels[buildY][buildX] = Math.min(4, this.levels[buildY][buildX] + 1);
    }

    this.currentPlayer = 1 - this.currentPlayer;
    if (this.round < 127) {
      this.round += 1;
    }

    this.validMoves = this.computeValidMoves(this.currentPlayer);
    this.gameEnded = this.computeGameEnded(this.currentPlayer);

    let winner: 0 | 1 | null = null;
    if (this.gameEnded[0] === 1) {
      winner = 0;
    } else if (this.gameEnded[1] === 1) {
      winner = 1;
    }

    return { snapshot: this.toSnapshot(), winner };
  }

  getValidMoves(): boolean[] {
    return this.validMoves.slice();
  }

  private toSnapshot(): SantoriniSnapshot {
    return {
      version: 1,
      player: this.currentPlayer,
      board: packBoard({ workers: this.workers, levels: this.levels, round: this.round }),
      history: this.history.map((entry) => ({
        player: entry.player,
        board: packBoard(entry.board),
        action: entry.action,
      })),
      future: [],
      gameEnded: [this.gameEnded[0], this.gameEnded[1]],
      validMoves: this.validMoves.slice(),
    };
  }

  private computeValidMoves(player: number): boolean[] {
    const placement = this.getNextPlacement();
    const actions = Array(ACTION_SIZE).fill(false) as boolean[];
    if (placement) {
      // Only allow the correct player to place their worker
      if (placement.player === player) {
        for (let y = 0; y < BOARD_SIZE; y += 1) {
          for (let x = 0; x < BOARD_SIZE; x += 1) {
            if (this.workers[y][x] === 0) {
              actions[y * BOARD_SIZE + x] = true;
            }
          }
        }
      }
      return actions;
    }
    for (let worker = 0; worker < 2; worker += 1) {
      const workerId = (worker + 1) * (player === 0 ? 1 : -1);
      const position = this.findWorker(workerId);
      if (!position) {
        continue;
      }
      for (let moveDirection = 0; moveDirection < DIRECTIONS.length; moveDirection += 1) {
        if (moveDirection === NO_MOVE) {
          continue;
        }
        const moveTarget = applyDirection(position[0], position[1], moveDirection);
        if (!this.canMove(position, moveTarget, player)) {
          continue;
        }
        for (let buildDirection = 0; buildDirection < DIRECTIONS.length; buildDirection += 1) {
          if (buildDirection === NO_BUILD) {
            continue;
          }
          const buildTarget = applyDirection(moveTarget[0], moveTarget[1], buildDirection);
          if (!this.canBuild(buildTarget, workerId)) {
            continue;
          }
          const action = encodeAction(worker, 0, moveDirection, buildDirection);
          actions[action] = true;
        }
      }
    }
    return actions;
  }

  private computeGameEnded(nextPlayer: number): [number, number] {
    if (this.getNextPlacement()) {
      return [0, 0];
    }
    const scores: [number, number] = [this.getScore(0), this.getScore(1)];
    if (scores[0] === 3) {
      return [1, -1];
    }
    if (scores[1] === 3) {
      return [-1, 1];
    }
    const nextValidMoves = this.computeValidMoves(nextPlayer);
    if (nextValidMoves.every((value) => !value)) {
      return nextPlayer === 0 ? ([-1, 1] as [number, number]) : ([1, -1] as [number, number]);
    }
    return [0, 0];
  }

  private getScore(player: number): number {
    let highest = 0;
    const comparator = player === 0 ? (value: number) => value > 0 : (value: number) => value < 0;
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const worker = this.workers[y][x];
        const level = this.levels[y][x];
        if (comparator(worker) && level > highest) {
          highest = level;
        }
      }
    }
    return highest;
  }

  private canMove(oldPosition: [number, number], newPosition: [number, number], player?: number): boolean {
    if (oldPosition[0] === newPosition[0] && oldPosition[1] === newPosition[1]) {
      return true;
    }
    if (!inBounds(newPosition[0], newPosition[1])) {
      return false;
    }
    if (this.workers[newPosition[0]][newPosition[1]] !== 0) {
      return false;
    }
    const newLevel = this.levels[newPosition[0]][newPosition[1]];
    if (newLevel > 3) {
      return false;
    }
    const oldLevel = this.levels[oldPosition[0]][oldPosition[1]];
    if (newLevel > oldLevel + 1) {
      return false;
    }
    if (typeof player === 'number') {
      const workerId = this.workers[oldPosition[0]][oldPosition[1]];
      const expectedSign = player === 0 ? 1 : -1;
      if (Math.sign(workerId) !== expectedSign) {
        return false;
      }
    }
    return true;
  }

  private canBuild(position: [number, number], ignore: number): boolean {
    if (!inBounds(position[0], position[1])) {
      return false;
    }
    const occupant = this.workers[position[0]][position[1]];
    if (occupant !== 0 && occupant !== ignore) {
      return false;
    }
    if (this.levels[position[0]][position[1]] >= 4) {
      return false;
    }
    return true;
  }

  private findWorker(workerId: number): [number, number] | null {
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        if (this.workers[y][x] === workerId) {
          return [y, x];
        }
      }
    }
    return null;
  }

  private getNextPlacement(): { player: 0 | 1; workerId: 1 | 2 | -1 | -2 } | null {
    const hasWorker = (id: number) => this.findWorker(id) !== null;
    if (!hasWorker(1)) {
      return { player: 0, workerId: 1 };
    }
    if (!hasWorker(2)) {
      return { player: 0, workerId: 2 };
    }
    if (!hasWorker(-1)) {
      return { player: 1, workerId: -1 };
    }
    if (!hasWorker(-2)) {
      return { player: 1, workerId: -2 };
    }
    return null;
  }
}

export type { SantoriniSnapshot as SantoriniStateSnapshot };
export const ACTION_SPACE_SIZE = ACTION_SIZE;
