from MCTS import MCTS
from SantoriniGame import SantoriniGame as Game
from SantoriniDisplay import move_to_str
import numpy as np

g, board, mcts, player = None, None, None, 0
history = []  # Previous states (new to old, not current). Each is an array with player and board and action
current_eval = [0.0, 0.0]  # Current evaluation values for [player0, player1]


class dotdict(dict):
        def __getattr__(self, name):
                return self[name]


def init_game(numMCTSSims):
        global g, board, mcts, player, history

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
        valids = g.getValidMoves(board, player)
        end = [0, 0]

        return player, end, valids


def getNextState(action):
        global g, board, mcts, player, history
        history.insert(0, [player, np.copy(board), action])
        board, player = g.getNextState(board, player, action)
        end = g.getGameEnded(board, player)
        valids = g.getValidMoves(board, player)

        return player, end, valids


def changeDifficulty(numMCTSSims):
        global g, board, mcts, player, history
        mcts.args.numMCTSSims = numMCTSSims
        print('Difficulty changed to', mcts.args.numMCTSSims)


async def guessBestAction():
        global g, board, mcts, player, history, current_eval
        probs, q, _ = await mcts.getActionProb(g.getCanonicalForm(board, player), force_full_search=True)
        g.board.copy_state(board, True)  # g.board was in canonical form, set it back to normal form
        best_action = max(range(len(probs)), key=lambda x: probs[x])

        if player == 0:
                current_eval = [float(q[0]), -float(q[0])]
        else:
                current_eval = [-float(q[0]), float(q[0])]

        print(f'AI Evaluation: Player 0: {current_eval[0]:+.3f}, Player 1: {current_eval[1]:+.3f} (current player: {player})')

        print('List of best moves found by AI:')
        sorted_probs = sorted([(action, p) for action, p in enumerate(probs)], key=lambda x: x[1], reverse=True)
        for i, (action, p) in enumerate(sorted_probs):
                if p < sorted_probs[0][1] / 3. or i >= 3:
                        break
                print(f'{int(100*p)}% [{action}] {move_to_str(action, player)}')

        return best_action


def get_current_eval():
        global current_eval
        return current_eval


async def calculate_eval_for_current_position():
        """Calculate evaluation for current position without making a move."""
        global g, board, mcts, player, current_eval

        if g is None or mcts is None:
                print('Game not initialized yet')
                return [0.0, 0.0]

        canonical_board = g.getCanonicalForm(board, player)
        probs, q, _ = await mcts.getActionProb(canonical_board, force_full_search=True)
        g.board.copy_state(board, True)

        if player == 0:
                current_eval = [float(q[0]), -float(q[0])]
        else:
                current_eval = [-float(q[0]), float(q[0])]

        print(f'🔄 Eval recalculated: Player 0: {current_eval[0]:+.3f}, Player 1: {current_eval[1]:+.3f} (current player: {player})')

        return current_eval


def revert_to_previous_move(player_asking_revert):
        global g, board, mcts, player, history
        if len(history) > 0:
                for index, state in enumerate(history):
                        if (state[0] == player_asking_revert) and (index + 1 == len(history) or history[index + 1][0] != player_asking_revert):
                                break
                print(f'index={index} / {len(history)}')

                player, board = state[0], state[1]
                history = history[index + 1:]

        end = g.getGameEnded(board, player)
        valids = g.getValidMoves(board, player)
        return player, end, valids


def get_last_action():
        global g, board, mcts, player, history

        if len(history) < 1:
                return None
        return history[0][2]


# -----------------------------------------------------------------------------


def _findWorker(worker):
        global g, board, mcts, player, history

        lookup_result = (g.board.workers == worker).nonzero()
        if len(lookup_result[0]) == 0:
                return [-1, -1]
        return [lookup_result[0][0].item(), lookup_result[1][0].item()]


def _read_power():
        return [0, 0]


def _read_power_data():
        return [64, 64]


def _read_worker(y, x):
        return g.board.workers[y][x].item()


def _read_level(y, x):
        return g.board.levels[y][x].item()


def editCell(clicked_y, clicked_x, editMode):
        if editMode == 1:
                g.board.levels[clicked_y, clicked_x] = (g.board.levels[clicked_y, clicked_x] + 1) % 5
        elif editMode == 2:
                if g.board.workers[clicked_y, clicked_x] > 0:
                        g.board.workers[clicked_y, clicked_x] = -1
                elif g.board.workers[clicked_y, clicked_x] < 0:
                        g.board.workers[clicked_y, clicked_x] = 0
                else:
                        g.board.workers[clicked_y, clicked_x] = 1
        elif editMode == 0:
                counts = [0, 0]
                for xy in range(25):
                        if g.board.workers.flat[xy] > 0:
                                counts[0] += 1
                                g.board.workers.flat[xy] = counts[0]
                        elif g.board.workers.flat[xy] < 0:
                                counts[1] += 1
                                g.board.workers.flat[xy] = -counts[1]
                if counts[0] != 2 or counts[1] != 2:
                        print('Invalid board', counts)
        else:
                print('Dont know what to do in editMode', editMode)


def update_after_edit():
        end = g.getGameEnded(board, player)
        valids = g.getValidMoves(board, player)
        return player, end, valids
