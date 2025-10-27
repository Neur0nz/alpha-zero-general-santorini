import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
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
  useToast,
  VStack,
} from '@chakra-ui/react';
import type { SupabaseAuthState } from '@hooks/useSupabaseAuth';
import type { LobbyMatch, UndoRequestState, UseMatchLobbyReturn } from '@hooks/useMatchLobby';
import { useMatchLobbyContext } from '@hooks/matchLobbyContext';
import { useOnlineSantorini } from '@hooks/useOnlineSantorini';
import { SantoriniProvider } from '@hooks/useSantorini';
import { useLocalSantorini } from '@hooks/useLocalSantorini';
import GameBoard from '@components/GameBoard';
import ActiveGameSwitcher from './ActiveGameSwitcher';
import type { SantoriniMoveAction, MatchStatus } from '@/types/match';

function useSurfaceTokens() {
  const cardBg = useColorModeValue('white', 'whiteAlpha.100');
  const cardBorder = useColorModeValue('gray.200', 'whiteAlpha.200');
  const mutedText = useColorModeValue('gray.600', 'whiteAlpha.700');
  const helperText = useColorModeValue('gray.500', 'whiteAlpha.600');
  const strongText = useColorModeValue('gray.900', 'whiteAlpha.900');
  const accentHeading = useColorModeValue('teal.600', 'teal.200');
  const panelBg = useColorModeValue('gray.50', 'blackAlpha.400');
  return { cardBg, cardBorder, mutedText, helperText, strongText, accentHeading, panelBg };
}

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
                onCellClick={onCellClick}
                onCellHover={onCellHover}
                onCellLeave={onCellLeave}
                buttons={buttons}
                undo={undo}
                redo={redo}
                showPrimaryControls={false}
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
  onOfferRematch,
  onGameComplete,
  undoState,
  onRequestUndo,
  onRespondUndo,
  onClearUndo,
}: {
  match: LobbyMatch | null;
  role: 'creator' | 'opponent' | null;
  moves: UseMatchLobbyReturn['moves'];
  joinCode: string | null;
  onSubmitMove: UseMatchLobbyReturn['submitMove'];
  onLeave: (matchId?: string | null) => Promise<void>;
  onOfferRematch: UseMatchLobbyReturn['offerRematch'];
  onGameComplete: (status: MatchStatus, payload?: { winner_id?: string | null }) => Promise<void>;
  undoState?: UndoRequestState;
  onRequestUndo: UseMatchLobbyReturn['requestUndo'];
  onRespondUndo: UseMatchLobbyReturn['respondUndo'];
  onClearUndo: () => void;
}) {
  const toast = useToast();
  const [offerBusy, setOfferBusy] = useBoolean();
  const [leaveBusy, setLeaveBusy] = useBoolean();
  const lobbyMatch = match ?? null;
  const { cardBg, cardBorder, mutedText, helperText, strongText, accentHeading, panelBg } = useSurfaceTokens();
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
  const creatorName = lobbyMatch?.creator?.display_name ?? 'Player 1 (Blue)';
  const opponentName = lobbyMatch?.opponent?.display_name ?? 'Player 2 (Red)';
  const creatorClock = santorini.formatClock(santorini.creatorClockMs);
  const opponentClock = santorini.formatClock(santorini.opponentClockMs);
  const creatorTurnActive = santorini.currentTurn === 'creator';
  const opponentTurnActive = santorini.currentTurn === 'opponent';
  const [requestingUndo, setRequestingUndo] = useBoolean(false);
  const [respondingUndo, setRespondingUndo] = useBoolean(false);

  const undoRequestedByMe = undoState && undoState.requestedBy === role;
  const undoPending = undoState?.status === 'pending';
  const undoMoveNumber = undoState ? undoState.moveIndex + 1 : null;
  const canRequestUndo = Boolean(
    match?.status === 'in_progress' &&
      role &&
      moves.length > 0 &&
      (!undoState || undoState.status === 'rejected' || undoState.status === 'applied')
  );
  const undoDisabledOverride = !canRequestUndo || requestingUndo || undoPending;

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

  const handleLeave = async () => {
    setLeaveBusy.on();
    try {
      await onLeave(match?.id);
      await santorini.resetMatch();
    } finally {
      setLeaveBusy.off();
    }
  };

  const handleOfferRematch = async () => {
    if (!lobbyMatch) return;
    setOfferBusy.on();
    try {
      const result = await onOfferRematch();
      if (result) {
        toast({
          title: 'Rematch created',
          description: `Share code ${result.private_join_code ?? result.id.slice(0, 8)}`,
          status: 'success',
        });
      }
    } catch (error) {
      toast({
        title: 'Failed to create rematch',
        status: 'error',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setOfferBusy.off();
    }
  };

  const showJoinCode = lobbyMatch?.visibility === 'private' && joinCode;

  return (
    <Stack spacing={6}>
      {/* Game Identity Bar - CLEAR indication of which game */}
      <Card bg={cardBg} borderWidth="2px" borderColor="teal.400">
        <CardBody py={3}>
          <Flex
            direction={{ base: 'column', sm: 'row' }}
            justify="space-between"
            align={{ base: 'flex-start', sm: 'center' }}
            gap={3}
          >
            <Stack spacing={1}>
              <Heading size="md" color={accentHeading}>
                {creatorName} vs {opponentName}
              </Heading>
              <HStack spacing={3} flexWrap="wrap">
                {showJoinCode && (
                  <Badge colorScheme="orange" fontSize="0.8rem">
                    Code: {joinCode}
                  </Badge>
                )}
                <Badge colorScheme={lobbyMatch?.rated ? 'purple' : 'gray'}>
                  {lobbyMatch?.rated ? 'Rated' : 'Casual'}
                </Badge>
                {lobbyMatch && lobbyMatch.clock_initial_seconds > 0 && (
                  <Badge colorScheme="blue">
                    {Math.round(lobbyMatch.clock_initial_seconds / 60)}+{lobbyMatch.clock_increment_seconds}
                  </Badge>
                )}
                <Text fontSize="sm" color={mutedText}>
                  {typedMoves.length} moves
                </Text>
              </HStack>
            </Stack>
            <ButtonGroup size="sm" variant="outline" spacing={2} flexWrap="wrap">
              <Button colorScheme="red" onClick={handleLeave} isLoading={leaveBusy}>
                Leave
              </Button>
              <Tooltip label="Offer a new game with the same settings" hasArrow>
                <Button colorScheme="teal" onClick={handleOfferRematch} isLoading={offerBusy} isDisabled={!role || offerBusy}>
                  Rematch
                </Button>
              </Tooltip>
              <Tooltip label="Review this game from the Analyze tab" hasArrow>
                <Button
                  onClick={() => {
                    if (!lobbyMatch) return;
                    localStorage.setItem('santorini:lastAnalyzedMatch', lobbyMatch.id);
                    toast({
                      title: 'Ready for analysis',
                      description: 'Open the Analyze tab to review this game.',
                      status: 'success',
                    });
                  }}
                >
                  Analyze
                </Button>
              </Tooltip>
            </ButtonGroup>
          </Flex>
        </CardBody>
      </Card>

      {/* Game Board - Centered and LARGE */}
      <Flex direction="column" align="center" w="100%">
        <Box
          bg={panelBg}
          borderRadius="xl"
          borderWidth="1px"
          borderColor={cardBorder}
          p={{ base: 2, md: 3 }}
          display="flex"
          justifyContent="center"
          w="100%"
          maxW="960px"
        >
          <GameBoard
            board={santorini.board}
            selectable={santorini.selectable}
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
          />
        </Box>

        {undoBanner}

        {/* Player Clocks - Below board - PROMINENT */}
        <Stack
          direction={{ base: 'column', sm: 'row' }}
          spacing={{ base: 4, sm: 8, md: 16 }}
          mt={8}
          w="100%"
          maxW="960px"
          justify="center"
          align={{ base: 'stretch', sm: 'center' }}
        >
          <Box
            flex="1"
            p={4}
            borderRadius="lg"
            borderWidth="2px"
            borderColor={creatorTurnActive ? accentHeading : cardBorder}
            bg={creatorTurnActive ? useColorModeValue('teal.50', 'teal.900') : 'transparent'}
            transition="all 0.3s"
          >
            <VStack spacing={2} align="center">
              <Text fontSize="sm" fontWeight="semibold" color={mutedText}>
                {role === 'creator' ? '🟢 YOUR CLOCK' : 'Player 1 (Blue)'}
              </Text>
              <Heading 
                size={{ base: '2xl', md: '3xl' }} 
                color={creatorTurnActive ? accentHeading : strongText}
                fontFamily="mono"
                letterSpacing="tight"
              >
                {creatorClock}
              </Heading>
              <Text fontSize="md" fontWeight="medium" color={helperText}>
                {creatorName}
              </Text>
            </VStack>
          </Box>
          <Box
            flex="1"
            p={4}
            borderRadius="lg"
            borderWidth="2px"
            borderColor={opponentTurnActive ? accentHeading : cardBorder}
            bg={opponentTurnActive ? useColorModeValue('teal.50', 'teal.900') : 'transparent'}
            transition="all 0.3s"
          >
            <VStack spacing={2} align="center">
              <Text fontSize="sm" fontWeight="semibold" color={mutedText}>
                {role === 'opponent' ? '🟢 YOUR CLOCK' : 'Player 2 (Red)'}
              </Text>
              <Heading 
                size={{ base: '2xl', md: '3xl' }} 
                color={opponentTurnActive ? accentHeading : strongText}
                fontFamily="mono"
                letterSpacing="tight"
              >
                {opponentClock}
              </Heading>
              <Text fontSize="md" fontWeight="medium" color={helperText}>
                {opponentName}
              </Text>
            </VStack>
          </Box>
        </Stack>
      </Flex>
    </Stack>
  );
}

function NoActiveGamePrompt() {
  const { cardBg, cardBorder, mutedText } = useSurfaceTokens();
  return (
    <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder} w="100%">
      <CardBody>
        <Center py={20}>
          <Stack spacing={3} textAlign="center">
            <Heading size="md">No active game</Heading>
            <Text color={mutedText}>Visit the Lobby tab to find or create a match.</Text>
          </Stack>
        </Center>
      </CardBody>
    </Card>
  );
}

function WaitingForOpponentState({ 
  match, 
  joinCode 
}: { 
  match: LobbyMatch; 
  joinCode: string | null;
}) {
  const { cardBg, cardBorder, mutedText, accentHeading } = useSurfaceTokens();
  const gradientBg = useColorModeValue('linear(to-r, teal.50, blue.50)', 'linear(to-r, teal.900, blue.900)');
  
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
              
              {joinCode && (
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(joinCode);
                        }}
                      >
                        Copy code
                      </Button>
                    </Stack>
                  </CardBody>
                </Card>
              )}
              
              <HStack spacing={4} flexWrap="wrap" justify="center" color={mutedText} fontSize="sm">
                <Text>✓ Game settings configured</Text>
                <Text>✓ Board initialized</Text>
                <Text>✓ Ready to start</Text>
              </HStack>
              
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

function GamePlayWorkspace({ auth }: { auth: SupabaseAuthState }) {
  const lobby = useMatchLobbyContext();
  const sessionMode = lobby.sessionMode ?? 'online';
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
  const hasActiveLocalGame = sessionMode === 'local';

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
                onClick={() => {
                  if (hasActiveLocalGame) {
                    // Already in local mode with active game
                    return;
                  }
                  lobby.startLocalMatch();
                }}
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

      {/* Active Game Switcher - only show if user has multiple active games */}
      {auth.profile && sessionMode === 'online' && lobby.myMatches.filter(m => m.status === 'in_progress').length > 0 && (
        <ActiveGameSwitcher
          matches={lobby.myMatches}
          activeMatchId={lobby.activeMatchId}
          profile={auth.profile}
          onSelectMatch={lobby.setActiveMatch}
        />
      )}

      {/* Game Board - Local */}
      {sessionMode === 'local' && <LocalMatchPanel onExit={lobby.stopLocalMatch} />}

      {/* Waiting for Opponent State */}
      {sessionMode === 'online' && isWaitingForOpponent && lobby.activeMatch && (
        <WaitingForOpponentState 
          match={lobby.activeMatch}
          joinCode={lobby.joinCode}
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
            onOfferRematch={lobby.offerRematch}
            onGameComplete={lobby.updateMatchStatus}
            undoState={activeUndoState}
            onRequestUndo={lobby.requestUndo}
            onRespondUndo={lobby.respondUndo}
            onClearUndo={handleClearUndoState}
          />
        </SantoriniProvider>
      )}

      {/* No Active Game */}
      {sessionMode === 'online' && !hasActiveMatch && <NoActiveGamePrompt />}
    </Stack>
  );
}

export default GamePlayWorkspace;
