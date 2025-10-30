import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { MatchAction, MatchMoveRecord, SantoriniMoveAction } from '@/types/match';
import type { LobbyMatch } from '../useMatchLobby';
import { useOnlineSantorini, type UseOnlineSantoriniOptions } from '../useOnlineSantorini';
import { SantoriniEngine, type SantoriniSnapshot } from '@/lib/santoriniEngine';

const toastSpy = vi.fn();

vi.mock('@chakra-ui/react', async () => {
  const actual = await vi.importActual<typeof import('@chakra-ui/react')>('@chakra-ui/react');
  return {
    ...actual,
    useToast: () => toastSpy,
  };
});

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function cloneSnapshot(snapshot: SantoriniSnapshot): SantoriniSnapshot {
  return {
    version: snapshot.version,
    player: snapshot.player,
    board: snapshot.board.map((row) => row.map((cell) => [...cell])),
    history: Array.isArray(snapshot.history) ? [...snapshot.history] : [],
    future: Array.isArray(snapshot.future) ? [...snapshot.future] : [],
    gameEnded: [snapshot.gameEnded[0], snapshot.gameEnded[1]],
    validMoves: snapshot.validMoves.slice(),
  };
}

function HookHarness(props: UseOnlineSantoriniOptions) {
  useOnlineSantorini(props);
  return null;
}

async function waitForCondition(assertFn: () => void, timeout = 1000, interval = 10): Promise<void> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      assertFn();
      return;
    } catch (error) {
      if (Date.now() - start > timeout) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
}

describe('useOnlineSantorini completion detection', () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    toastSpy.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container.remove();
  });

  it('invokes onGameComplete once when a completed snapshot arrives', async () => {
    const initialSnapshot = cloneSnapshot(SantoriniEngine.createInitial().snapshot);

    const baseMatch: LobbyMatch = {
      id: 'match-1',
      creator_id: 'creator-1',
      opponent_id: 'opponent-1',
      visibility: 'public',
      rated: false,
      private_join_code: null,
      clock_initial_seconds: 0,
      clock_increment_seconds: 0,
      status: 'in_progress',
      winner_id: null,
      rematch_parent_id: null,
      created_at: new Date().toISOString(),
      initial_state: initialSnapshot,
      creator: null,
      opponent: null,
    };

    const winningSnapshot = cloneSnapshot(initialSnapshot);
    winningSnapshot.board = winningSnapshot.board.map((row) => row.map(() => [0, 0, 0]));
    winningSnapshot.board[2][2] = [1, 3, 0];
    winningSnapshot.board[0][0] = [2, 0, 0];
    winningSnapshot.board[0][1] = [-1, 0, 0];
    winningSnapshot.board[0][2] = [-2, 0, 0];
    winningSnapshot.player = 1;
    winningSnapshot.gameEnded = [1, -1];
    winningSnapshot.validMoves = winningSnapshot.validMoves.length
      ? winningSnapshot.validMoves.map(() => false)
      : Array(162).fill(false);

    const winningMove: MatchMoveRecord<MatchAction> = {
      id: 'move-1',
      match_id: baseMatch.id,
      move_index: 0,
      player_id: baseMatch.creator_id,
      action: {
        kind: 'santorini.move',
        move: 0,
        by: 'creator',
      } as SantoriniMoveAction,
      state_snapshot: winningSnapshot,
      eval_snapshot: null,
      created_at: new Date().toISOString(),
    };

    const submitMove = vi.fn();
    const completionHandler = vi.fn(async (winnerId: string | null) => {
      toastSpy({ title: 'Game completed', winnerId });
    });

    const initialProps: UseOnlineSantoriniOptions = {
      match: baseMatch,
      moves: [],
      role: 'creator',
      onSubmitMove: submitMove,
      onGameComplete: completionHandler,
    };

    await act(async () => {
      root.render(<HookHarness {...initialProps} />);
      await Promise.resolve();
    });

    const snapshotProps: UseOnlineSantoriniOptions = {
      ...initialProps,
      moves: [winningMove],
    };

    await act(async () => {
      root.render(<HookHarness {...snapshotProps} />);
      await Promise.resolve();
    });

    await waitForCondition(() => {
      expect(completionHandler).toHaveBeenCalledTimes(1);
    });
    expect(completionHandler).toHaveBeenCalledWith(baseMatch.creator_id);
    expect(toastSpy).toHaveBeenCalledTimes(1);

    const completedMatch: LobbyMatch = {
      ...baseMatch,
      status: 'completed',
      winner_id: baseMatch.creator_id,
    };

    const completedProps: UseOnlineSantoriniOptions = {
      ...snapshotProps,
      match: completedMatch,
    };

    await act(async () => {
      root.render(<HookHarness {...completedProps} />);
      await Promise.resolve();
    });

    expect(completionHandler).toHaveBeenCalledTimes(1);
    expect(toastSpy).toHaveBeenCalledTimes(1);
  });
});
