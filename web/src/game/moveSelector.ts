import { encodeDirection } from './utils';
import { GAME_CONSTANTS } from './constants';
import { Santorini } from './santorini';

export class MoveSelector {
  stage: number;
  cells: boolean[][];
  workerID: number;
  workerX: number;
  workerY: number;
  moveDirection: number;
  workerNewX: number;
  workerNewY: number;
  buildDirection: number;
  buildX: number;
  buildY: number;
  currentMoveWoPower: number;
  editMode: number;

  constructor(private game: Santorini) {
    this.stage = 0;
    this.cells = [];
    this.workerID = 0;
    this.workerX = 0;
    this.workerY = 0;
    this.moveDirection = 0;
    this.workerNewX = 0;
    this.workerNewY = 0;
    this.buildDirection = 0;
    this.buildX = 0;
    this.buildY = 0;
    this.currentMoveWoPower = 0;
    this.editMode = 0;
    this.resetAndStart();
  }

  reset() {
    this.cells = Array.from({ length: GAME_CONSTANTS.BOARD_SIZE }, () => Array(GAME_CONSTANTS.BOARD_SIZE).fill(false));
    this.stage = 0;
    this.workerID = 0;
    this.workerX = 0;
    this.workerY = 0;
    this.moveDirection = 0;
    this.workerNewX = 0;
    this.workerNewY = 0;
    this.buildDirection = 0;
    this.buildX = 0;
    this.buildY = 0;
    this.currentMoveWoPower = 0;
  }

  resetAndStart() {
    this.reset();
    this.start();
  }

  start() {
    this.selectRelevantCells();
  }

  click(clickedY: number, clickedX: number) {
    this.stage += 1;
    if (this.stage === 1) {
      this.workerX = clickedX;
      this.workerY = clickedY;
      this.workerID = Math.abs(this.game.py._read_worker(this.workerY, this.workerX)) - 1;
      this.currentMoveWoPower = GAME_CONSTANTS.MOVES_PER_WORKER * this.workerID;
    } else if (this.stage === 2) {
      this.workerNewX = clickedX;
      this.workerNewY = clickedY;
      this.moveDirection = encodeDirection(this.workerX, this.workerY, this.workerNewX, this.workerNewY);
      this.currentMoveWoPower += GAME_CONSTANTS.DIRECTIONS_COUNT * this.moveDirection;
    } else if (this.stage === 3) {
      this.buildX = clickedX;
      this.buildY = clickedY;
      this.buildDirection = encodeDirection(this.workerNewX, this.workerNewY, this.buildX, this.buildY);
      this.currentMoveWoPower += this.buildDirection;
    } else {
      this.reset();
    }
    this.selectRelevantCells();
  }

  getMove() {
    if (this.stage >= 3) {
      return this.currentMoveWoPower;
    }
    return -1;
  }

  isSelectable(y: number, x: number) {
    return this.cells[y][x];
  }

  getPartialDescription() {
    let description = '';
    if (this.stage >= 1) {
      description += `You move from (${this.workerY},${this.workerX})`;
    }
    if (this.stage >= 2) {
      description += ` in direction ${this.moveDirection}`;
    }
    if (this.stage >= 3) {
      description += ` and build direction ${this.buildDirection}`;
    }
    return description;
  }

  edit() {
    this.selectNone();
    this.editMode = (this.editMode + 1) % 3;
    if (this.editMode === 0) {
      this.game.editCell(-1, -1, 0);
      this.selectRelevantCells();
    }
  }

  setEditMode(mode: number) {
    this.editMode = mode;
    if (mode === 0) {
      this.game.editCell(-1, -1, 0);
    }
    this.selectRelevantCells();
  }

  selectRelevantCells() {
    if (this.game.py === null) {
      return;
    }

    if (!this.game.is_human_player('next')) {
      this.selectNone();
      return;
    }

    if (this.stage >= 3) {
      this.selectNone();
    } else if (this.stage < 1) {
      for (let y = 0; y < GAME_CONSTANTS.BOARD_SIZE; y += 1) {
        for (let x = 0; x < GAME_CONSTANTS.BOARD_SIZE; x += 1) {
          if (
            (this.game.nextPlayer === 0 && this.game.py._read_worker(y, x) > 0) ||
            (this.game.nextPlayer === 1 && this.game.py._read_worker(y, x) < 0)
          ) {
            this.cells[y][x] = this.anySubmovePossible(y, x);
          } else {
            this.cells[y][x] = false;
          }
        }
      }
    } else {
      for (let y = 0; y < GAME_CONSTANTS.BOARD_SIZE; y += 1) {
        for (let x = 0; x < GAME_CONSTANTS.BOARD_SIZE; x += 1) {
          this.cells[y][x] = this.anySubmovePossible(y, x);
        }
      }
    }
  }

  selectNone() {
    this.cells = Array.from({ length: GAME_CONSTANTS.BOARD_SIZE }, () => Array(GAME_CONSTANTS.BOARD_SIZE).fill(false));
  }

  private anySubmovePossible(coordY: number, coordX: number) {
    let anyMovePossible = true;
    if (this.stage === 0) {
      const workerId = Math.abs(this.game.py._read_worker(coordY, coordX)) - 1;
      const movesBegin = workerId * GAME_CONSTANTS.MOVES_PER_WORKER;
      const movesEnd = (workerId + 1) * GAME_CONSTANTS.MOVES_PER_WORKER;
      anyMovePossible = this.game.validMoves.slice(movesBegin, movesEnd).some((x: boolean) => x);
    } else if (this.stage === 1) {
      const moveDirection = encodeDirection(this.workerX, this.workerY, coordX, coordY);
      if (moveDirection < 0) {
        return false;
      }
      const movesBegin = this.currentMoveWoPower + moveDirection * GAME_CONSTANTS.DIRECTIONS_COUNT;
      const movesEnd = this.currentMoveWoPower + (moveDirection + 1) * GAME_CONSTANTS.DIRECTIONS_COUNT;
      anyMovePossible = this.game.validMoves.slice(movesBegin, movesEnd).some((x: boolean) => x);
    } else if (this.stage === 2) {
      const buildDirection = encodeDirection(this.workerNewX, this.workerNewY, coordX, coordY);
      if (buildDirection < 0) {
        return false;
      }
      anyMovePossible = this.game.validMoves[this.currentMoveWoPower + buildDirection];
    }
    return anyMovePossible;
  }
}
