import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Avatar,
  AvatarBadge,
  Badge,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardBody,
  CardHeader,
  Center,
  CloseButton,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  Spinner,
  Stack,
  Text,
  Tooltip,
  useBoolean,
  useColorModeValue,
  useBreakpointValue,
  useClipboard,
  useDisclosure,
  useToast,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import type { SupabaseAuthState } from '@hooks/useSupabaseAuth';
import type { LobbyMatch, UndoRequestState, UseMatchLobbyReturn } from '@hooks/useMatchLobby';
import { useMatchLobbyContext } from '@hooks/matchLobbyContext';
import { useOnlineSantorini } from '@hooks/useOnlineSantorini';
import { SantoriniProvider } from '@hooks/useSantorini';
import { useLocalSantorini } from '@hooks/useLocalSantorini';
import { buildMatchJoinLink } from '@/utils/joinLinks';
import { scheduleAutoOpenCreate } from '@/utils/lobbyStorage';
import { useBrowserNotifications } from '@hooks/useBrowserNotifications';
import GameBoard from '@components/GameBoard';
import type { SantoriniMoveAction, MatchStatus, PlayerProfile } from '@/types/match';
import { useSurfaceTokens } from '@/theme/useSurfaceTokens';

const K_FACTOR = 32;
const NOTIFICATION_PROMPT_STORAGE_KEY = 'santorini:notificationsPrompted';

const formatNameWithRating = (profile: PlayerProfile | null | undefined, fallback: string): string => {
  if (profile?.display_name) {
    const rating = Number.isFinite(profile.rating) ? ` (${Math.round(profile.rating)})` : '';
    return `${profile.display_name}${rating}`;
  }
  return fallback;
};

const formatDelta = (value: number): string => (value >= 0 ? `+${value}` : `${value}`);

const computeEloDeltas = (playerRating: number, opponentRating: number) => {
  const expectedScore = 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
  const winDelta = Math.round(K_FACTOR * (1 - expectedScore));
  const lossDelta = Math.round(K_FACTOR * (0 - expectedScore));
  const drawDelta = Math.round(K_FACTOR * (0.5 - expectedScore));
  return { winDelta, lossDelta, drawDelta };
};

function LocalMatchPanel({ onExit }: { onExit: () => void }) {
  const { cardBg, cardBorder, mutedText } = useSurfaceTokens();
  return <LocalMatchContent onExit={onExit} cardBg={cardBg} cardBorder={cardBorder} mutedText={mutedText} />;
}

function LocalMatchContent({
  onExit,
  cardBg,
  cardBorder,
  mutedText,
}: {
  onExit: () => void;
  cardBg: string;
  cardBorder: string;
  mutedText: string;
}) {
  const {
    loading,
    initialize,
    board,
    selectable,
    cancelSelectable,
    onCellClick,
    onCellHover,
    onCellLeave,
    buttons,
    undo,
    redo,
    nextPlayer,
    controls,
  } = useLocalSantorini();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initialize();
        if (!cancelled) {
          await controls.setGameMode('Human');
          setInitialized(true);
        }
      } catch (error) {
        console.error('Failed to initialize local match engine', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [controls, initialize]);

  const currentPlayer = nextPlayer === 0 ? 'Blue (Player 1)' : 'Red (Player 2)';
  const turnHighlightColor = nextPlayer === 0 ? 'blue.400' : 'red.400';

  return (
    <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder} w="100%">
      <CardHeader>
        <Flex justify="space-between" align={{ base: 'flex-start', md: 'center' }} direction={{ base: 'column', md: 'row' }} gap={3}>
          <Stack spacing={1}>
            <Heading size="md">Local match</Heading>
            <Text fontSize="sm" color={mutedText}>
              Pass the device between players. {initialized ? `Current turn: ${currentPlayer}` : 'Preparing board...'}
            </Text>
          </Stack>
          <Button variant="outline" size="sm" onClick={onExit}>
            End local match
          </Button>
        </Flex>
      </CardHeader>
      <CardBody>
        <Stack spacing={6}>
          <Box display="flex" justifyContent="center">
            {loading ? (
              <Center py={8} w="100%">
                <Spinner />
              </Center>
            ) : (
              <GameBoard
                board={board}
                selectable={selectable}
                cancelSelectable={cancelSelectable}
                onCellClick={onCellClick}
                onCellHover={onCellHover}
                onCellLeave={onCellLeave}
              buttons={buttons}
              undo={undo}
              redo={redo}
              showPrimaryControls={false}
              isTurnActive
              turnHighlightColor={turnHighlightColor}
            />
            )}
          </Box>
          <HStack spacing={3} justify="center" wrap="wrap">
            <Button colorScheme="teal" onClick={() => controls.reset()} isDisabled={loading}>
              Reset board
            </Button>
            <Button variant="outline" onClick={undo} isDisabled={loading || !buttons.canUndo}>
              Undo
            </Button>
            <Button variant="outline" onClick={redo} isDisabled={loading || !buttons.canRedo}>
              Redo
            </Button>
            <Badge colorScheme={nextPlayer === 0 ? 'blue' : 'red'}>{currentPlayer}</Badge>
          </HStack>
        </Stack>
      </CardBody>
    </Card>
  );
}

function ActiveMatchContent({
  match,
  role,
  moves,
  joinCode,
  onSubmitMove,
  onLeave,
  onGameComplete,
  undoState,
  onRequestUndo,
  onRespondUndo,
  onClearUndo,
  profileId,
}: {
  match: LobbyMatch | null;
  role: 'creator' | 'opponent' | null;
  moves: UseMatchLobbyReturn['moves'];
  joinCode: string | null;
  onSubmitMove: UseMatchLobbyReturn['submitMove'];
  onLeave: (matchId?: string | null) => Promise<void>;
  onGameComplete: (status: MatchStatus, payload?: { winner_id?: string | null }) => Promise<void>;
  undoState?: UndoRequestState;
  onRequestUndo: UseMatchLobbyReturn['requestUndo'];
  onRespondUndo: UseMatchLobbyReturn['respondUndo'];
  onClearUndo: () => void;
  profileId: string | null;
}) {
  const toast = useToast();
  const [leaveBusy, setLeaveBusy] = useBoolean();
  const lobbyMatch = match ?? null;
  const { cardBg, cardBorder, mutedText, strongText, accentHeading, panelBg } = useSurfaceTokens();
  const typedMoves = useMemo(
    () =>
      moves
        .filter((move) => (move.action as SantoriniMoveAction | undefined)?.kind === 'santorini.move')
        .map((move) => ({
          ...move,
          action: move.action as SantoriniMoveAction,
        })),
    [moves],
  );
  const handleGameComplete = useCallback(
    async (winnerId: string | null) => {
      if (!lobbyMatch) return;

      try {
        // Update match status to completed with winner
        await onGameComplete('completed', { winner_id: winnerId });

        // Show completion toast
        if (winnerId) {
          const winnerName =
            winnerId === lobbyMatch.creator_id
              ? lobbyMatch.creator?.display_name ?? 'Player 1'
              : lobbyMatch.opponent?.display_name ?? 'Player 2';
          toast({
            title: 'Game completed!',
            description: `${winnerName} wins!`,
            status: 'success',
            duration: 5000,
          });
        } else {
          toast({
            title: 'Game completed!',
            description: 'The game ended in a draw.',
            status: 'info',
            duration: 5000,
          });
        }
      } catch (error) {
        console.error('Failed to complete game:', error);
        toast({
          title: 'Error completing game',
          status: 'error',
          description: 'Failed to update match status.',
        });
      }
    },
    [lobbyMatch, onGameComplete, toast],
  );

  // Use the shared Santorini instance from provider
  const santorini = useOnlineSantorini({
    match: lobbyMatch,
    role: role,
    moves: moves,
    onSubmitMove: onSubmitMove,
    onGameComplete: handleGameComplete,
  });
  const creatorBaseName = lobbyMatch?.creator?.display_name ?? 'Player 1';
  const opponentBaseName = lobbyMatch?.opponent?.display_name ?? 'Player 2';
  const creatorDisplayName = formatNameWithRating(lobbyMatch?.creator, creatorBaseName);
  const opponentDisplayName = formatNameWithRating(lobbyMatch?.opponent, opponentBaseName);
  const creatorClock = santorini.formatClock(santorini.creatorClockMs);
  const opponentClock = santorini.formatClock(santorini.opponentClockMs);
  const creatorTurnActive = santorini.currentTurn === 'creator';
  const opponentTurnActive = santorini.currentTurn === 'opponent';
  const isMyTurn = role === 'creator' ? creatorTurnActive : role === 'opponent' ? opponentTurnActive : false;
  const turnGlowColor = role === 'creator' ? 'green.400' : role === 'opponent' ? 'red.400' : undefined;
  const normalizeRating = (value: number | null | undefined): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
  const creatorRatingValue = normalizeRating(lobbyMatch?.creator?.rating);
  const opponentRatingValue = normalizeRating(lobbyMatch?.opponent?.rating);
  const formatClockLabel = (
    name: string,
    rating: number | null,
    colorName: 'Green' | 'Red',
    isSelf: boolean,
  ) => {
    const colorEmoji = colorName === 'Green' ? '🟢' : '🔴';
    const segments: string[] = [`${colorEmoji} ${isSelf ? 'YOU' : name}`];
    if (rating !== null) {
      segments.push(`${rating} ELO`);
    }
    segments.push(colorName);
    return segments.join(' · ');
  };
  const creatorClockLabel = formatClockLabel(creatorBaseName, creatorRatingValue, 'Green', role === 'creator');
  const opponentClockLabel = formatClockLabel(opponentBaseName, opponentRatingValue, 'Red', role === 'opponent');
  const notificationPromptBg = useColorModeValue('white', 'gray.800');
  const notificationPromptBorder = useColorModeValue('teal.400', 'teal.300');
  const [requestingUndo, setRequestingUndo] = useBoolean(false);
  const [respondingUndo, setRespondingUndo] = useBoolean(false);
  const myProfile = role === 'creator' ? lobbyMatch?.creator : role === 'opponent' ? lobbyMatch?.opponent : null;
  const opponentProfile = role === 'creator' ? lobbyMatch?.opponent : role === 'opponent' ? lobbyMatch?.creator : null;
  const {
    permission: notificationPermission,
    isSupported: notificationsSupported,
    requestPermission,
    showNotification,
  } = useBrowserNotifications();
  const notificationToastIdRef = useRef<string | number | undefined>();
  const hasPromptedNotificationsRef = useRef(false);
  const lastOpponentIdRef = useRef<string | null>(lobbyMatch?.opponent_id ?? null);
  const opponentTrackerInitializedRef = useRef(false);
  const lastMoveCountRef = useRef<number>(moves.length);
  const movesHydratedRef = useRef(false);
  const isPageHidden = useCallback(
    () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
    [],
  );
  const { isOpen: isResignOpen, onOpen: onResignOpen, onClose: onResignClose } = useDisclosure();
  const resignCancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    opponentTrackerInitializedRef.current = false;
    lastOpponentIdRef.current = lobbyMatch?.opponent_id ?? null;
  }, [lobbyMatch?.id, lobbyMatch?.opponent_id]);

  useEffect(() => {
    movesHydratedRef.current = false;
    lastMoveCountRef.current = moves.length;
  }, [lobbyMatch?.id]);
  const playerRating = myProfile?.rating;
  const opponentRating = opponentProfile?.rating;
  const ratingProjection = useMemo(() => {
    if (!lobbyMatch?.rated || !role || typedMoves.length > 0) {
      return null;
    }
    if (!Number.isFinite(playerRating) || !Number.isFinite(opponentRating)) {
      return null;
    }
    const { winDelta, lossDelta, drawDelta } = computeEloDeltas(playerRating as number, opponentRating as number);
    return {
      winDelta,
      lossDelta,
      drawDelta,
      playerRating: Math.round(playerRating as number),
      opponentRating: Math.round(opponentRating as number),
    };
  }, [lobbyMatch?.rated, role, typedMoves.length, playerRating, opponentRating]);
  const creatorSideLabel = role === 'creator' ? 'You · Green pieces' : 'Green pieces';
  const opponentSideLabel = role === 'opponent' ? 'You · Red pieces' : 'Red pieces';

  const undoRequestedByMe = undoState && undoState.requestedBy === role;
  const undoPending = undoState?.status === 'pending';
  const undoMoveNumber = undoState ? undoState.moveIndex + 1 : null;
  const seenUndoToastRef = useRef<string | null>(null);
  const canRequestUndo = Boolean(
    match?.status === 'in_progress' &&
      role &&
      moves.length > 0 &&
      (!undoState || undoState.status === 'rejected' || undoState.status === 'applied')
  );
  const undoDisabledOverride = !canRequestUndo || requestingUndo || undoPending;

  useEffect(() => {
    if (!notificationsSupported) {
      return;
    }
    if (notificationPermission === 'default') {
      if (hasPromptedNotificationsRef.current) {
        return;
      }
      const alreadyPrompted = (() => {
        try {
          if (typeof window === 'undefined') {
            return false;
          }
          return window.localStorage.getItem(NOTIFICATION_PROMPT_STORAGE_KEY) === 'true';
        } catch (error) {
          console.warn('Unable to read notification prompt state', error);
          return false;
        }
      })();
      if (alreadyPrompted) {
        hasPromptedNotificationsRef.current = true;
        return;
      }
      hasPromptedNotificationsRef.current = true;
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(NOTIFICATION_PROMPT_STORAGE_KEY, 'true');
        } catch (error) {
          console.warn('Unable to persist notification prompt state', error);
        }
      }
      notificationToastIdRef.current = toast({
        duration: 10000,
        position: 'top',
        render: ({ onClose }) => (
          <Box
            bg={notificationPromptBg}
            borderRadius="lg"
            borderWidth="1px"
            borderColor={notificationPromptBorder}
            boxShadow="lg"
            px={4}
            py={3}
          >
            <Stack spacing={3}>
              <Heading size="sm">Enable game alerts</Heading>
              <Text fontSize="sm">
                Allow browser notifications so you know when opponents join or make a move while this tab is hidden.
              </Text>
              <HStack spacing={3} justify="flex-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onClose();
                  }}
                >
                  Not now
                </Button>
                <Button
                  size="sm"
                  colorScheme="teal"
                  onClick={async () => {
                    const result = await requestPermission();
                    if (result !== 'default') {
                      onClose();
                    }
                  }}
                >
                  Enable
                </Button>
              </HStack>
            </Stack>
          </Box>
        ),
      });
      return;
    }
    if (notificationToastIdRef.current) {
      toast.close(notificationToastIdRef.current);
      notificationToastIdRef.current = undefined;
    }
  }, [
    notificationsSupported,
    notificationPermission,
    toast,
    notificationPromptBg,
    notificationPromptBorder,
    requestPermission,
  ]);

  useEffect(() => {
    const opponentId = lobbyMatch?.opponent_id ?? null;
    if (!opponentTrackerInitializedRef.current) {
      opponentTrackerInitializedRef.current = true;
      lastOpponentIdRef.current = opponentId;
      return;
    }
    if (!lobbyMatch || !role) {
      lastOpponentIdRef.current = opponentId;
      return;
    }
    if (opponentId && opponentId !== lastOpponentIdRef.current) {
      const isCreator = lobbyMatch.creator_id === profileId;
      if (isCreator) {
        const opponentName = lobbyMatch.opponent?.display_name ?? 'Opponent';
        if (notificationsSupported && notificationPermission === 'granted' && isPageHidden()) {
          showNotification('Opponent joined your game', {
            body: `${opponentName} just joined. Your match is ready.`,
            id: `match-${lobbyMatch.id}-join`,
          });
        } else {
          toast({
            title: 'Opponent joined',
            description: `${opponentName} is ready to play.`,
            status: 'success',
            duration: 4000,
          });
        }
      }
    }
    lastOpponentIdRef.current = opponentId;
  }, [
    lobbyMatch?.opponent_id,
    lobbyMatch?.opponent?.display_name,
    lobbyMatch?.creator_id,
    lobbyMatch?.id,
    role,
    profileId,
    notificationsSupported,
    notificationPermission,
    isPageHidden,
    showNotification,
  ]);

  useEffect(() => {
    if (!lobbyMatch || !role) {
      lastMoveCountRef.current = moves.length;
      return;
    }
    if (!movesHydratedRef.current) {
      movesHydratedRef.current = true;
      lastMoveCountRef.current = moves.length;
      return;
    }
    if (moves.length <= lastMoveCountRef.current) {
      lastMoveCountRef.current = moves.length;
      return;
    }
    const latestMove = moves[moves.length - 1];
    lastMoveCountRef.current = moves.length;
    if (!latestMove) {
      return;
    }
    if (latestMove.player_id === profileId) {
      return;
    }
    if (lobbyMatch.status !== 'in_progress') {
      return;
    }
    const opponentName =
      latestMove.player_id === lobbyMatch.creator_id
        ? creatorDisplayName
        : latestMove.player_id === lobbyMatch.opponent_id
          ? opponentDisplayName
          : 'Opponent';
    if (notificationsSupported && notificationPermission === 'granted' && isPageHidden()) {
      showNotification('Your turn', {
        body: `${opponentName} made their move.`,
        id: `match-${lobbyMatch.id}-move`,
      });
    }
  }, [
    lobbyMatch,
    moves,
    role,
    profileId,
    creatorDisplayName,
    opponentDisplayName,
    notificationsSupported,
    notificationPermission,
    isPageHidden,
    showNotification,
    toast,
  ]);

  useEffect(() => {
    if (!undoState) {
      return undefined;
    }
    if (undoState.status === 'applied' || undoState.status === 'rejected') {
      const timer = setTimeout(() => {
        onClearUndo();
      }, 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [undoState, onClearUndo]);

  const handleRequestUndo = useCallback(async () => {
    setRequestingUndo.on();
    try {
      await onRequestUndo();
      toast({ title: 'Undo request sent', status: 'info', duration: 3000 });
    } catch (error) {
      toast({
        title: 'Unable to request undo',
        status: 'error',
        description: error instanceof Error ? error.message : 'Please try again in a moment.',
      });
    } finally {
      setRequestingUndo.off();
    }
  }, [onRequestUndo, setRequestingUndo, toast]);

  const handleRespondUndo = useCallback(async (accepted: boolean) => {
    setRespondingUndo.on();
    try {
      await onRespondUndo(accepted);
      toast({
        title: accepted ? 'Undo request accepted' : 'Undo request declined',
        status: accepted ? 'success' : 'info',
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: 'Unable to respond to undo request',
        status: 'error',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setRespondingUndo.off();
    }
  }, [onRespondUndo, setRespondingUndo, toast]);

  useEffect(() => {
    if (!undoState || undoState.status !== 'pending' || undoRequestedByMe) {
      return;
    }
    const toastKey = `${undoState.matchId}:${undoState.requestedAt}`;
    if (seenUndoToastRef.current === toastKey) {
      return;
    }
    seenUndoToastRef.current = toastKey;
    toast({
      duration: null,
      position: 'top-right',
      render: ({ onClose }) => (
        <Box
          bg={notificationPromptBg}
          borderRadius="lg"
          borderWidth="1px"
          borderColor={notificationPromptBorder}
          boxShadow="lg"
          px={4}
          py={3}
        >
          <Stack spacing={2}>
            <Heading size="sm">Undo requested</Heading>
            <Text fontSize="sm">
              {undoMoveNumber !== null
                ? `Your opponent wants to undo move #${undoMoveNumber}.`
                : 'Your opponent requested an undo.'}
            </Text>
            <ButtonGroup size="sm" justifyContent="flex-end">
              <Button
                variant="ghost"
                onClick={() => {
                  onClose();
                }}
              >
                Later
              </Button>
              <Button
                variant="outline"
                colorScheme="red"
                onClick={() => {
                  void handleRespondUndo(false).finally(() => {
                    onClose();
                  });
                }}
                isDisabled={respondingUndo}
                isLoading={respondingUndo}
              >
                Decline
              </Button>
              <Button
                colorScheme="teal"
                onClick={() => {
                  void handleRespondUndo(true).finally(() => {
                    onClose();
                  });
                }}
                isDisabled={respondingUndo}
                isLoading={respondingUndo}
              >
                Accept
              </Button>
            </ButtonGroup>
          </Stack>
        </Box>
      ),
    });
  }, [
    toast,
    undoMoveNumber,
    undoRequestedByMe,
    undoState,
    handleRespondUndo,
    respondingUndo,
    notificationPromptBg,
    notificationPromptBorder,
  ]);

  const undoBanner = useMemo(() => {
    if (!undoState || undoMoveNumber === null) {
      return null;
    }
    if (undoState.status === 'pending') {
      if (undoRequestedByMe) {
        return (
          <Alert status="info" variant="left-accent" borderRadius="md" mt={4}>
            <AlertIcon />
            <Stack spacing={1} flex="1">
              <AlertTitle>Undo request sent</AlertTitle>
              <AlertDescription>Waiting for your opponent to respond…</AlertDescription>
            </Stack>
          </Alert>
        );
      }
      return (
        <Alert status="warning" variant="left-accent" borderRadius="md" mt={4} alignItems="center">
          <AlertIcon />
          <Stack spacing={1} flex="1">
            <AlertTitle>Undo requested</AlertTitle>
            <AlertDescription>Opponent wants to undo move #{undoMoveNumber}.</AlertDescription>
          </Stack>
          <ButtonGroup size="sm" ml={{ base: 2, md: 4 }} display="flex">
            <Button
              colorScheme="teal"
              onClick={() => handleRespondUndo(true)}
              isLoading={respondingUndo}
              isDisabled={respondingUndo}
            >
              Allow
            </Button>
            <Button
              variant="outline"
              onClick={() => handleRespondUndo(false)}
              isLoading={respondingUndo}
              isDisabled={respondingUndo}
            >
              Decline
            </Button>
          </ButtonGroup>
        </Alert>
      );
    }
    if (undoState.status === 'accepted') {
      return (
        <Alert status="info" variant="left-accent" borderRadius="md" mt={4}>
          <AlertIcon />
          <Stack spacing={1} flex="1">
            <AlertTitle>Undo accepted</AlertTitle>
            <AlertDescription>Restoring position…</AlertDescription>
          </Stack>
        </Alert>
      );
    }
    if (undoState.status === 'applied') {
      return (
        <Alert status="success" variant="left-accent" borderRadius="md" mt={4} alignItems="center">
          <AlertIcon />
          <Stack spacing={1} flex="1">
            <AlertTitle>Move undone</AlertTitle>
            <AlertDescription>Move #{undoMoveNumber} has been undone.</AlertDescription>
          </Stack>
          <CloseButton position="relative" onClick={onClearUndo} />
        </Alert>
      );
    }
    if (undoState.status === 'rejected') {
      return (
        <Alert status="warning" variant="left-accent" borderRadius="md" mt={4} alignItems="center">
          <AlertIcon />
          <Stack spacing={1} flex="1">
            <AlertTitle>Undo declined</AlertTitle>
            <AlertDescription>Your opponent declined the undo request.</AlertDescription>
          </Stack>
          <CloseButton position="relative" onClick={onClearUndo} />
        </Alert>
      );
    }
    return null;
  }, [undoState, undoMoveNumber, undoRequestedByMe, respondingUndo, handleRespondUndo, onClearUndo]);

  const handleConfirmResign = async () => {
    setLeaveBusy.on();
    try {
      await onLeave(match?.id);
      await santorini.resetMatch();
    } finally {
      setLeaveBusy.off();
      onResignClose();
    }
  };

  const showJoinCode = lobbyMatch?.visibility === 'private' && joinCode;

  return (
    <Stack spacing={6}>
      <Stack spacing={{ base: 5, md: 6 }} align="center">
        <Stack
          direction="row"
          spacing={{ base: 3, md: 6 }}
          w="100%"
          maxW="960px"
          flexWrap="wrap"
          justify="center"
          align="stretch"
        >
          <PlayerClockCard
            label={creatorClockLabel}
            clock={creatorClock}
            active={creatorTurnActive}
            accentColor={accentHeading}
            profile={lobbyMatch?.creator}
            sideLabel={creatorSideLabel}
            alignment="flex-start"
          />
          <PlayerClockCard
            label={opponentClockLabel}
            clock={opponentClock}
            active={opponentTurnActive}
            accentColor={accentHeading}
            profile={lobbyMatch?.opponent}
            sideLabel={opponentSideLabel}
            alignment="flex-end"
          />
        </Stack>
        <Flex
          w="100%"
          maxW="960px"
          direction={{ base: 'column', md: 'row' }}
          justify="space-between"
          align={{ base: 'flex-start', md: 'center' }}
          gap={{ base: 3, md: 4 }}
        >
          <Wrap spacing={3} align="center">
            <WrapItem>
              <Heading size="sm" color={accentHeading}>
                {creatorDisplayName} vs {opponentDisplayName}
              </Heading>
            </WrapItem>
            {showJoinCode && (
              <WrapItem>
                <Badge colorScheme="orange" fontSize="0.8rem">
                  Code: {joinCode}
                </Badge>
              </WrapItem>
            )}
            <WrapItem>
              <Badge colorScheme={lobbyMatch?.rated ? 'purple' : 'gray'}>
                {lobbyMatch?.rated ? 'Rated' : 'Casual'}
              </Badge>
            </WrapItem>
            {lobbyMatch && lobbyMatch.clock_initial_seconds > 0 && (
              <WrapItem>
                <Badge colorScheme="blue">
                  {Math.round(lobbyMatch.clock_initial_seconds / 60)}+{lobbyMatch.clock_increment_seconds}
                </Badge>
              </WrapItem>
            )}
            <WrapItem>
              <Text fontSize="sm" color={mutedText}>
                {typedMoves.length} moves
              </Text>
            </WrapItem>
          </Wrap>
        </Flex>
      </Stack>

      {ratingProjection && (
        <Alert status="info" variant="left-accent" borderRadius="md">
          <AlertIcon />
          <Stack spacing={1} flex="1">
            <AlertTitle>Rated stakes</AlertTitle>
            <AlertDescription fontSize="sm">
              Win: {formatDelta(ratingProjection.winDelta)} ELO · Draw: {formatDelta(ratingProjection.drawDelta)} ELO · Loss:{' '}
              {formatDelta(ratingProjection.lossDelta)} ELO
            </AlertDescription>
            <AlertDescription fontSize="xs" color={mutedText}>
              You: {ratingProjection.playerRating} · Opponent: {ratingProjection.opponentRating}
            </AlertDescription>
          </Stack>
        </Alert>
      )}

      {/* Game Board - Centered and LARGE */}
      <Flex direction="column" align="center" w="100%">
        <Box
          bg={{ base: 'transparent', md: panelBg }}
          borderRadius={{ base: 'none', md: 'xl' }}
          borderWidth={{ base: 0, md: '1px' }}
          borderColor={{ base: 'transparent', md: cardBorder }}
          p={{ base: 0, md: 3 }}
          display="flex"
          justifyContent="center"
          w="100%"
          maxW="960px"
          mx={{ base: -3, md: 0 }}
          boxShadow={{ base: 'none', md: 'md' }}
          overflow="hidden"
        >
          <GameBoard
            board={santorini.board}
            selectable={santorini.selectable}
            cancelSelectable={santorini.cancelSelectable}
            onCellClick={santorini.onCellClick}
            onCellHover={santorini.onCellHover}
            onCellLeave={santorini.onCellLeave}
            buttons={santorini.buttons}
            undo={handleRequestUndo}
            redo={santorini.redo}
            undoLabel="Request undo"
            hideRedoButton
            undoDisabledOverride={undoDisabledOverride}
            undoIsLoading={requestingUndo}
            isTurnActive={isMyTurn}
            turnHighlightColor={turnGlowColor}
          />
        </Box>

        {undoBanner}

        <Box w="100%" maxW="960px" mt={4} px={{ base: 0, md: 3 }} display="flex" justifyContent="flex-end">
          <Tooltip label="Resign and lose the game (affects rating if rated)" hasArrow>
            <Button
              colorScheme="red"
              variant="outline"
              onClick={onResignOpen}
              isLoading={leaveBusy}
            >
              Resign
            </Button>
          </Tooltip>
        </Box>

      </Flex>

      <AlertDialog isOpen={isResignOpen} leastDestructiveRef={resignCancelRef} onClose={onResignClose}>
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Confirm resignation
            </AlertDialogHeader>
            <AlertDialogBody>
              Resigning ends the game immediately and awards the win to your opponent. Are you sure you want to resign?
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={resignCancelRef} onClick={onResignClose} variant="ghost">
                Continue playing
              </Button>
              <Button colorScheme="red" onClick={handleConfirmResign} ml={3} isLoading={leaveBusy}>
                Resign game
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Stack>
  );
}

function CompletedMatchSummary({
  match,
  profileId,
  onRequestRematch,
  rematchLoading,
  onPrepareAnalyze,
}: {
  match: LobbyMatch;
  profileId: string | null;
  onRequestRematch: () => void;
  rematchLoading: boolean;
  onPrepareAnalyze: () => void;
}) {
  const { cardBg, cardBorder, mutedText, accentHeading } = useSurfaceTokens();

  const winnerProfile = match.winner_id
    ? match.winner_id === match.creator_id
      ? match.creator
      : match.opponent
    : null;
  const isDraw = !match.winner_id;
  const isWinnerUser = winnerProfile?.id && winnerProfile.id === profileId;

  const title = (() => {
    if (isDraw) {
      return 'Game drawn';
    }
    if (isWinnerUser) {
      return 'You win!';
    }
    return `${winnerProfile?.display_name ?? 'Opponent'} wins`;
  })();

  const description = (() => {
    if (match.status === 'abandoned') {
      if (isWinnerUser) {
        return 'Opponent resigned or ran out of time.';
      }
      if (winnerProfile) {
        return 'You resigned or ran out of time.';
      }
      return 'The game ended early.';
    }
    if (isDraw) {
      return 'Neither player could secure a win.';
    }
    if (isWinnerUser) {
      return 'Your worker reached level 3.';
    }
    return `${winnerProfile?.display_name ?? 'Opponent'} reached level 3.`;
  })();

  return (
    <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder} shadow="md">
      <CardBody>
        <Stack spacing={4}>
          <Heading size="md" color={accentHeading}>
            {title}
          </Heading>
          <Text color={mutedText}>{description}</Text>
          <HStack spacing={2} flexWrap="wrap">
            {match.rated && <Badge colorScheme="purple">Rated match</Badge>}
            {match.clock_initial_seconds > 0 && (
              <Badge colorScheme="blue">
                {Math.round(match.clock_initial_seconds / 60)}+{match.clock_increment_seconds}
              </Badge>
            )}
          </HStack>
          <HStack spacing={3} flexWrap="wrap">
            <Button colorScheme="teal" onClick={onRequestRematch} isLoading={rematchLoading} isDisabled={rematchLoading}>
              Request rematch
            </Button>
            <Button variant="outline" onClick={onPrepareAnalyze}>
              Review in Analyze
            </Button>
          </HStack>
          <Text fontSize="xs" color={mutedText}>
            Rematch invitations from your opponent will appear above. Share the join code if needed.
          </Text>
        </Stack>
      </CardBody>
    </Card>
  );
}

interface PlayerClockCardProps {
  label: string;
  clock: string;
  active: boolean;
  accentColor: string;
  profile: PlayerProfile | null | undefined;
  sideLabel: string;
  alignment: 'flex-start' | 'flex-end';
}

function PlayerClockCard({
  label,
  clock,
  active,
  accentColor,
  profile,
  sideLabel,
  alignment,
}: PlayerClockCardProps) {
  const { cardBorder, mutedText, strongText } = useSurfaceTokens();
  const activeBg = useColorModeValue('teal.50', 'teal.900');
  const inactiveBg = useColorModeValue('white', 'whiteAlpha.100');
  const clockColor = active ? accentColor : strongText;
  const alignItems: 'flex-start' | 'flex-end' = alignment;
  const textAlign = alignment === 'flex-end' ? 'right' : 'left';
  const cardPadding = useBreakpointValue({ base: 3, md: 4 });
  const clockFontSize = useBreakpointValue({ base: '2xl', md: '3xl' });
  const labelFontSize = useBreakpointValue({ base: 'xs', md: 'sm' });
  const sideFontSize = useBreakpointValue({ base: '2xs', md: 'xs' });
  const avatarSize = useBreakpointValue<'sm' | 'md' | 'lg'>({ base: 'md', md: 'lg' });

  return (
    <Box
      flex="1 1 0"
      minW={{ base: '0', md: '220px' }}
      p={cardPadding ?? 3}
      borderRadius="xl"
      borderWidth="2px"
      borderColor={active ? accentColor : cardBorder}
      bg={active ? activeBg : inactiveBg}
      transition="all 0.3s ease"
      boxShadow={active ? `0 0 0 1px ${accentColor}` : 'none'}
    >
      <Stack spacing={3} align={alignItems}>
        <Avatar
          size={avatarSize ?? 'md'}
          name={profile?.display_name ?? label}
          src={profile?.avatar_url ?? undefined}
          alignSelf={alignItems}
        >
          {active ? <AvatarBadge boxSize="1.1em" bg={accentColor} borderColor="white" /> : null}
        </Avatar>
      <Stack spacing={1} align={alignItems} w="100%">
          <Text fontSize={labelFontSize ?? 'sm'} fontWeight="semibold" color={mutedText} textAlign={textAlign}>
            {label}
          </Text>
          <Heading
            fontSize={clockFontSize ?? '2xl'}
            color={clockColor}
            fontFamily="mono"
            letterSpacing="tight"
            textAlign={textAlign}
          >
            {clock}
          </Heading>
          <Text fontSize={sideFontSize ?? 'xs'} color={mutedText} textAlign={textAlign}>
            {sideLabel}
          </Text>
        </Stack>
      </Stack>
    </Box>
  );
}

function NoActiveGamePrompt({ onNavigateToLobby }: { onNavigateToLobby?: () => void }) {
  const { cardBg, cardBorder, mutedText } = useSurfaceTokens();
  return (
    <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder} w="100%">
      <CardBody>
        <Center py={20}>
          <Stack spacing={4} align="center" textAlign="center">
            <Heading size="md">No active game</Heading>
            <Text color={mutedText}>Visit the Lobby tab to find or create a match.</Text>
            {onNavigateToLobby && (
              <Button colorScheme="teal" variant="solid" onClick={onNavigateToLobby}>
                Open lobby
              </Button>
            )}
          </Stack>
        </Center>
      </CardBody>
    </Card>
  );
}

function CancelledMatchPrompt({
  onCreateNewMatch,
  onNavigateToLobby,
}: {
  onCreateNewMatch: () => void;
  onNavigateToLobby: () => void;
}) {
  const { cardBg, cardBorder, mutedText, accentHeading } = useSurfaceTokens();
  return (
    <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder} w="100%">
      <CardBody>
        <Center py={20}>
          <Stack spacing={5} align="center" textAlign="center" maxW="lg">
            <Stack spacing={2}>
              <Heading size="md" color={accentHeading}>
                Match cancelled
              </Heading>
              <Text color={mutedText}>
                You’re back in the lobby. Create a fresh game or browse other matches when you’re ready.
              </Text>
            </Stack>
            <ButtonGroup size="sm" variant="solid">
              <Button colorScheme="teal" onClick={onCreateNewMatch}>
                Create new match
              </Button>
              <Button variant="outline" onClick={onNavigateToLobby}>
                Open lobby
              </Button>
            </ButtonGroup>
          </Stack>
        </Center>
      </CardBody>
    </Card>
  );
}

function WaitingForOpponentState({ 
  match, 
  joinCode,
  canCancel = false,
  onCancel,
  isCancelling = false,
}: { 
  match: LobbyMatch; 
  joinCode: string | null;
  canCancel?: boolean;
  onCancel?: () => void;
  isCancelling?: boolean;
}) {
  const { cardBg, cardBorder, mutedText, accentHeading } = useSurfaceTokens();
  const gradientBg = useColorModeValue('linear(to-r, teal.50, blue.50)', 'linear(to-r, teal.900, blue.900)');
  const linkBackground = useColorModeValue('white', 'whiteAlpha.100');
  const joinKey = match.private_join_code ?? joinCode ?? match.id;
  const joinLink = joinKey ? buildMatchJoinLink(joinKey) : '';
  const { hasCopied: hasCopiedCode, onCopy: onCopyCode } = useClipboard(joinCode ?? '');
  const { hasCopied: hasCopiedLink, onCopy: onCopyLink } = useClipboard(joinLink);
  const hasJoinCode = Boolean(match.private_join_code ?? joinCode);
  const hasJoinLink = Boolean(joinLink);
  
  return (
    <Stack spacing={6}>
      <Card bg={cardBg} borderWidth="2px" borderColor="teal.400" boxShadow="lg">
        <CardBody py={8}>
          <Center>
            <Stack spacing={6} align="center" textAlign="center" maxW="lg">
              <Spinner 
                size="xl" 
                color="teal.500" 
                thickness="4px"
                speed="0.8s"
              />
              <Stack spacing={2}>
                <Heading size="lg" color={accentHeading}>
                  Waiting for opponent...
                </Heading>
                <Text fontSize="lg" color={mutedText}>
                  Your game is ready. We're waiting for an opponent to join.
                </Text>
              </Stack>
              
              {hasJoinCode && (
                <Card bgGradient={gradientBg} borderWidth="1px" borderColor={cardBorder} w="100%" maxW="md">
                  <CardBody>
                    <Stack spacing={3} align="center">
                      <Badge colorScheme="orange" fontSize="md" px={4} py={2} borderRadius="full">
                        Private Game
                      </Badge>
                      <Text fontSize="sm" color={mutedText}>
                        Share this code with your friend:
                      </Text>
                      <Heading 
                        size="2xl" 
                        fontFamily="mono" 
                        letterSpacing="wider"
                        color={accentHeading}
                      >
                        {joinCode}
                      </Heading>
                    </Stack>
                  </CardBody>
                </Card>
              )}
              
              {hasJoinLink && (
                <Stack spacing={2} align="center" w="100%" maxW="md">
                  <Text fontSize="sm" color={mutedText}>
                    Or send them this link:
                  </Text>
                  <Box
                    w="100%"
                    px={4}
                    py={2}
                    borderWidth="1px"
                    borderColor={cardBorder}
                    borderRadius="md"
                    fontFamily="mono"
                    fontSize="sm"
                    wordBreak="break-all"
                    bg={linkBackground}
                  >
                    {joinLink}
                  </Box>
                </Stack>
              )}
              
              <Wrap spacing={3} justify="center" color={mutedText} fontSize="sm">
                <WrapItem>
                  <Text>✓ Game settings configured</Text>
                </WrapItem>
                <WrapItem>
                  <Text>✓ Board initialized</Text>
                </WrapItem>
                <WrapItem>
                  <Text>✓ Ready to start</Text>
                </WrapItem>
              </Wrap>

              {(hasJoinCode || (canCancel && onCancel)) && (
                <ButtonGroup
                  size="sm"
                  variant="outline"
                  spacing={3}
                  alignSelf="center"
                  display="flex"
                >
                  {hasJoinCode && (
                    <Button
                      variant="outline"
                      colorScheme={hasCopiedCode ? 'teal' : 'gray'}
                      onClick={onCopyCode}
                    >
                      {hasCopiedCode ? 'Code copied' : 'Copy code'}
                    </Button>
                  )}
                  {hasJoinLink && (
                    <Button
                      variant="outline"
                      colorScheme={hasCopiedLink ? 'teal' : 'gray'}
                      onClick={onCopyLink}
                    >
                      {hasCopiedLink ? 'Link copied' : 'Copy invite link'}
                    </Button>
                  )}
                  {canCancel && onCancel && (
                    <Tooltip label="Removes this game so you can start a new one" hasArrow>
                      <Button
                        colorScheme="red"
                        variant="ghost"
                        onClick={onCancel}
                        isLoading={isCancelling}
                      >
                        Cancel match
                      </Button>
                    </Tooltip>
                  )}
                </ButtonGroup>
              )}
              {canCancel && onCancel && (
                <Text fontSize="xs" color={mutedText}>
                  Cancelling removes this lobby so you can post a fresh game.
                </Text>
              )}
              
              <Text fontSize="xs" color={mutedText} fontStyle="italic">
                {match.visibility === 'public' 
                  ? 'This game is visible in the public lobby' 
                  : 'Only players with the code can join'}
              </Text>
            </Stack>
          </Center>
        </CardBody>
      </Card>
    </Stack>
  );
}

function GamePlayWorkspace({ auth, onNavigateToLobby }: { auth: SupabaseAuthState; onNavigateToLobby: () => void }) {
  const lobby = useMatchLobbyContext();
  const workspaceToast = useToast();
  const rematchOffers = useMemo(
    () =>
      Object.values(lobby.rematchOffers ?? {}).filter((offer): offer is LobbyMatch => Boolean(offer)),
    [lobby.rematchOffers],
  );
  const [joiningRematchId, setJoiningRematchId] = useState<string | null>(null);
  const [cancellingActiveMatch, setCancellingActiveMatch] = useBoolean(false);
  const [requestingSummaryRematch, setRequestingSummaryRematch] = useBoolean(false);
  const [lastCancelledMatchId, setLastCancelledMatchId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.profile) {
      return;
    }
    const hasOnlineActivity = lobby.myMatches.some(
      (match) => match.status === 'in_progress' || match.status === 'waiting_for_opponent',
    );
    if (hasOnlineActivity && lobby.sessionMode !== 'online') {
      lobby.enableOnline();
    }
  }, [auth.profile, lobby.enableOnline, lobby.myMatches, lobby.sessionMode]);

  const handleAcceptRematch = useCallback(
    async (matchId: string) => {
      setJoiningRematchId(matchId);
      try {
        await lobby.acceptRematch(matchId);
        workspaceToast({ title: 'Joined rematch', status: 'success', duration: 3000 });
      } catch (error) {
        workspaceToast({
          title: 'Unable to join rematch',
          status: 'error',
          description: error instanceof Error ? error.message : 'Please try again.',
        });
      } finally {
        setJoiningRematchId((current) => (current === matchId ? null : current));
      }
    },
    [lobby, workspaceToast],
  );

  const handleDismissRematch = useCallback(
    (matchId: string) => {
      lobby.dismissRematch(matchId);
    },
    [lobby],
  );

  useEffect(() => {
    if (lobby.activeMatch) {
      setLastCancelledMatchId(null);
    }
  }, [lobby.activeMatch]);

  const handleCancelWaitingMatch = useCallback(async () => {
    const match = lobby.activeMatch;
    if (!match || match.status !== 'waiting_for_opponent') {
      return;
    }
    setCancellingActiveMatch.on();
    try {
      await lobby.leaveMatch(match.id);
      setLastCancelledMatchId(match.id);
      workspaceToast({
        title: 'Match cancelled',
        status: 'info',
        description: 'The lobby is clear. Start a new game whenever you like.',
      });
    } catch (error) {
      workspaceToast({
        title: 'Unable to cancel match',
        status: 'error',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setCancellingActiveMatch.off();
    }
  }, [lobby, setCancellingActiveMatch, workspaceToast]);

  const handleNavigateToLobby = useCallback(() => {
    setLastCancelledMatchId(null);
    onNavigateToLobby();
  }, [onNavigateToLobby]);

  const handleCreateNewMatchFromPlay = useCallback(() => {
    setLastCancelledMatchId(null);
    scheduleAutoOpenCreate();
    onNavigateToLobby();
  }, [onNavigateToLobby]);
  const sessionMode = lobby.sessionMode ?? 'online';
  const completedMatch =
    sessionMode === 'online' &&
    lobby.activeMatch &&
    (lobby.activeMatch.status === 'completed' || lobby.activeMatch.status === 'abandoned')
      ? lobby.activeMatch
      : null;
  const { cardBg, cardBorder } = useSurfaceTokens();
  const { activeMatchId, clearUndoRequest, undoRequests } = lobby;
  const activeUndoState = activeMatchId ? undoRequests[activeMatchId] : undefined;

  const handleClearUndoState = useCallback(() => {
    if (activeMatchId) {
      clearUndoRequest(activeMatchId);
    }
  }, [activeMatchId, clearUndoRequest]);

  // Auto-select first in-progress game if none is selected
  useEffect(() => {
    if (sessionMode === 'online' && !lobby.activeMatch && lobby.myMatches.length > 0) {
      const inProgressGames = lobby.myMatches.filter(m => m.status === 'in_progress');
      if (inProgressGames.length > 0) {
        console.log('Auto-selecting first in-progress game:', inProgressGames[0].id);
        lobby.setActiveMatch(inProgressGames[0].id);
      }
    }
  }, [sessionMode, lobby.activeMatch, lobby.myMatches, lobby.setActiveMatch]);

  // Check if we have an active online game or waiting
  const hasActiveMatch = sessionMode === 'online' && lobby.activeMatch;
  const isWaitingForOpponent = hasActiveMatch && lobby.activeMatch?.status === 'waiting_for_opponent';
  const isInProgress = hasActiveMatch && lobby.activeMatch?.status === 'in_progress';
  const canCancelWaitingMatch = Boolean(
    isWaitingForOpponent &&
    lobby.activeRole === 'creator' &&
    lobby.activeMatch &&
    !lobby.activeMatch.opponent_id
  );

  const handleRequestSummaryRematch = useCallback(async () => {
    setRequestingSummaryRematch.on();
    try {
      const rematch = await lobby.offerRematch();
      if (rematch) {
        workspaceToast({
          title: 'Rematch created',
          description: rematch.private_join_code
            ? `Share code ${rematch.private_join_code} if needed.`
            : 'Waiting for your opponent to join…',
          status: 'success',
          duration: 4000,
        });
      }
    } catch (error) {
      workspaceToast({
        title: 'Unable to create rematch',
        status: 'error',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setRequestingSummaryRematch.off();
    }
  }, [lobby, setRequestingSummaryRematch, workspaceToast]);

  const handlePrepareAnalyze = useCallback(() => {
    if (!lobby.activeMatch) {
      return;
    }
    try {
      localStorage.setItem('santorini:lastAnalyzedMatch', lobby.activeMatch.id);
    } catch (error) {
      console.warn('Unable to store last analyzed match', error);
    }
    workspaceToast({
      title: 'Ready for analysis',
      description: 'Open the Analyze tab to review this game.',
      status: 'info',
      duration: 4000,
    });
  }, [lobby.activeMatch, workspaceToast]);

  return (
    <Stack spacing={6} py={{ base: 6, md: 10 }}>
      {/* Persistent Mode Switcher - Always visible */}
      <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder}>
        <CardBody py={3}>
          <Flex justify="space-between" align="center" gap={4} flexWrap="wrap">
            <ButtonGroup size="sm" isAttached variant="outline">
              <Button
                colorScheme={sessionMode === 'online' ? 'teal' : undefined}
                variant={sessionMode === 'online' ? 'solid' : 'outline'}
                onClick={() => lobby.enableOnline()}
                isDisabled={!auth.profile}
              >
                Online
              </Button>
              <Button
                colorScheme={sessionMode === 'local' ? 'teal' : undefined}
                variant={sessionMode === 'local' ? 'solid' : 'outline'}
                onClick={() => lobby.startLocalMatch()}
              >
                Local
              </Button>
            </ButtonGroup>
            {!auth.profile && (
              <Text fontSize="xs" color="orange.500">
                Sign in to play online
              </Text>
            )}
          </Flex>
        </CardBody>
      </Card>

      {sessionMode === 'online' && rematchOffers.map((offer) => {
        const opponentName = offer.creator?.display_name ?? 'Opponent';
        const joinCode = offer.private_join_code;
        return (
          <Alert
            key={offer.id}
            status="info"
            variant="left-accent"
            borderRadius="md"
            alignItems="center"
          >
            <AlertIcon />
            <Flex direction={{ base: 'column', md: 'row' }} gap={{ base: 3, md: 4 }} flex="1" align={{ base: 'flex-start', md: 'center' }}>
              <Stack spacing={1} flex="1">
                <AlertTitle>Rematch available</AlertTitle>
                <AlertDescription>
                  {opponentName} created a rematch{joinCode ? ` • Join code ${joinCode}` : ''}.
                </AlertDescription>
              </Stack>
              <ButtonGroup size="sm" alignSelf={{ base: 'stretch', md: 'center' }}>
                <Button
                  colorScheme="teal"
                  onClick={() => handleAcceptRematch(offer.id)}
                  isLoading={joiningRematchId === offer.id}
                >
                  Join rematch
                </Button>
                <Button variant="outline" onClick={() => handleDismissRematch(offer.id)}>
                  Dismiss
                </Button>
              </ButtonGroup>
            </Flex>
          </Alert>
        );
      })}

      {sessionMode === 'online' && completedMatch && (
        <CompletedMatchSummary
          match={completedMatch}
          profileId={auth.profile?.id ?? null}
          onRequestRematch={handleRequestSummaryRematch}
          rematchLoading={requestingSummaryRematch}
          onPrepareAnalyze={handlePrepareAnalyze}
        />
      )}

      {/* Game Board - Local */}
      {sessionMode === 'local' && <LocalMatchPanel onExit={lobby.stopLocalMatch} />}

      {/* Waiting for Opponent State */}
      {sessionMode === 'online' && isWaitingForOpponent && lobby.activeMatch && (
        <WaitingForOpponentState 
          match={lobby.activeMatch}
          joinCode={lobby.joinCode}
          canCancel={canCancelWaitingMatch}
          onCancel={canCancelWaitingMatch ? handleCancelWaitingMatch : undefined}
          isCancelling={cancellingActiveMatch}
        />
      )}

      {/* Active Game In Progress */}
      {sessionMode === 'online' && isInProgress && (
        <SantoriniProvider evaluationEnabled={false}>
          <ActiveMatchContent
            match={lobby.activeMatch}
            role={lobby.activeRole}
            moves={lobby.moves}
            joinCode={lobby.joinCode}
            onSubmitMove={lobby.submitMove}
            onLeave={lobby.leaveMatch}
            onGameComplete={lobby.updateMatchStatus}
            undoState={activeUndoState}
            onRequestUndo={lobby.requestUndo}
            onRespondUndo={lobby.respondUndo}
            onClearUndo={handleClearUndoState}
            profileId={auth.profile?.id ?? null}
          />
        </SantoriniProvider>
      )}

      {/* No Active Game */}
      {sessionMode === 'online' && !hasActiveMatch && (
        lastCancelledMatchId ? (
          <CancelledMatchPrompt
            onCreateNewMatch={handleCreateNewMatchFromPlay}
            onNavigateToLobby={handleNavigateToLobby}
          />
        ) : (
          <NoActiveGamePrompt onNavigateToLobby={handleNavigateToLobby} />
        )
      )}
    </Stack>
  );
}

export default GamePlayWorkspace;
