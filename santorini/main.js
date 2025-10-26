// Import common/game.js before this file

/* =================== */
/* =====  CONST  ===== */
/* =================== */

// Here are common constants between nogod and god modes.
// Check also constants_*.js

const directions_char = ['↖', '↑', '↗', '←', 'Ø', '→', '↙', '↓', '↘'];

const green = '#21BA45';
const red   = '#DB2828';

// Game constants
const GAME_CONSTANTS = {
  BOARD_SIZE: 5,
  DIRECTIONS_COUNT: 9,
  WORKERS_PER_PLAYER: 2,
  MAX_LEVEL: 4,
  MOVES_PER_WORKER: 9 * 9, // 9 directions * 9 build directions
  TOTAL_MOVES: 2 * 9 * 9,  // 2 workers * 9 * 9 moves
  DIRECTION_OFFSET: 1,      // For direction encoding/decoding
  DIRECTION_MULTIPLIER: 3   // For direction encoding/decoding
};

const list_of_files = [
  ['santorini/Game.py', 'Game.py'],
  ['santorini/proxy.py', 'proxy.py'],
  ['santorini/MCTS.py', 'MCTS.py'],
  ['santorini/SantoriniDisplay.py', 'SantoriniDisplay.py'],
  ['santorini/SantoriniGame.py', 'SantoriniGame.py'],
  ['santorini/SantoriniLogicNumba.py', 'SantoriniLogicNumba.py'],
  [pyConstantsFileName, 'SantoriniConstants.py'],
];

const sizeCB = [1, 25, 3];
const sizeV = [1, onnxOutputSize];

/* =================== */
/* =====  UTILS  ===== */
/* =================== */

/**
 * Encodes direction between two positions
 * @param {number} oldX - Starting X coordinate
 * @param {number} oldY - Starting Y coordinate
 * @param {number} newX - Ending X coordinate
 * @param {number} newY - Ending Y coordinate
 * @returns {number} Direction code (0-8) or -1 if invalid
 */
function encodeDirection(oldX, oldY, newX, newY) {
  // Input validation
  if (typeof oldX !== 'number' || typeof oldY !== 'number' || 
      typeof newX !== 'number' || typeof newY !== 'number') {
    console.warn('encodeDirection: Invalid input parameters');
    return -1;
  }
  
  const diffX = newX - oldX;
  const diffY = newY - oldY;
  
  // Check if move is within valid range (adjacent cells only)
  if (Math.abs(diffX) > 1 || Math.abs(diffY) > 1) {
    return -1;
  }
  
  return ((diffY + GAME_CONSTANTS.DIRECTION_OFFSET) * GAME_CONSTANTS.DIRECTION_MULTIPLIER + (diffX + GAME_CONSTANTS.DIRECTION_OFFSET));
}

/**
 * Converts a move to a human-readable string
 * @param {number} move - The move to convert
 * @param {string} subject - Subject performing the move
 * @returns {string} Human-readable move description
 */
function moveToString(move, subject = 'One') {
  const [worker, move_direction, build_direction] = Santorini.decodeMove(move);
  let description = subject + ' moved worker ' + worker + ' ' + directions_char[move_direction];
  description += ' then build ' + directions_char[build_direction];
  description += ' [' + move + ']';
  return description;
}

/**
 * Generates SVG for a game cell
 * @param {number} nb_levels - Number of building levels
 * @param {number} worker - Worker ID (positive for green, negative for red, 0 for none)
 * @returns {string} SVG markup for the cell
 */
function generateSvg(nb_levels, worker) {
  const width = 240;
  const height = 240;
  const level_height = 40;
  const level_shrink_x = 30;
  
  let style = 'style=""';
  if (worker > 0) {
    style = `style="fill: ${green};"`;
  } else if (worker < 0) {
    style = `style="fill: ${red};"`;
  }

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xml:space="preserve">`;

  // Draw base rectangles
  let x_beg = 0, x_end = 0, y_beg = height, y_end = height;
  for (let l=0; l<nb_levels && l<3; l++) {
    x_beg = level_shrink_x * l, x_end = width - level_shrink_x * l;
    y_beg = height - level_height * l, y_end = height - level_height * (l+1);
    svg += `<polygon ${style} points="${x_beg},${y_beg} ${x_beg},${y_end} ${x_end},${y_end} ${x_end},${y_beg}"/>`;
  }

  // Draw upper item: either dome, either worker, either nothing
  if (nb_levels === 4) {
    svg += `<path d="M 70 0 A 50 50, 0, 0 1, 170 0" style="fill: blue;" transform="translate(0 ${3*level_height})"/>`;
  } else if (worker !== 0) {
    svg += `<g ${style} transform="translate(70 ${height - nb_levels*level_height - 100})">`;
    if (Math.abs(worker) === 1) {
      svg += '<path d="M66.403,29.362C68.181,18.711,60.798,10,50,10l0,0c-10.794,0-18.177,8.711-16.403,19.362l2.686,16.133 c1.068,6.393,7.24,11.621,13.718,11.621l0,0c6.481,0,12.649-5.229,13.714-11.621L66.403,29.362z"/>';
      svg += '<path d="M64.007,58.001c-3.76,3.535-8.736,5.781-14.007,5.781s-10.247-2.246-14.007-5.781l-19.668,6.557 C12.845,65.716,10,69.668,10,73.333V90h80V73.333c0-3.665-2.845-7.617-6.325-8.775L64.007,58.001z"/>';
    } else {
      svg += '<path d="M83.675,64.558l-19.668-6.557c-3.76,3.535-8.736,5.781-14.007,5.781s-10.247-2.246-14.007-5.781l-19.668,6.557 C12.845,65.716,10,69.668,10,73.333V90h80V73.333C90,69.668,87.155,65.716,83.675,64.558z"/>';
      svg += '<path d="M76.328,50c-6.442-6.439-9.661-14.886-9.661-23.333h-0.029C66.862,17.282,59.87,10,50,10 c-9.863,0-16.855,7.282-16.638,16.667h-0.029c0,8.447-3.219,16.895-9.661,23.333l4.714,4.717c3.189-3.189,5.726-6.846,7.637-10.791 l0.26,1.569c1.068,6.394,7.24,11.622,13.718,11.622c6.481,0,12.649-5.228,13.714-11.622l0.264-1.572 c1.911,3.945,4.447,7.605,7.637,10.794L76.328,50z"/>';
    }
    svg += `</g>`;
  }
  svg += '</svg>';
  return svg;
}

/* =================== */
/* =====  LOGIC  ===== */
/* =================== */

/**
 * Santorini game logic class
 * Handles game state, move validation, and game progression
 */
class Santorini extends AbstractGame {
  constructor() {
    super()
    this.validMoves = Array(GAME_CONSTANTS.TOTAL_MOVES).fill(false);
    this.lastMove = -1;
    this.cellsOfLastMove = [];
  }

  post_init_game() {
    this.lastMove = -1;
    this.cellsOfLastMove = [];
  }

  pre_move(action, manualMove) {
    if (manualMove) {
      this.cellsOfLastMove = [];
    } else {
      this._updateLastCells(action);
    }
    this.lastMove = action;
  }

  post_move(action, manualMove) {
    // Power info no longer needed
  }

  post_set_data() {
    this.lastMove = -1;
    this.cellsOfLastMove = [];
  }

  has_changed_on_last_move(item_vector) {
    return this.cellsOfLastMove.some(e => e.toString() === item_vector.toString());
  }

  _updateLastCells(action) {
    const [worker, move_direction, build_direction] = Santorini.decodeMove(action);
    const worker_id = (worker + 1) * ((this.nextPlayer === 0) ? 1 : -1);
    
    if (!this.py || !this.py._findWorker) {
      console.warn('Python game not available for _updateLastCells');
      return;
    }
    
    const [workerY, workerX] = this.py._findWorker(worker_id).toJs({create_proxies: false});
    const [moveY, moveX] = Santorini._applyDirection(workerY, workerX, move_direction);
    const [buildY, buildX] = Santorini._applyDirection(moveY, moveX, build_direction);
    this.cellsOfLastMove = [[workerY, workerX]];
  }


  editCell(clicked_y, clicked_x, editMode) {
    if (!this.py || !this.py.editCell) {
      console.warn('Python game not available for editCell');
      return;
    }
    
    this.py.editCell(clicked_y, clicked_x, editMode);
    
    if (editMode === 0) {
      try {
        const data_tuple = this.py.update_after_edit().toJs({create_proxies: false});
      [this.nextPlayer, this.gameEnded, this.validMoves] = data_tuple;
      } catch (error) {
        console.error('Error updating after edit:', error);
      }
    }
  }


  /**
   * Decodes a move integer into its components
   * @param {number} move - The move integer to decode
   * @returns {Array<number>} [worker, move_direction, build_direction]
   */
  static decodeMove(move) {
    const worker = Math.floor(move / GAME_CONSTANTS.MOVES_PER_WORKER);
    const action = move % GAME_CONSTANTS.MOVES_PER_WORKER;
    const move_direction = Math.floor(action / GAME_CONSTANTS.DIRECTIONS_COUNT);
    const build_direction = action % GAME_CONSTANTS.DIRECTIONS_COUNT;
    return [worker, move_direction, build_direction];
  }

  /**
   * Applies a direction to a position
   * @param {number} startY - Starting Y coordinate
   * @param {number} startX - Starting X coordinate  
   * @param {number} direction - Direction (0-8)
   * @returns {Array<number>} [newY, newX]
   */
  static _applyDirection(startY, startX, direction) {
    // Input validation
    if (typeof startY !== 'number' || typeof startX !== 'number' || typeof direction !== 'number') {
      console.warn('_applyDirection: Invalid input parameters');
      return [startY, startX];
    }
    
    if (direction < 0 || direction >= GAME_CONSTANTS.DIRECTIONS_COUNT) {
      console.warn('_applyDirection: Invalid direction', direction);
      return [startY, startX];
    }
    
    const deltaY = Math.floor(direction / GAME_CONSTANTS.DIRECTION_MULTIPLIER) - GAME_CONSTANTS.DIRECTION_OFFSET;
    const deltaX = (direction % GAME_CONSTANTS.DIRECTION_MULTIPLIER) - GAME_CONSTANTS.DIRECTION_OFFSET;
    
    const newY = startY + deltaY;
    const newX = startX + deltaX;
    
    // Bounds checking
    if (newY < 0 || newY >= GAME_CONSTANTS.BOARD_SIZE || 
        newX < 0 || newX >= GAME_CONSTANTS.BOARD_SIZE) {
      console.warn('_applyDirection: Result out of bounds', {newY, newX, startY, startX, direction});
      return [startY, startX];
    }
    
    return [newY, newX];
  }
}

/**
 * Handles move selection logic for the Santorini game
 * Manages the multi-stage move process (select worker, move, build)
 */
class MoveSelector extends AbstractMoveSelector {
  constructor() {
    super()
    this.resetAndStart();
    this.stage = 0; // how many taps done, finished when 3, -1 means new game
  }

  /**
   * Resets the move selector to initial state
   */
  reset() {
    this.cells = Array.from(Array(GAME_CONSTANTS.BOARD_SIZE), _ => Array(GAME_CONSTANTS.BOARD_SIZE).fill(false));
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
    this.currentMoveWoPower = 0; // Accumulate data about move being selected
    this.power = -1; // -1 = undefined, 0 = no power used, x = power delta to add on 'currentMoveWoPower'
    this.editMode = 0; // 0 = no edit mode, 1 = editing levels, 2 = editing workers
  }

  start() {
    this._select_relevant_cells();
  }

  // return move when finished, else null
  /**
   * Handles cell clicks during move selection
   * @param {number} clicked_y - Y coordinate of clicked cell
   * @param {number} clicked_x - X coordinate of clicked cell
   */
  click(clicked_y, clicked_x) {
    this.stage++; 
    if (this.stage === 1) {
      // Selecting worker
      this.workerX = clicked_x;
      this.workerY = clicked_y;
      this.workerID = Math.abs(game.py._read_worker(this.workerY, this.workerX)) - 1;
      this.currentMoveWoPower = GAME_CONSTANTS.MOVES_PER_WORKER * this.workerID;
    } else if (this.stage === 2) {
      // Selecting worker new position
      this.workerNewX = clicked_x;
      this.workerNewY = clicked_y;
      this.moveDirection = encodeDirection(this.workerX, this.workerY, this.workerNewX, this.workerNewY);
      this.currentMoveWoPower += GAME_CONSTANTS.DIRECTIONS_COUNT * this.moveDirection;
    } else if (this.stage === 3) {
      // Selecting building position
      this.buildX = clicked_x;
      this.buildY = clicked_y;
      this.buildDirection = encodeDirection(this.workerNewX, this.workerNewY, this.buildX, this.buildY);
      this.currentMoveWoPower += this.buildDirection;
    } else if (this.stage === 4) {
      console.log('We are on stage 4');
      this.reset();
    } else {
      console.log('We are on stage', this.stage);
      // Starting new game
      this.reset();
    }

    this._select_relevant_cells();
  }


  isSelectable(y, x) {
    return this.cells[y][x];
  }

  getPartialDescription() {
    var description = '';
    if (this.stage >= 1) {
      description += 'You move from ('+this.workerY+','+this.workerX+')';
    }
    if (this.stage >= 2) {
      description += ' in direction ' + directions_char[this.moveDirection];
    }
    if (this.stage >= 3) {
      description += ' and build ' + directions_char[this.buildDirection] + ' [' + this.currentMoveWoPower + ']';
    }
    return description;
  }

  // return move, or -1 if move is undefined
  getMove() {
    if (this.stage >= 3) {
        return this.currentMoveWoPower;
    }
    return -1;
  }

  edit() {
    this._select_none();
    this.editMode = (this.editMode+1) % 3;
    if (this.editMode === 0) {
      game.editCell(-1, -1, 0);
      this._select_relevant_cells();
    }
  }

  _select_relevant_cells() {
    if (game.py === null) {
      return;
    }

    // Only make cells selectable for human players
    if (!game.is_human_player(game.nextPlayer)) {
      this._select_none();
      return;
    }

    if (this.stage >= 3) {
      this._select_none();
    } else if (this.stage < 1) {
      for (let y = 0; y < GAME_CONSTANTS.BOARD_SIZE; y++) {
        for (let x = 0; x < GAME_CONSTANTS.BOARD_SIZE; x++) {
          if ((game.nextPlayer === 0 && game.py._read_worker(y,x) > 0) ||
              (game.nextPlayer === 1 && game.py._read_worker(y,x) < 0)) {
            this.cells[y][x] = this._anySubmovePossible(y, x);
          } else {
            this.cells[y][x] = false;
          }
        }
      }
    } else {
      for (let y = 0; y < GAME_CONSTANTS.BOARD_SIZE; y++) {
        for (let x = 0; x < GAME_CONSTANTS.BOARD_SIZE; x++) {
          this.cells[y][x] = this._anySubmovePossible(y, x);
        }
      }
    }
  }

  /**
   * Deselects all cells
   */
  _select_none() {
    this.cells = Array.from(Array(GAME_CONSTANTS.BOARD_SIZE), _ => Array(GAME_CONSTANTS.BOARD_SIZE).fill(false));
  }

  /**
   * Checks if any submove is possible from the given coordinates
   * @param {number} coordY - Y coordinate to check
   * @param {number} coordX - X coordinate to check
   * @returns {boolean} True if any submove is possible
   */
  _anySubmovePossible(coordY, coordX) {
    let any_move_possible = true;
    if (this.stage === 0) {
      const worker_id = Math.abs(game.py._read_worker(coordY, coordX)) - 1;
      const moves_begin = worker_id * GAME_CONSTANTS.MOVES_PER_WORKER;
      const moves_end = (worker_id + 1) * GAME_CONSTANTS.MOVES_PER_WORKER;
      any_move_possible = game.validMoves.slice(moves_begin, moves_end).some(x => x);
    } else if (this.stage === 1) {
      // coord = worker move direction
      const move_direction = encodeDirection(this.workerX, this.workerY, coordX, coordY);
      if (move_direction < 0) {
        return false; // Not valid move
      }
      const moves_begin = this.currentMoveWoPower + move_direction * GAME_CONSTANTS.DIRECTIONS_COUNT;
      const moves_end = this.currentMoveWoPower + (move_direction + 1) * GAME_CONSTANTS.DIRECTIONS_COUNT;
      any_move_possible = game.validMoves.slice(moves_begin, moves_end).some(x => x);
    } else if (this.stage === 2) {
      // coord = build direction
      const build_direction = encodeDirection(this.workerNewX, this.workerNewY, coordX, coordY);
      if (build_direction < 0) {
        return false; // Not valid move
      }
      any_move_possible = game.validMoves[this.currentMoveWoPower + build_direction];
    } else {
      console.log('Weird, I dont support this.stage=', this.stage, coordX, coordY);
    }

    return any_move_possible;
  }
}

/* =================== */
/* ===== DISPLAY ===== */
/* =================== */

/**
 * Refreshes the game board display
 */
function refreshBoard() {
  const editMode = move_sel.editMode;
  for (let y = 0; y < GAME_CONSTANTS.BOARD_SIZE; y++) {
    for (let x = 0; x < GAME_CONSTANTS.BOARD_SIZE; x++) {
      let cell = document.getElementById('cell_' + y + '_' + x);
      let level  = game.py._read_level(y, x);
      let worker = game.py._read_worker(y, x);
      let selectable = move_sel.isSelectable(y, x);

      // generateSvg deals with nb of levels, dome, worker and color
      let wrapperOpen = '<div class="ui middle aligned tiny image" style="position: relative;">';
      cell_content = wrapperOpen;
      if (game.has_changed_on_last_move([y,x])) {
        // Since dot only shows for AI, making it red if human is P0 else green
        let dotColor = game.is_human_player(0) ? 'red' : 'green';
        cell_content += `<div class="ui tiny ${dotColor} corner empty circular label"></div>`;
      }
      // Base SVG
      cell_content += generateSvg(level, worker);
      // Ghost preview overlay (edit mode only)
      if (move_sel.editMode > 0 && window.preview && window.preview.active && window.preview.y === y && window.preview.x === x) {
        const overlay = window.preview;
        if (overlay.type === 'move') {
          const movingWorkerId = (move_sel.workerID + 1) * (game.nextPlayer === 0 ? 1 : -1);
          const ghostSvg = generateSvg(level, movingWorkerId);
          cell_content += `<div style="position:absolute; left:0; top:0; right:0; bottom:0; opacity:0.45; pointer-events:none;">${ghostSvg}</div>`;
        } else if (overlay.type === 'build') {
          const nextLevel = Math.min(4, level + 1);
          const ghostSvg = generateSvg(nextLevel, 0);
          cell_content += `<div style="position:absolute; left:0; top:0; right:0; bottom:0; opacity:0.45; pointer-events:none;">${ghostSvg}</div>`;
        }
      }
      // Persistent ghost for moved worker during build selection (stage 2)
      if (move_sel.editMode === 0 && move_sel.stage === 2 && y === move_sel.workerNewY && x === move_sel.workerNewX) {
        const movingWorkerId = (move_sel.workerID + 1) * (game.nextPlayer === 0 ? 1 : -1);
        const ghostSvg = generateSvg(level, movingWorkerId);
        cell_content += `<div style=\"position:absolute; left:0; top:0; right:0; bottom:0; opacity:0.65; pointer-events:none;\">${ghostSvg}</div>`;
      }
      // Close wrapper after overlay
      cell_content += '</div>';

      // set cell background and ability to be clicked
      if (editMode > 0) {
        cell.classList.add('selectable');
        cell.innerHTML = '<a onclick="cellClick('+y+','+x+');event.preventDefault();" onmouseenter="cellHoverEnter('+y+','+x+')" onmouseleave="cellHoverLeave()">' + cell_content + '</a>';
      } else if (selectable) {
        cell.classList.add('selectable');
        // Lightweight hover handlers (no re-render): add/remove ghost overlay only
        cell.innerHTML = '<a onclick="cellClick('+y+','+x+');event.preventDefault();" onmouseenter="ghostEnter('+y+','+x+')" onmouseleave="ghostLeave('+y+','+x+')">' + cell_content + '</a>';
      } else {
        cell.classList.remove('selectable');
        cell.innerHTML = cell_content;
      }
    }
  }
}

function refreshButtons(loading=false) {
  if (loading) {
    // Loading state - show loading button
    allBtn.style = "display: none";
    loadingBtn.style = "display: block";
    loadingBtn.classList.add('loading');
    allBtn.classList.remove('green', 'red');
  } else if (move_sel.editMode > 0) {
    editMsg.classList.remove('hidden');
    allBtn.style = "display: none";
    allBtn.classList.remove('green', 'red');

    // Edit mode buttons are now managed by Alpine.js
    // No need to manually update classes
  } else {
    allBtn.style = "";
    loadingBtn.style = "display: none";
    loadingBtn.classList.remove('loading');
    if (game.is_ended()) {
      // Game is finished, looking for the winner
      console.log('End of game');
      allBtn.classList.add((game.gameEnded[0]>0) ? 'green' : 'red');
    } else {
      // Ongoing game
      allBtn.classList.remove('green', 'red');
      if (game.py.get_last_action() === null && move_sel.stage <= 0) {
        undoBtn.classList.add('disabled');
      } else {
        undoBtn.classList.remove('disabled');
      }
    }

    // Power buttons removed from UI; skip updating their state

    editMsg.classList.add('hidden');
    // Edit mode buttons are now managed by Alpine.js
  }
}

/**
 * Updates the player information display
 */
function refreshPlayersText() {
  // Simplified for no-powers version
  p0title.innerHTML = "Player 1";
  p0details.innerHTML = "Green pieces";
  p1title.innerHTML = "Player 2"; 
  p1details.innerHTML = "Red pieces";
}

// Redo state management
let redoStack = [];
let isRedoInProgress = false;

// History modal data
function historyModal() {
  return {
    gameHistory: [],
    currentMove: 0,
    gameMoves: [], // Store actual game moves for navigation
    
    init() {
      this.updateHistory();
    },
    
    updateHistory() {
      // Get history from the evalBar if it exists
      if (window.evalBar && window.evalBar._x_dataStack && window.evalBar._x_dataStack[0]) {
        const evalData = window.evalBar._x_dataStack[0];
        this.gameHistory = evalData.history || [];
        this.currentMove = this.gameHistory.length - 1;
  } else {
        this.gameHistory = [];
        this.currentMove = 0;
      }
      
      // Also get actual game moves from the Python backend
      this.updateGameMoves();
    },
    
    updateGameMoves() {
      if (game && game.py) {
        try {
          // Get the Python history - it's stored in reverse order (newest first)
          const pyHistory = game.py.history || [];
          
          // Reverse to get chronological order
          const chronologicalHistory = [...pyHistory].reverse();
          
          // Create moves array with proper indexing
          this.gameMoves = chronologicalHistory.map((state, index) => ({
            move: index + 1,
            player: state[0],
            board: state[1],
            action: state[2],
            description: `Move ${index + 1} - Player ${state[0]}`,
            evaluation: this.gameHistory[index] ? this.gameHistory[index].eval : 0
          }));
          
          // Update current move to be the last move in the history
          this.currentMove = Math.max(0, this.gameMoves.length - 1);
        } catch (error) {
          console.error('Error updating game moves:', error);
          this.gameMoves = [];
          this.currentMove = 0;
        }
      }
    },
    
    async jumpToMove(moveIndex) {
      if (moveIndex < 0 || moveIndex >= this.gameMoves.length) return;
      
      console.log('Jumping to move:', moveIndex);
      this.currentMove = moveIndex;
      
      try {
        // Use Python backend to jump to the desired state
        if (game && game.py) {
          // Convert from chronological index to reverse history index
          const reverseIndex = this.gameMoves.length - 1 - moveIndex;
          const result = game.py.jump_to_move_index(reverseIndex);
          if (result) {
            const [nextPlayer, gameEnded, validMoves] = result;
            
            // Update game state
            game.nextPlayer = nextPlayer;
            game.gameEnded = gameEnded;
            game.validMoves = validMoves;
            
            // Clear redo stack when jumping to history
            redoStack = [];
            
            // Update UI
            move_sel.reset();
            move_sel._select_relevant_cells();
            refreshBoard();
            refreshButtons();
            
            // Refresh evaluation for the new position
            if (typeof refreshEvaluation === 'function') {
              await refreshEvaluation();
            }
            
            // Update the history modal data after jumping
            this.updateHistory();
          }
        }
      } catch (error) {
        console.error('Error jumping to move:', error);
      }
    },
    
    closeModal() {
      const modal = document.getElementById('historyModal');
      if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
      }
    }
  };
}

// Show history modal
function showHistoryModal() {
  const modal = document.getElementById('historyModal');
  if (modal) {
    // Refresh history data before showing
    const modalData = modal._x_dataStack && modal._x_dataStack[0];
    if (modalData && modalData.updateHistory) {
      modalData.updateHistory();
    }
    
    // Use Fomantic UI's modal API
    modal.classList.add('active');
    modal.style.display = 'block';
    document.body.classList.add('modal-open');
  }
}

/**
 * Redoes the last undone move if available
 * @returns {Promise<void>}
 */
async function redo_last() {
  if (game.py === null) {
    console.warn('Redo failed: Python game not initialized');
    return;
  }
  
  // Prevent rapid redo actions that cause cycling
  if (isRedoInProgress) {
    console.log('Redo already in progress, ignoring request');
    return;
  }
  
  try {
    isRedoInProgress = true;
    
    // Get the last action from Python history
    const lastAction = game.py.get_last_action();
    if (lastAction === null) {
      console.log('Redo failed: no action available to redo');
      return;
    }
    
    const actionValue = lastAction.toJs ? lastAction.toJs({create_proxies: false}) : lastAction;
    
    // Check if this action is valid in current state
    if (!game.validMoves[actionValue]) {
      console.log('Redo failed: action not valid in current state');
      return;
    }
    
    console.log('Redoing action:', actionValue);
    
    // Use the Python backend to handle the redo properly
    try {
      const result = game.py.getNextState(actionValue).toJs({create_proxies: false});
      const [nextPlayer, gameEnded, validMoves] = result;
      
      // Update game state
      game.nextPlayer = nextPlayer;
      game.gameEnded = gameEnded;
      game.validMoves = validMoves;
      
      // Clear redo stack when new moves are made
      redoStack = [];
      
      move_sel.reset();
      move_sel._select_relevant_cells(); // Update selectable cells
      refreshBoard();
      refreshButtons();
      
      // Only trigger AI if next player is not human
      if (!game.is_human_player(game.nextPlayer)) {
        ai_play_if_needed();
      }
      // Always refresh evaluation after any move
      if (typeof refreshEvaluation === 'function') {
        await refreshEvaluation();
      }
    } catch (pyError) {
      console.error('Python redo failed:', pyError);
      // Fallback to JavaScript move
      game.move(actionValue, true);
      move_sel.reset();
      move_sel._select_relevant_cells();
      refreshBoard();
      refreshButtons();
      
      if (!game.is_human_player(game.nextPlayer)) {
        ai_play_if_needed();
      }
      if (typeof refreshEvaluation === 'function') {
        await refreshEvaluation();
      }
    }
  } catch (error) {
    console.error('Redo failed:', error);
  } finally {
    // Add small delay to prevent rapid clicking
    setTimeout(() => {
      isRedoInProgress = false;
    }, 300);
  }
}

let movesText = [];

/**
 * Updates the move text display
 * @param {string} text - Text to display
 * @param {string} mode - Mode: 'reset', 'edit', or 'add'
 */
function changeMoveText(text, mode = 'reset') {
  if (mode === 'reset') {
    movesText = [];
  } else if (mode === 'edit') {
    movesText[0] = text;
  } else if (mode === 'add') {
    movesText[1] = movesText[0];
    movesText[0] = text;
  }

  moveSgmt.innerHTML = movesText.join('<br>');

  // Update compact status bar beneath the board
  const statusText = document.getElementById('statusText');
  if (statusText) {
    if (move_sel.stage <= 0) {
      statusText.innerText = 'Ready. Select a worker to start your move.';
    } else if (move_sel.stage === 1) {
      statusText.innerText = 'Step 1/3: Select destination square for the selected worker.';
    } else if (move_sel.stage === 2) {
      statusText.innerText = 'Step 2/3: Select a build square.';
    } else if (move_sel.stage >= 3) {
      statusText.innerText = 'Step 3/3: Confirming build location.';
    }
  }
}

function getChessStyleEvalBar(value, width=400) {
  // value: -1 (Player 1/Red winning) to +1 (Player 0/Green winning)
  // Bar expands from center: right for positive (green), left for negative (red)
  
  const clampedValue = Math.max(-1, Math.min(1, value)); // Clamp to [-1, 1]
  const halfWidth = width / 2;
  
  // Determine color and width based on value
  let barColor, barWidth, barDirection;
  
  if (clampedValue > 0) {
    // Player 0 (Green) winning - expand right, green color
    // Use full halfWidth when at max (±1.0) to ensure bar reaches 100%
    barWidth = Math.abs(clampedValue) >= 0.995 ? halfWidth : Math.round(Math.abs(clampedValue) * halfWidth);
    barDirection = 'right';
    
    if (clampedValue > 0.6) {
      barColor = '#21BA45'; // Strong green
    } else if (clampedValue > 0.2) {
      barColor = '#6DD47E'; // Light green
    } else {
      barColor = '#95E1A1'; // Very light green
    }
  } else if (clampedValue < 0) {
    // Player 1 (Red) winning - expand left, red color
    barWidth = Math.abs(clampedValue) >= 0.995 ? halfWidth : Math.round(Math.abs(clampedValue) * halfWidth);
    barDirection = 'left';
    
    if (clampedValue < -0.6) {
      barColor = '#DB2828'; // Strong red
    } else if (clampedValue < -0.2) {
      barColor = '#F2711C'; // Orange-red
    } else {
      barColor = '#FF9E80'; // Light orange
    }
  } else {
    // Equal position
    barWidth = 0;
    barDirection = 'center';
    barColor = '#cccccc';
  }
  
  // Create centered bar
  let barHTML = '<div style="position: relative; width: ' + width + 'px; height: 24px; border: 2px solid #333; border-radius: 4px; margin: 8px auto; background: #f0f0f0;">';
  
  // Center line marker
  barHTML += '<div style="position: absolute; left: 50%; top: 0; width: 2px; height: 100%; background: #666; transform: translateX(-1px);"></div>';
  
  // Colored bar expanding from center
  if (barDirection === 'right') {
    barHTML += '<div style="position: absolute; left: 50%; top: 0; width: ' + barWidth + 'px; height: 100%; background: ' + barColor + '; transition: width 0.3s ease;"></div>';
  } else if (barDirection === 'left') {
    barHTML += '<div style="position: absolute; right: 50%; top: 0; width: ' + barWidth + 'px; height: 100%; background: ' + barColor + '; transition: width 0.3s ease;"></div>';
  }
  
  barHTML += '</div>';
  
  // Add numeric value centered below
  let evalText = (value >= 0 ? '+' : '') + value.toFixed(2);
  let advantage = '';
  if (Math.abs(value) < 0.1) {
    advantage = 'Equal position';
  } else if (value > 0) {
    advantage = 'Green (Player 0) advantage';
  } else {
    advantage = 'Red (Player 1) advantage';
  }
  
  barHTML += '<div style="text-align: center; font-size: 13px; margin-top: 4px;">';
  barHTML += '<span style="font-weight: bold; font-size: 16px;">' + evalText + '</span>';
  barHTML += ' <span style="color: #666; margin-left: 8px;">(' + advantage + ')</span>';
  barHTML += '</div>';
  
  return barHTML;
}

// Alpine.js data function for evaluation bar
function evalBarData() {
  return {
    value: 0.0,
    calculating: false,
    collapsed: false,
    showHistory: true,
    showMoves: false,
    calcMovesLoading: false,
    calcMovesDepth: null, // null = use current AI depth; else override for calc options
    topMoves: [],
    history: [], // Array of {move: number, eval: number}
    maxHistoryLength: 20,
    containerWidth: 400,

    init() {
      const update = () => this.updateWidth();
      this.updateWidth();
      window.addEventListener('resize', update);
      
      // Enhanced initialization
      this.isInitialized = true;
      this.lastUpdateTime = Date.now();
    },

    updateWidth() {
      const box = this.$refs && this.$refs.evalBox ? this.$refs.evalBox : document.querySelector('.eval-bar-box');
      if (box && box.clientWidth) {
        this.containerWidth = Math.max(200, Math.min(400, box.clientWidth));
      }
    },
    
    get barWidth() {
      const halfWidth = this.containerWidth / 2;
      const absValue = Math.abs(this.value);
      return absValue >= 0.995 ? halfWidth : Math.round(absValue * halfWidth);
    },
    
    get barColor() {
      const v = this.value;
      if (v > 0) {
        // Player 0 (Green) winning
        if (v > 0.6) return '#21BA45'; // Strong green
        if (v > 0.2) return '#6DD47E'; // Light green
        return '#95E1A1'; // Very light green
      } else {
        // Player 1 (Red) winning
        if (v < -0.6) return '#DB2828'; // Strong red
        if (v < -0.2) return '#F2711C'; // Orange-red
        return '#FF9E80'; // Light orange
      }
    },
    
    get evalText() {
      return (this.value >= 0 ? '+' : '') + this.value.toFixed(2);
    },
    
    get advantage() {
      if (Math.abs(this.value) < 0.1) return 'Equal position';
      if (this.value > 0) return 'Green (Player 0) advantage';
      return 'Red (Player 1) advantage';
    },
    
    get historyPoints() {
      if (this.history.length === 0) return '';
      
      const width = 380;
      const height = 100;
      const padding = 10;
      
      const maxMove = Math.max(...this.history.map(h => h.move), 1);
      const points = this.history.map((h, i) => {
        const x = padding + (h.move / maxMove) * (width - 2 * padding);
        const y = padding + ((1 - h.eval) / 2) * (height - 2 * padding);
        return `${x},${y}`;
      }).join(' ');
      
      return points;
    },
    
    get historyLastPoint() {
      if (this.history.length === 0) return { x: 0, y: 60 };
      
      const width = 380;
      const height = 100;
      const padding = 10;
      
      const lastItem = this.history[this.history.length - 1];
      const maxMove = Math.max(...this.history.map(h => h.move), 1);
      
      const x = padding + (lastItem.move / maxMove) * (width - 2 * padding);
      const y = padding + ((1 - lastItem.eval) / 2) * (height - 2 * padding);
      
      return { x, y };
    },
    
    toggleCollapse() {
      this.collapsed = !this.collapsed;
    },
    
    async toggleHistory() {
      this.showHistory = !this.showHistory;
      if (this.showHistory && this.history.length === 0) {
        await this.fetchEvaluation();
      }
    },

    async toggleMoves() {
      this.showMoves = !this.showMoves;
    },
    
    updateValue(newValue) {
      this.value = newValue;
    },
    
    addToHistory(moveNumber, evalValue) {
      this.history.push({ move: moveNumber, eval: evalValue });
      if (this.history.length > this.maxHistoryLength) {
        this.history.shift(); // Remove oldest
      }
    },
    
    clearHistory() {
      this.history = [];
    },
    
    async recalculate() {
      if (game.py === null) {
        console.log('Game not initialized yet');
        return;
      }
      
      this.calculating = true;
      try {
        console.log('🔄 Calculating evaluation...');
        await game.py.calculate_eval_for_current_position();
        await this.fetchEvaluation();
        console.log('✅ Evaluation updated!');
      } catch (e) {
        console.error('Error calculating evaluation:', e);
      } finally {
        this.calculating = false;
      }
    },
    
    async fetchEvaluation() {
      let evalValue = 0.0;
      
      if (game.py != null) {
  try {
    const evalValues = game.py.get_current_eval().toJs({create_proxies: false});
          if (evalValues && evalValues.length >= 1) {
            evalValue = evalValues[0]; // Player 0 perspective
          }
        } catch (e) {
          console.log('Could not get evaluation, using 0.0:', e);
        }
      }
      
      this.value = evalValue;
      
      // Add to history (estimate move number from history length)
      if (evalValue !== 0.0) {
        this.addToHistory(this.history.length, evalValue);
      }
    },

    async fetchTopMoves() {
      if (game.py === null) return;
      try {
        const data = game.py.list_current_moves(10).toJs({create_proxies: false});
        this.topMoves = Array.isArray(data) ? data : [];
  } catch (e) {
        console.log('Could not get top moves:', e);
        this.topMoves = [];
      }
    },

    async fetchTopMovesWithAdv() {
      if (game.py === null) return;
      try {
        this.calcMovesLoading = true;
        let data = await game.py.list_current_moves_with_adv(6, this.calcMovesDepth);
        data = data.toJs({create_proxies: false});
        this.topMoves = Array.isArray(data) ? data : [];
      } catch (e) {
        console.log('Could not get top moves with advantage:', e);
      } finally {
        this.calcMovesLoading = false;
      }
    }
  };
}

// Keep refreshEvaluation for compatibility with existing code
async function refreshEvaluation() {
  // Get the Alpine component instance
  const evalContainer = window.evalBar;
  if (!evalContainer || !evalContainer._x_dataStack) return;
  
  const alpineData = evalContainer._x_dataStack[0];
  if (alpineData && alpineData.fetchEvaluation) {
    await alpineData.fetchEvaluation();
    // Always keep probabilities fresh (cheap)
    if (alpineData.fetchTopMoves) {
      await alpineData.fetchTopMoves();
    }
  }
}

// Helper exposed to hover to pause ghost during calc options
function isCalcOptionsBusy() {
  const evalContainer = window.evalBar;
  if (!evalContainer || !evalContainer._x_dataStack) return false;
  const alpineData = evalContainer._x_dataStack[0];
  return !!(alpineData && alpineData.calcMovesLoading);
}



/* =================== */
/* ===== ACTIONS ===== */
/* =================== */

/**
 * Handles cell click events
 * @param {number|null} clicked_y - Y coordinate of clicked cell
 * @param {number|null} clicked_x - X coordinate of clicked cell
 */
async function cellClick(clicked_y = null, clicked_x = null) {
  // Clear any hover preview before processing clicks to avoid re-render churn
  if (window.preview && window.preview.active) {
    window.preview = { active: false, y: -1, x: -1, type: null };
  }
  
  // Clear redo stack when new moves are made
  redoStack = [];
  
  if (move_sel.editMode > 0) {
    game.editCell(clicked_y, clicked_x, move_sel.editMode);
    refreshBoard();
    return;
  }
  
  move_sel.click(clicked_y === null ? -1 : clicked_y, clicked_x === null ? -1 : clicked_x);
  const move = move_sel.getMove();

    refreshBoard();
    refreshButtons();
  changeMoveText(move_sel.getPartialDescription(), move_sel.stage === 1 ? 'add' : 'edit');

    if (move >= 0) {
      game.move(move, true);
      move_sel.reset();
    move_sel._select_relevant_cells(); // Update selectable cells for next player
      refreshBoard();
      refreshButtons();

    // Only trigger AI if next player is not human (so Human vs Human works)
    try {
      if (!game.is_human_player(game.nextPlayer)) {
      ai_play_if_needed();
    }
      // Always refresh evaluation after any move
      if (typeof refreshEvaluation === 'function') {
        await refreshEvaluation();
      }
    } catch (error) {
      console.error('Error in cellClick:', error);
      // Fallback to original behavior if helper missing
      ai_play_if_needed();
      // Still refresh evaluation even if AI fails
      if (typeof refreshEvaluation === 'function') {
        await refreshEvaluation();
      }
    }
  }
}



function edit() {
  move_sel.edit();
  refreshBoard();
  refreshButtons();
  refreshPlayersText();
}

function setEditMode(mode) {
  // Set edit mode directly instead of cycling
  move_sel._select_none();
  move_sel.editMode = mode;
  if (mode === 0) {
    game.editCell(-1, -1, 0);
    move_sel._select_relevant_cells();
  }
  refreshBoard();
  refreshButtons();
  refreshPlayersText();
}

var game = new Santorini();
var move_sel = new MoveSelector();

// Hover preview handlers
window.preview = { active: false, y: -1, x: -1, type: null };
function cellHoverEnter(y, x) {
  if (setupMode) return; // no preview during guided setup
  if (move_sel.editMode > 0) {
    // During edit workers/levels, preview building next level
    window.preview = { active: true, y, x, type: 'build' };
  refreshBoard();
    return;
  }
  if (move_sel.stage === 1) {
    // Selecting destination square -> preview move
    window.preview = { active: true, y, x, type: 'move' };
    refreshBoard();
  } else if (move_sel.stage === 2) {
    // Selecting build square -> preview build
    window.preview = { active: true, y, x, type: 'build' };
    refreshBoard();
  }
}
function cellHoverLeave() {
  if (!window.preview.active) return;
  window.preview = { active: false, y: -1, x: -1, type: null };
  refreshBoard();
}

// Separate, no-reflow ghost overlay for normal play: we add/remove a child overlay node directly
function ghostEnter(y, x) {
  if (setupMode) return;
  if (typeof isCalcOptionsBusy === 'function' && isCalcOptionsBusy()) return;
  // Stage 1: show move ghost; Stage 2: show build ghost
  let type = null;
  if (move_sel.stage === 1) type = 'move';
  else if (move_sel.stage === 2) type = 'build';
  if (!type) return;

  const cell = document.getElementById('cell_' + y + '_' + x);
  if (!cell) return;
  // Avoid re-drawing full board; append a positioned overlay
  const imageDiv = cell.querySelector('.ui.middle.aligned.tiny.image');
  if (!imageDiv) return;
  // Remove previous overlay on this cell if any
  ghostLeave(y, x);

  const level = game.py ? game.py._read_level(y, x) : 0;
  let overlaySvg = '';
  if (type === 'move') {
    const movingWorkerId = (move_sel.workerID + 1) * (game.nextPlayer == 0 ? 1 : -1);
    overlaySvg = generateSvg(level, movingWorkerId);
  } else {
    const nextLevel = Math.min(4, level + 1);
    overlaySvg = generateSvg(nextLevel, 0);
  }
  const ghost = document.createElement('div');
  ghost.className = 'ghost-overlay';
  ghost.style.position = 'absolute';
  ghost.style.left = '0';
  ghost.style.top = '0';
  ghost.style.right = '0';
  ghost.style.bottom = '0';
  ghost.style.opacity = '0.45';
  ghost.style.pointerEvents = 'none';
  ghost.innerHTML = overlaySvg;
  imageDiv.appendChild(ghost);
}

function ghostLeave(y, x) {
  const cell = document.getElementById('cell_' + y + '_' + x);
  if (!cell) return;
  const imageDiv = cell.querySelector('.ui.middle.aligned.tiny.image');
  if (!imageDiv) return;
  const ghost = imageDiv.querySelector('.ghost-overlay');
  if (ghost) imageDiv.removeChild(ghost);
}

// Guided setup: place two green, then two red, then start game
var setupMode = false; // when true, clicks place workers instead of selecting moves
var setupTurn = 0;     // 0: G1, 1: G2, 2: R1, 3: R2

function updateSetupStatus() {
  const statusText = document.getElementById('statusText');
  if (!statusText) return;
  const steps = ['Place Green piece 1', 'Place Green piece 2', 'Place Red piece 1', 'Place Red piece 2'];
  statusText.innerText = setupTurn < steps.length ? steps[setupTurn] : 'Setup complete';
}

function start_guided_setup() {
  setupMode = true;
  setupTurn = 0;
  // Enter edit workers mode
  move_sel._select_none();
  move_sel.editMode = 2;
  // Inform backend to clear history so setup becomes baseline
  try { if (game.py && game.py.begin_setup) game.py.begin_setup(); } catch(e) {}

  // Clear all workers from the board to start fresh
  if (game.py != null) {
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        // Clear levels (buildings) back to 0
        let lvl = game.py._read_level(y, x);
        // editCell mode 1 cycles level: 0->1->2->3->4->0; loop until 0
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
  }
    refreshBoard();
    refreshButtons();
  updateSetupStatus();
}

async function finalize_guided_setup() {
  // Normalize worker IDs and exit edit mode
  game.editCell(-1, -1, 0);
  move_sel._select_relevant_cells();
  move_sel.editMode = 0;
  setupMode = false;
  // Tell backend to finalize setup and refresh state triplet
  try {
    if (game.py && game.py.end_setup) {
      const data_tuple = game.py.end_setup().toJs({create_proxies: false});
      [game.nextPlayer, game.gameEnded, game.validMoves] = data_tuple;
    }
  } catch(e) {}
  refreshBoard();
  refreshButtons();
  changeMoveText('', 'reset');
  
  // Refresh evaluation after setup
  if (typeof refreshEvaluation === 'function') {
    await refreshEvaluation();
  }
}

function place_worker_for_setup(y, x) {
  if (game.py === null) return;
  const current = game.py._read_worker(y, x);
  if (current !== 0) {
    // Only allow placing on empty cells during setup
    return;
  }
  const placingGreen = (setupTurn === 0 || setupTurn === 1);
  // editCell mode 2 cycles: 0 -> +1 -> -1 -> 0 ...
  if (placingGreen) {
    game.editCell(y, x, 2); // 0 -> +1
  } else {
    game.editCell(y, x, 2); // 0 -> +1
    game.editCell(y, x, 2); // +1 -> -1
  }
  setupTurn++;
  refreshBoard();
  updateSetupStatus();
  if (setupTurn >= 4) {
    finalize_guided_setup();
  }
}

// Override cellClick behavior during setup
const original_cellClick = cellClick;
cellClick = function(clicked_y = null, clicked_x = null) {
  if (setupMode) {
    if (clicked_y != null && clicked_x != null) {
      place_worker_for_setup(clicked_y, clicked_x);
    }
    return;
  }
  return original_cellClick(clicked_y, clicked_x);
}
