export type GameInitTuple = [number, [number, number], boolean[]];

export abstract class AbstractGame {
  protected pyodide: any;
  py: any;
  nextPlayer: number;
  previousPlayer: number | null;
  gameEnded: [number, number];
  gameMode: 'P0' | 'P1' | 'Human' | 'AI';
  numMCTSSims: number;
  validMoves: boolean[];

  constructor(pyodide: any = null) {
    this.pyodide = pyodide;
    this.py = null;
    this.nextPlayer = 0;
    this.previousPlayer = null;
    this.gameEnded = [0, 0];
    this.gameMode = 'P0';
    this.numMCTSSims = 25;
    this.validMoves = [];
  }

  setPyodide(pyodide: any) {
    this.pyodide = pyodide;
  }

  init_game() {
    if (!this.pyodide) {
      throw new Error('Pyodide not initialised');
    }
    this.nextPlayer = 0;
    this.previousPlayer = null;
    this.gameEnded = [0, 0];

    if (!this.validMoves || this.validMoves.length === 0) {
      this.validMoves = [];
    } else {
      this.validMoves.fill(false);
    }

    if (this.py === null) {
      this.py = this.pyodide.pyimport('proxy');
    }
    const dataTuple = this.py.init_game(this.numMCTSSims).toJs({ create_proxies: false }) as GameInitTuple;
    [this.nextPlayer, this.gameEnded, this.validMoves] = dataTuple;
    this.post_init_game();
  }

  move(action: number, isManualMove: boolean) {
    if (this.is_ended()) {
      return;
    }
    if (!this.validMoves[action]) {
      return;
    }

    this.pre_move(action, isManualMove);

    this.previousPlayer = this.nextPlayer;
    const dataTuple = this.py.getNextState(action).toJs({ create_proxies: false }) as GameInitTuple;
    [this.nextPlayer, this.gameEnded, this.validMoves] = dataTuple;
    this.post_move(action, isManualMove);
  }

  async ai_guess_and_move() {
    if (this.is_ended()) {
      return;
    }
    const bestAction = await this.py.guessBestAction();
    this.move(bestAction, false);
  }

  change_difficulty(numMCTSSims: number) {
    this.numMCTSSims = Number(numMCTSSims);
    if (this.py) {
      this.py.changeDifficulty(this.numMCTSSims);
    }
  }

  revert_to_previous_human_move() {
    let dataTuple;
    if (this.gameMode === 'Human') {
      dataTuple = this.py.revert_last_move().toJs({ create_proxies: false });
    } else {
      const player = this.who_is_human();
      dataTuple = this.py.revert_to_previous_move(player).toJs({ create_proxies: false });
    }
    const [nextPlayer, gameEnded, validMoves, removedActions = []] = dataTuple;
    this.nextPlayer = nextPlayer;
    this.gameEnded = gameEnded;
    this.validMoves = validMoves;
    this.previousPlayer = null;
    this.post_set_data();
    return removedActions as number[];
  }

  is_ended() {
    return this.gameEnded.some((x) => !!x);
  }

  is_human_player(player: number | 'next' | 'previous') {
    if (this.gameMode === 'AI') {
      return false;
    }
    if (this.gameMode === 'Human') {
      return true;
    }
    let playerIndex = player;
    if (player === 'next') {
      playerIndex = this.nextPlayer;
    } else if (player === 'previous') {
      playerIndex = this.previousPlayer ?? 0;
    }
    return playerIndex === (this.gameMode === 'P0' ? 0 : 1);
  }

  who_is_human() {
    return this.gameMode === 'P0' ? 0 : 1;
  }

  post_init_game() {}
  pre_move(action: number, isManualMove: boolean) {}
  post_move(action: number, isManualMove: boolean) {}
  post_set_data() {}
  has_changed_on_last_move(itemVector: [number, number]) {
    return false;
  }
}
