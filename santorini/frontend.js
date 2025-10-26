// Core frontend logic for the Santorini web client.
// Derived from the original shared game harness but stripped down for the
// single Santorini experience.

let onnxSession;

async function predict(canonicalBoard, valids) {
  const cb_js = Float32Array.from(canonicalBoard.toJs({ create_proxies: false }));
  const vs_js = Uint8Array.from(valids.toJs({ create_proxies: false }));
  const tensor_board = new ort.Tensor('float32', cb_js, sizeCB);
  const tensor_valid = new ort.Tensor('bool', vs_js, sizeV);
  const results = await globalThis.onnxSession.run({
    board: tensor_board,
    valid_actions: tensor_valid,
  });
  return { pi: Array.from(results.pi.data), v: Array.from(results.v.data) };
}

async function loadONNX(model) {
  globalThis.onnxSession = await ort.InferenceSession.create(defaultModelFileName);
  console.log('Loaded default ONNX');
}

let aiRunId = 0;

class AbstractGame {
  constructor() {
    if (this.constructor === AbstractGame) {
      throw new Error("Abstract classes can't be instantiated.");
    }

    this.py = null;
    this.nextPlayer = 0;
    this.previousPlayer = null;
    this.gameEnded = [0, 0];
    this.gameMode = 'P0';
    this.numMCTSSims = 25;
    this.validMoves = null;
  }

  init_game() {
    aiRunId++;

    this.nextPlayer = 0;
    this.previousPlayer = null;
    this.gameEnded = [0, 0];

    if (this.validMoves) {
      this.validMoves.fill(false);
    }

    if (this.py === null) {
      console.log('Importing Santorini proxy module');
      this.py = pyodide.pyimport('proxy');
    }
    const data_tuple = this.py.init_game(this.numMCTSSims).toJs({ create_proxies: false });
    [this.nextPlayer, this.gameEnded, this.validMoves] = data_tuple;

    this.post_init_game();
  }

  move(action, isManualMove) {
    if (this.is_ended()) {
      console.log('Cannot move, game already finished');
      return;
    }
    if (!this.validMoves[action]) {
      console.log('Invalid move', action);
      return;
    }

    if (typeof redoStack !== 'undefined' && isManualMove) {
      if (typeof isRedoInProgress === 'undefined' || !isRedoInProgress) {
        redoStack = [];
      }
    }

    this.pre_move(action, isManualMove);

    this.previousPlayer = this.nextPlayer;
    const data_tuple = this.py.getNextState(action).toJs({ create_proxies: false });
    [this.nextPlayer, this.gameEnded, this.validMoves] = data_tuple;

    this.post_move(action, isManualMove);
  }

  async ai_guess_and_move() {
    if (this.is_ended()) {
      console.log('Not guessing, game is finished');
      return;
    }

    const runId = aiRunId;
    await this.ready_to_guess();
    const best_action = await this.py.guessBestAction();
    if (runId !== aiRunId) return;
    this.move(best_action, false);
  }

  async ready_to_guess() {}

  revert_to_previous_human_move() {
    let data_tuple;

    if (this.gameMode === 'Human') {
      data_tuple = this.py.revert_last_move().toJs({ create_proxies: false });
    } else {
      const player = this.who_is_human();
      data_tuple = this.py.revert_to_previous_move(player).toJs({ create_proxies: false });
    }

    const [nextPlayer, gameEnded, validMoves, removedActions = []] = data_tuple;
    this.nextPlayer = nextPlayer;
    this.gameEnded = gameEnded;
    this.validMoves = validMoves;
    this.previousPlayer = null;
    this.post_set_data();
    return removedActions;
  }

  change_difficulty(numMCTSSims) {
    this.numMCTSSims = Number(numMCTSSims);
    this.py.changeDifficulty(this.numMCTSSims);
  }

  is_ended() {
    return this.gameEnded.some((x) => !!x);
  }

  is_human_player(player) {
    if (this.gameMode === 'AI') {
      return false;
    }
    if (this.gameMode === 'Human') {
      return true;
    }

    if (player === 'next') {
      player = this.nextPlayer;
    } else if (player === 'previous') {
      player = this.previousPlayer;
    }
    return player === (this.gameMode === 'P0' ? 0 : 1);
  }

  who_is_human() {
    return this.gameMode === 'P0' ? 0 : 1;
  }

  post_init_game() {}
  pre_move(action, isManualMove) {}
  post_move(action, isManualMove) {}
  post_set_data() {}
  has_changed_on_last_move(item_vector) {}
}

class AbstractDisplay {
  refreshBoard() {}
  refreshButtons(loading = false) {}
}

class AbstractMoveSelector {
  constructor() {
    this.stage = 0;
    this.resetAndStart();
  }

  resetAndStart() {
    this.reset();
    this.start();
  }

  reset() {}
  start() {}
  getMove() {}
  edit() {}
}

let ai_play_promise = Promise.resolve();

async function ai_play_one_move() {
  refreshButtons(true);
  const aiPlayer = game.nextPlayer;
  while (game.nextPlayer === aiPlayer && game.gameEnded.every((x) => !x)) {
    await game.ai_guess_and_move();
    refreshBoard();
  }
  refreshButtons(false);
}

async function ai_play_if_needed_async() {
  let did_ai_play = false;
  while (game.gameEnded.every((x) => !x) && !game.is_human_player('next')) {
    move_sel._select_none();
    refreshBoard();

    await ai_play_one_move();

    did_ai_play = true;
    refreshBoard();
    refreshButtons();
    changeMoveText(moveToString(game.lastMove, 'AI'), 'add');

    if (typeof refreshEvaluation === 'function') {
      await refreshEvaluation();
    }
  }

  if (did_ai_play) {
    move_sel.resetAndStart();
  }
  refreshBoard();
  refreshButtons();
}

function ai_play_if_needed(...args) {
  ai_play_promise = ai_play_if_needed_async.apply(this, args);
  return ai_play_promise;
}

async function changeGameMode(mode) {
  game.gameMode = mode;
  await ai_play_promise;
  move_sel.resetAndStart();
  if (!game.is_human_player(game.nextPlayer)) {
    await ai_play_if_needed();
  }
}

function reset() {
  game.init_game();
  move_sel.resetAndStart();

  refreshBoard();
  refreshPlayersText();
  refreshButtons();
  changeMoveText();

  const evalContainer = window.evalBar;
  if (evalContainer && evalContainer._x_dataStack) {
    const alpineData = evalContainer._x_dataStack[0];
    if (alpineData) {
      alpineData.clearHistory();
      alpineData.value = 0.0;
    }
  }

  if (typeof refreshEvaluation === 'function') {
    refreshEvaluation();
  }
}

async function cancel_and_undo() {
  if (move_sel.stage === 0) {
    const reverted = game.revert_to_previous_human_move();
  }

  if (typeof syncRedoStackFromPython === 'function') {
    syncRedoStackFromPython();
  }
  move_sel.resetAndStart();

  refreshBoard();
  refreshButtons();
  changeMoveText();

  if (typeof refreshEvaluation === 'function') {
    const evalContainer = window.evalBar;
    if (evalContainer && evalContainer._x_dataStack) {
      const alpineData = evalContainer._x_dataStack[0];
      if (alpineData && alpineData.recalculate) {
        await alpineData.recalculate();
      }
    } else {
      await refreshEvaluation();
    }
  }
}

function edit() {
  move_sel.edit();
  refreshBoard();
  refreshButtons();
  refreshPlayersText();
}

async function init_code() {
  pyodide = await loadPyodide({ fullStdLib: false });
  await pyodide.loadPackage('numpy');

  let list_of_files_string = '[';
  for (const f of list_of_files) {
    list_of_files_string += '[';
    list_of_files_string += "'" + f[0] + "'";
    list_of_files_string += ', ';
    list_of_files_string += "'" + f[1] + "'";
    list_of_files_string += '], ';
  }
  list_of_files_string += ']';

  await pyodide.runPythonAsync(`
    from pyodide.http import pyfetch
    for filename_in, filename_out in ${list_of_files_string}:
      response = await pyfetch(filename_in)
      with open(filename_out, "wb") as f:
        f.write(await response.bytes())
  `);
  loadONNX();
  console.log('Loaded python code, pyodide ready');
}

async function main(usePyodide = true) {
  refreshButtons(true);

  if (usePyodide) {
    await init_code();
  }
  game.init_game();
  move_sel.resetAndStart();

  refreshBoard();
  refreshPlayersText();
  refreshButtons();
  changeMoveText();

  if (typeof refreshEvaluation === 'function') {
    await refreshEvaluation();
  }
}

let pyodide = null;
