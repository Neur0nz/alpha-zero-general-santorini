import numpy as np
from SantoriniConstants import _decode_action

my_workers_color = ['', '', '']
other_workers_color = ['', '', '']
levels_char = ['◎', '▂', '▅', '█', 'X']
directions_char = ['↖', '↑', '↗', '←', 'Ø', '→', '↙', '↓', '↘']


def move_to_str(move, player):
    worker, _power, move_direction, build_direction = _decode_action(move)
    worker_color = my_workers_color[worker + 1] if player == 0 else other_workers_color[worker + 1]

    return (
        f'Move {worker_color}worker {worker + 1} to {directions_char[move_direction]} '
        f'and then build {directions_char[build_direction]}'
    )


def _print_players():
    print('Players: classic Santorini rules (no god powers).')


def _print_main(board):
    print('-' * 11)
    for y in range(5):
        for x in range(5):
            worker, level = board.workers[y, x], board.levels[y, x]
            worker_color = my_workers_color[worker] if worker >= 0 else other_workers_color[-worker]
            if worker != 0 or level > 0:
                print(f'|{worker_color}{levels_char[level]}', end='')
            else:
                print('| ', end='')
        print('|')
        print('-' * 11)


def print_board(board):
    print()
    _print_players()
    _print_main(board)
