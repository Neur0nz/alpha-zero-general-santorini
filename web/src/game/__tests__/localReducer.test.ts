import { describe, expect, it } from 'vitest';
import { GAME_CONSTANTS } from '@game/constants';
import { applyDirection, decodeMove } from '@game/utils';

type PlayerIndex = 0 | 1;

type WorkerPosition = { y: number; x: number };

type CellState = {
  level: number;
  worker: 0 | 1 | -1 | 2 | -2;
};

type LocalState = {
  board: CellState[][];
  workers: Record<PlayerIndex, [WorkerPosition, WorkerPosition]>;
  nextPlayer: PlayerIndex;
};

function createEmptyCell(): CellState {
  return { level: 0, worker: 0 };
}

function cloneState(state: LocalState): LocalState {
  return {
    board: state.board.map((row) => row.map((cell) => ({ ...cell }))),
    workers: {
      0: state.workers[0].map((pos) => ({ ...pos })) as [WorkerPosition, WorkerPosition],
      1: state.workers[1].map((pos) => ({ ...pos })) as [WorkerPosition, WorkerPosition],
    },
    nextPlayer: state.nextPlayer,
  };
}

function encodeMove(workerIndex: number, moveDirection: number, buildDirection: number): number {
  return workerIndex * GAME_CONSTANTS.MOVES_PER_WORKER + moveDirection * GAME_CONSTANTS.DIRECTIONS_COUNT + buildDirection;
}

function createInitialState(): LocalState {
  const board = Array.from({ length: GAME_CONSTANTS.BOARD_SIZE }, () =>
    Array.from({ length: GAME_CONSTANTS.BOARD_SIZE }, () => createEmptyCell()),
  );

  const workers: LocalState['workers'] = {
    0: [
      { y: 0, x: 0 },
      { y: 0, x: 2 },
    ],
    1: [
      { y: 4, x: 2 },
      { y: 4, x: 4 },
    ],
  };

  board[0][0].worker = 1;
  board[0][2].worker = 2;
  board[4][2].worker = -1;
  board[4][4].worker = -2;

  return {
    board,
    workers,
    nextPlayer: 0,
  };
}

function applyMove(state: LocalState, action: number): LocalState {
  const [workerIndex, moveDirection, buildDirection] = decodeMove(action);
  const player = state.nextPlayer;
  const nextState = cloneState(state);
  const workerPosition = nextState.workers[player][workerIndex];

  const [moveY, moveX] = applyDirection(workerPosition.y, workerPosition.x, moveDirection);
  const [buildY, buildX] = applyDirection(moveY, moveX, buildDirection);

  nextState.board[workerPosition.y][workerPosition.x].worker = 0;

  nextState.board[moveY][moveX].worker = player === 0 ? (workerIndex === 0 ? 1 : 2) : (workerIndex === 0 ? -1 : -2);
  nextState.workers[player][workerIndex] = { y: moveY, x: moveX };

  const targetCell = nextState.board[buildY][buildX];
  targetCell.level = Math.min(GAME_CONSTANTS.MAX_LEVEL, targetCell.level + 1);

  nextState.nextPlayer = player === 0 ? 1 : 0;

  return nextState;
}

describe('local reducer parity with python baseline', () => {
  it('reproduces a mixed move sequence with alternating players', () => {
    const moves = [
      encodeMove(0, 8, 5),
      encodeMove(0, 0, 1),
      encodeMove(1, 5, 7),
      encodeMove(1, 1, 3),
    ];

    const result = moves.reduce((state, action) => applyMove(state, action), createInitialState());

    expect(result.nextPlayer).toBe(0);

    const expectedWorkers: Record<PlayerIndex, [WorkerPosition, WorkerPosition]> = {
      0: [
        { y: 1, x: 1 },
        { y: 0, x: 3 },
      ],
      1: [
        { y: 3, x: 1 },
        { y: 3, x: 4 },
      ],
    };

    expect(result.workers).toEqual(expectedWorkers);

    const expectedLevels: Array<[number, number, number]> = [
      [1, 2, 1],
      [2, 1, 1],
      [1, 3, 1],
      [3, 3, 1],
    ];

    expectedLevels.forEach(([y, x, level]) => {
      expect(result.board[y][x].level).toBe(level);
    });
  });

  it('caps tower height at level four', () => {
    const state = createInitialState();
    const buildTarget = { y: 1, x: 1 };

    state.board[0][0].worker = 0;
    state.workers[0][0] = { y: 1, x: 0 };
    state.board[1][0].worker = 1;
    state.board[buildTarget.y][buildTarget.x].level = GAME_CONSTANTS.MAX_LEVEL;

    const result = applyMove(state, encodeMove(0, 4, 5));

    expect(result.board[buildTarget.y][buildTarget.x].level).toBe(GAME_CONSTANTS.MAX_LEVEL);
  });
});
