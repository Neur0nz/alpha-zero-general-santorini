export const GAME_CONSTANTS = {
  BOARD_SIZE: 5,
  DIRECTIONS_COUNT: 9,
  WORKERS_PER_PLAYER: 2,
  MAX_LEVEL: 4,
  MOVES_PER_WORKER: 9 * 9,
  TOTAL_MOVES: 2 * 9 * 9,
  DIRECTION_OFFSET: 1,
  DIRECTION_MULTIPLIER: 3,
} as const;

export const DIRECTIONS_CHAR = ['↖', '↑', '↗', '←', 'Ø', '→', '↙', '↓', '↘'] as const;

export const GREEN = '#21BA45';
export const RED = '#DB2828';
