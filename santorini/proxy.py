from MCTS import MCTS
from SantoriniGame import SantoriniGame as Game
from SantoriniDisplay import move_to_str
import numpy as np

g, board, mcts, player = None, None, None, 0
history = [] # Previous states (new to old, not current). Each is an array with player and board and action
future_history = [] # States that were undone (oldest first) for redo support
current_eval = [0.0, 0.0] # Current evaluation values for [player0, player1]
last_probs = None # Last computed policy vector for current position

class dotdict(dict):
    def __getattr__(self, name):
        return self[name]


def init_game(numMCTSSims):
        global g, board, mcts, player, history, future_history

        mcts_args = dotdict({
                'numMCTSSims'     : numMCTSSims,
		'fpu'             : 0.03,
		'cpuct'           : 2.75,
		'prob_fullMCTS'   : 1.,
		'forced_playouts' : False,
		'no_mem_optim'    : False,
	})

        g = Game()
        board = g.getInitBoard()
        mcts = MCTS(g, None, mcts_args)
        player = 0
        history = []
        future_history = []
        valids = g.getValidMoves(board, player)
        end = [0,0]

        return player, end, valids

def getNextState(action):
        global g, board, mcts, player, history, future_history
        future_history = []
        history.insert(0, [player, np.copy(board), action])
        board, player = g.getNextState(board, player, action)
        end = g.getGameEnded(board, player)
        valids = g.getValidMoves(board, player)

        return player, end, valids

def changeDifficulty(numMCTSSims):
    global g, board, mcts, player, history
    mcts.args.numMCTSSims = numMCTSSims
    print("Difficulty changed to", mcts.args.numMCTSSims)


def begin_setup():
	"""Clear move history so edits become the new start state."""
	global history, future_history
	history = []
	future_history = []

def end_setup():
	"""Finalize setup after edits and return new state."""
	return update_after_edit()


async def guessBestAction():
    global g, board, mcts, player, history, current_eval, last_probs
    probs, q, _ = await mcts.getActionProb(
        g.getCanonicalForm(board, player), force_full_search=True
    )
    g.board.copy_state(
        board, True
    )  # g.board was in canonical form, set it back to normal form
    best_action = max(range(len(probs)), key=lambda x: probs[x])

    # Store evaluation values (q is from current player's perspective)
    # Convert to Player 0's perspective
    if player == 0:
        current_eval = [float(q[0]), -float(q[0])]
    else:
        current_eval = [-float(q[0]), float(q[0])]
    last_probs = probs

    print(
        f"AI Evaluation: Player 0: {current_eval[0]:+.3f}, Player 1: {current_eval[1]:+.3f} (current player: {player})"
    )

    # Compute good moves
    print("List of best moves found by AI:")
    sorted_probs = sorted(
        [(action, p) for action, p in enumerate(probs)],
        key=lambda x: x[1],
        reverse=True,
    )
    for i, (action, p) in enumerate(sorted_probs):
        if p < sorted_probs[0][1] / 3.0 or i >= 3:
            break
        print(f"{int(100*p)}% [{action}] {move_to_str(action, player)}")

    return best_action


def get_current_eval():
    global current_eval
    return current_eval


async def calculate_eval_for_current_position():
    """Calculate evaluation for current position without making a move."""
    global g, board, mcts, player, current_eval, last_probs

    if g is None or mcts is None:
        print("Game not initialized yet")
        return [0.0, 0.0]

    # Get evaluation for current position
    canonical_board = g.getCanonicalForm(board, player)
    probs, q, _ = await mcts.getActionProb(canonical_board, force_full_search=True)
    g.board.copy_state(board, True)  # Restore board state

    # Store evaluation values (q is from current player's perspective)
    # Convert to Player 0's perspective
    if player == 0:
        current_eval = [float(q[0]), -float(q[0])]
    else:
        current_eval = [-float(q[0]), float(q[0])]
    last_probs = probs

    print(
        f"🔄 Eval recalculated: Player 0: {current_eval[0]:+.3f}, Player 1: {current_eval[1]:+.3f} (current player: {player})"
    )

    return current_eval


def list_current_moves(limit: int = 10):
    """Return top moves with probabilities using last computed policy (fast, no extra search)."""
    global g, board, mcts, player, last_probs
    if g is None or mcts is None or last_probs is None:
        return []
    indexed = [(a, float(p)) for a, p in enumerate(last_probs)]
    indexed.sort(key=lambda x: x[1], reverse=True)
    result = []
    for action, p in indexed:
        if p <= 0.0:
            continue
        result.append(
            {"action": int(action), "prob": p, "text": move_to_str(action, player)}
        )
        if len(result) >= limit:
            break
    return result


async def list_current_moves_with_adv(limit: int = 5, numMCTSSims: int | None = None):
    """Return top moves with probabilities and resulting evaluation (Player 0 perspective).
    Optionally use a temporary numMCTSSims for this calculation only.
    """
    global g, board, mcts, player, current_eval, last_probs
    if g is None or mcts is None:
        return []

    prev_sims = mcts.args.numMCTSSims
    try:
        if numMCTSSims is not None and numMCTSSims > 0:
            mcts.args.numMCTSSims = numMCTSSims

        # Ensure we have a fresh policy for current state
        canonical_board = g.getCanonicalForm(board, player)
        probs, q, _ = await mcts.getActionProb(canonical_board, force_full_search=True)
        g.board.copy_state(board, True)
        last_probs = probs

        indexed = [(a, float(p)) for a, p in enumerate(probs)]
        indexed.sort(key=lambda x: x[1], reverse=True)

        results = []
        checked = 0
        for action, p in indexed:
            if p <= 0.0:
                continue
            # Simulate the move on a copy, evaluate resulting position
            next_board, next_player = g.getNextState(board, player, action)
            next_canon = g.getCanonicalForm(next_board, next_player)
            _, q_after, _ = await mcts.getActionProb(next_canon, force_full_search=True)
            g.board.copy_state(board, True)

            # Convert to Player 0 perspective
            if next_player == 0:
                eval_after = float(q_after[0])
            else:
                eval_after = -float(q_after[0])
            # Current eval (Player 0 perspective)
            cur_eval = current_eval[0]
            results.append(
                {
                    "action": int(action),
                    "prob": float(p),
                    "text": move_to_str(action, player),
                    "eval": eval_after,
                    "delta": float(eval_after - cur_eval),
                }
            )
            checked += 1
            if checked >= limit:
                break
        return results
    finally:
        mcts.args.numMCTSSims = prev_sims


def _finalize_revert(removed_states):
    """Helper to apply a list of removed states and update bookkeeping."""
    global g, board, player, history, future_history

    if not removed_states:
        end = g.getGameEnded(board, player)
        valids = g.getValidMoves(board, player)
        return player, end, valids, []

    # The last element corresponds to the board state we are restoring
    target_state = removed_states[-1]
    player = int(target_state[0])
    board = target_state[1]

    # Drop the reverted states from the history and prepend them to the redo stack
    history = history[len(removed_states) :]
    future_history = removed_states[::-1] + future_history

    removed_actions = [int(state[2]) for state in removed_states]

    end = g.getGameEnded(board, player)
    valids = g.getValidMoves(board, player)
    return player, end, valids, removed_actions


def revert_last_move():
    """Undo only the most recent move, regardless of the player."""
    global history

    if len(history) == 0:
        return _finalize_revert([])

    removed_states = history[:1]
    return _finalize_revert(removed_states)


def _finalize_revert(removed_states):
        """Helper to apply a list of removed states and update bookkeeping."""
        global g, board, player, history, future_history

        if not removed_states:
                end = g.getGameEnded(board, player)
                valids = g.getValidMoves(board, player)
                return player, end, valids, []

        # The last element corresponds to the board state we are restoring
        target_state = removed_states[-1]
        player = int(target_state[0])
        board = target_state[1]

        # Drop the reverted states from the history and prepend them to the redo stack
        history = history[len(removed_states):]
        future_history = removed_states[::-1] + future_history

        removed_actions = [int(state[2]) for state in removed_states]

        end = g.getGameEnded(board, player)
        valids = g.getValidMoves(board, player)
        return player, end, valids, removed_actions


def revert_last_move():
        """Undo only the most recent move, regardless of the player."""
        global history

        if len(history) == 0:
                return _finalize_revert([])

        removed_states = history[:1]
        return _finalize_revert(removed_states)


def revert_to_previous_move(player_asking_revert):
        global g, board, mcts, player, history, future_history

        removed_states = []

        if len(history) > 0:
                if player_asking_revert is None:
                        removed_states = history[:1]
                else:
                        # Revert to the previous 0 before a 1, or first 0 from game
                        for index, state in enumerate(history):
                                if (state[0] == player_asking_revert) and (index+1 == len(history) or history[index+1][0] != player_asking_revert):
                                        removed_states = history[:index+1]
                                        break
                        if removed_states:
                                print(f'index={len(removed_states)-1} / {len(history)}');

        return _finalize_revert(removed_states)

def jump_to_move_index(move_index):
        """Jump to a specific move index in the history (0-based)"""
        global g, board, mcts, player, history, future_history
        if move_index < 0 or move_index >= len(history):
                print(f'Invalid move index: {move_index}, history length: {len(history)}')
                return None

        # Get the state at the specified index
        state = history[move_index]
        player, board = state[0], state[1]

        # Clear redo information when jumping arbitrarily in history
        future_history = []

        # Don't truncate history - just set the current state
        # This allows the modal to remain populated

                # Store removed states for redo support, oldest first
                future_history = removed_states[::-1] + future_history

def jump_to_move_index(move_index):
    """Jump to a specific move index in the history (0-based)"""
    global g, board, mcts, player, history, future_history
    if move_index < 0 or move_index >= len(history):
        print(f"Invalid move index: {move_index}, history length: {len(history)}")
        return None

    # Get the state at the specified index
    state = history[move_index]
    player, board = state[0], state[1]

    # Clear redo information when jumping arbitrarily in history
    future_history = []

    # Don't truncate history - just set the current state
    # This allows the modal to remain populated

    print(f"Jumped to move {move_index}: player={player}")

    end = g.getGameEnded(board, player)
    valids = g.getValidMoves(board, player)
    return player, end, valids


def redo_next_move():
    """Reapply the next available move from the redo history."""
    global g, board, mcts, player, history, future_history

    if len(future_history) == 0:
        end = g.getGameEnded(board, player)
        valids = g.getValidMoves(board, player)
        return player, end, valids

def jump_to_move_index(move_index):
        """Jump to a specific move index in the history (0-based)"""
        global g, board, mcts, player, history, future_history
        if move_index < 0 or move_index >= len(history):
                print(f'Invalid move index: {move_index}, history length: {len(history)}')
                return None

        # Get the state at the specified index
        state = history[move_index]
        player, board = state[0], state[1]

        # Clear redo information when jumping arbitrarily in history
        future_history = []

        # Don't truncate history - just set the current state
        # This allows the modal to remain populated

        print(f'Jumped to move {move_index}: player={player}')

        end = g.getGameEnded(board, player)
        valids = g.getValidMoves(board, player)
        return player, end, valids

def redo_next_move():
        """Reapply the next available move from the redo history."""
        global g, board, mcts, player, history, future_history

        if len(future_history) == 0:
                end = g.getGameEnded(board, player)
                valids = g.getValidMoves(board, player)
                return player, end, valids, None, 0

        next_state = future_history.pop(0)
        state_player = int(next_state[0])
        state_board = np.copy(next_state[1])
        action = int(next_state[2])

        # Restore to the state before the move
        player = state_player
        board = state_board

        # Record this state in the history again before applying the move
        history.insert(0, [player, np.copy(board), action])

        board, player = g.getNextState(board, player, action)
        end = g.getGameEnded(board, player)
        valids = g.getValidMoves(board, player)

        return player, end, valids, action, len(future_history)

def get_redo_actions():
        """Return the list of actions currently available for redo (oldest first)."""
        global future_history
        return [int(state[2]) for state in future_history]

def get_redo_count():
        """Get the number of available redo actions."""
        global future_history
        return len(future_history)

def get_last_action():
    global g, board, mcts, player, history

    if len(history) < 1:
        return None
    return history[0][2]


def get_history_length():
    """Get the current length of the history"""
    global history
    return len(history)


def get_history_snapshot():
    """Return a chronological snapshot of the recorded move history."""
    global history

    snapshot = []
    for state in reversed(history):
        entry_player = int(state[0])
        entry_action = state[2]

        action_value = int(entry_action) if entry_action is not None else None
        description = ""
        if action_value is not None:
            try:
                description = move_to_str(action_value, entry_player)
            except Exception:
                description = ""

        snapshot.append(
            {
                "player": entry_player,
                "action": action_value,
                "description": description,
            }
        )

    return snapshot


# -----------------------------------------------------------------------------


def _findWorker(worker):
    global g, board, mcts, player, history

    lookup_result = (g.board.workers == worker).nonzero()
    if len(lookup_result[0]) == 0:
        return [-1, -1]
    return [lookup_result[0][0].item(), lookup_result[1][0].item()]


def _read_worker(y, x):
    return g.board.workers[y][x].item()


def _read_level(y, x):
    return g.board.levels[y][x].item()


def editCell(clicked_y, clicked_x, editMode):
    if editMode == 1:
        g.board.levels[clicked_y, clicked_x] = (
            g.board.levels[clicked_y, clicked_x] + 1
        ) % 5
    elif editMode == 2:
        if g.board.workers[clicked_y, clicked_x] > 0:
            g.board.workers[clicked_y, clicked_x] = -1
        elif g.board.workers[clicked_y, clicked_x] < 0:
            g.board.workers[clicked_y, clicked_x] = 0
        else:
            g.board.workers[clicked_y, clicked_x] = 1
    elif editMode == 0:
        # Reassign worker ID
        counts = [0, 0]
        for xy in range(25):
            if g.board.workers.flat[xy] > 0:
                counts[0] += 1
                g.board.workers.flat[xy] = counts[0]
            elif g.board.workers.flat[xy] < 0:
                counts[1] += 1
                g.board.workers.flat[xy] = -counts[1]
        if counts[0] != 2 or counts[0] != 2:
            print("Invalid board", counts)
    else:
        print("Dont know what to do in editMode", editMode)


def update_after_edit():
    end = g.getGameEnded(board, player)
    valids = g.getValidMoves(board, player)
    return player, end, valids
