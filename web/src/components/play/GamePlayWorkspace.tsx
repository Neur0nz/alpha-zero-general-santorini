import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardBody,
  CardHeader,
  Center,
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
import { useMatchLobby, type LobbyMatch } from '@hooks/useMatchLobby';
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
}: {
  match: LobbyMatch | null;
  role: 'creator' | 'opponent' | null;
  moves: ReturnType<typeof useMatchLobby>['moves'];
  joinCode: string | null;
  onSubmitMove: ReturnType<typeof useMatchLobby>['submitMove'];
  onLeave: (matchId?: string | null) => Promise<void>;
  onOfferRematch: ReturnType<typeof useMatchLobby>['offerRematch'];
  onGameComplete: (status: MatchStatus, payload?: { winner_id?: string | null }) => Promise<void>;
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
    <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder} w="100%">
      <CardHeader>
        <Flex justify="space-between" align="center">
          <Stack spacing={1}>
            <Heading size="md">Active match</Heading>
            {lobbyMatch && (
              <Text fontSize="sm" color={mutedText}>
                {creatorName} vs {lobbyMatch.opponent ? opponentName : 'Waiting for opponent'}
              </Text>
            )}
          </Stack>
          <HStack spacing={3}>
            {showJoinCode && (
              <Badge colorScheme="orange" fontSize="0.8rem">
                Code: {joinCode}
              </Badge>
            )}
            <Badge colorScheme={lobbyMatch?.rated ? 'purple' : 'gray'}>{lobbyMatch?.rated ? 'Rated' : 'Casual'}</Badge>
            {lobbyMatch && lobbyMatch.clock_initial_seconds > 0 && (
              <Badge colorScheme="blue">
                {Math.round(lobbyMatch.clock_initial_seconds / 60)}+{lobbyMatch.clock_increment_seconds}
              </Badge>
            )}
          </HStack>
        </Flex>
      </CardHeader>
      <CardBody>
        {!lobbyMatch ? (
          <Center py={10}>
            <Text color={mutedText}>Select or create a match to begin.</Text>
          </Center>
        ) : (
          <Grid templateColumns={{ base: '1fr', xl: '1.2fr 0.8fr' }} gap={8} alignItems="flex-start">
            <GridItem>
              <VStack spacing={4} align="stretch">
                <Box bg={panelBg} borderRadius="xl" borderWidth="1px" borderColor={cardBorder} p={{ base: 2, md: 3 }} display="flex" justifyContent="center">
                  {/* TODO: Implement online undo request flow */}
                  <GameBoard
                    board={santorini.board}
                    selectable={santorini.selectable}
                    onCellClick={santorini.onCellClick}
                    onCellHover={santorini.onCellHover}
                    onCellLeave={santorini.onCellLeave}
                    buttons={santorini.buttons}
                    undo={santorini.undo}
                    redo={santorini.redo}
                    undoLabel="Request undo"
                    hideRedoButton
                    undoDisabledOverride
                  />
                </Box>
                <Stack direction={{ base: 'column', sm: 'row' }} spacing={{ base: 3, sm: 4 }} justify="space-between" w="100%" align={{ base: 'stretch', sm: 'center' }}>
                  <VStack spacing={1} align={{ base: 'center', sm: 'flex-start' }} w="100%">
                    <Text fontSize="sm" color={mutedText}>
                      {role === 'creator' ? 'Your clock' : 'Player 1 (Blue)'}
                    </Text>
                    <Heading size="lg" color={creatorTurnActive ? accentHeading : strongText}>
                      {creatorClock}
                    </Heading>
                    <Text fontSize="xs" color={helperText} textAlign={{ base: 'center', sm: 'left' }}>
                      {creatorName}
                    </Text>
                  </VStack>
                  <VStack spacing={1} align={{ base: 'center', sm: 'flex-end' }} w="100%">
                    <Text fontSize="sm" color={mutedText} textAlign={{ base: 'center', sm: 'right' }}>
                      {role === 'opponent' ? 'Your clock' : 'Player 2 (Red)'}
                    </Text>
                    <Heading size="lg" color={opponentTurnActive ? accentHeading : strongText}>
                      {opponentClock}
                    </Heading>
                    <Text fontSize="xs" color={helperText} textAlign={{ base: 'center', sm: 'right' }}>
                      {opponentName}
                    </Text>
                  </VStack>
                </Stack>
              </VStack>
            </GridItem>
            <GridItem>
              <Stack spacing={6}>
                <Box>
                  <Heading size="sm" mb={3}>
                    Match status
                  </Heading>
                  <Text fontSize="sm" color={strongText}>
                    {role === 'creator'
                      ? 'You are playing as Player 1 (Blue)'
                      : role === 'opponent'
                      ? 'You are playing as Player 2 (Red)'
                      : 'Spectating this match'}
                  </Text>
                  <Text fontSize="sm" color={helperText}>
                    {typedMoves.length} moves played · Turn:{' '}
                    {santorini.currentTurn === 'creator' ? `Player 1 (Blue) – ${creatorName}` : `Player 2 (Red) – ${opponentName}`}
                  </Text>
                </Box>
                <Box>
                  <Heading size="sm" mb={3}>
                    Recent moves
                  </Heading>
                  {santorini.history.length === 0 ? (
                    <Text color={mutedText} fontSize="sm">
                      No moves yet. Use the board to make the first move.
                    </Text>
                  ) : (
                    <Stack spacing={2} maxH="220px" overflowY="auto">
                      {[...santorini.history]
                        .slice()
                        .reverse()
                        .map((entry, index) => (
                          <Box key={`${entry.action}-${index}`} borderBottomWidth="1px" borderColor={cardBorder} pb={2}>
                            <Text fontWeight="semibold" fontSize="sm">
                              Move {santorini.history.length - index}
                            </Text>
                            <Text fontSize="sm" color={mutedText}>
                              {entry.description || `Action ${entry.action}`}
                            </Text>
                          </Box>
                        ))}
                    </Stack>
                  )}
                </Box>
                <Box>
                  <Heading size="sm" mb={3}>
                    Actions
                  </Heading>
                  <ButtonGroup size="sm" variant="outline" spacing={3} flexWrap="wrap">
                    <Button colorScheme="red" onClick={handleLeave} isLoading={leaveBusy}>
                      Leave match
                    </Button>
                    <Tooltip label="Offer a new game with the same settings" hasArrow>
                      <Button colorScheme="teal" onClick={handleOfferRematch} isLoading={offerBusy} isDisabled={!role || offerBusy}>
                        Offer rematch
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
                        Analyze game
                      </Button>
                    </Tooltip>
                  </ButtonGroup>
                </Box>
              </Stack>
            </GridItem>
          </Grid>
        )}
      </CardBody>
    </Card>
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

function GamePlayWorkspace({ auth }: { auth: SupabaseAuthState }) {
  const lobby = useMatchLobby(auth.profile);
  const sessionMode = lobby.sessionMode ?? 'online';

  // Auto-enable online mode
  useEffect(() => {
    if (!lobby.sessionMode && auth.profile) {
      lobby.enableOnline();
    }
  }, [lobby.sessionMode, lobby.enableOnline, auth.profile]);

  // Check if we have an active online game
  const hasActiveOnlineGame = sessionMode === 'online' && lobby.activeMatch && lobby.activeMatch.status === 'in_progress';
  const hasActiveLocalGame = sessionMode === 'local';
  const hasActiveGame = hasActiveLocalGame || hasActiveOnlineGame;

  return (
    <Stack spacing={6} py={{ base: 6, md: 10 }}>
      {/* Active Game Switcher - only show if user has multiple active games */}
      {auth.profile && sessionMode === 'online' && (
        <ActiveGameSwitcher
          matches={lobby.myMatches}
          activeMatchId={lobby.activeMatchId}
          profile={auth.profile}
          onSelectMatch={lobby.setActiveMatch}
        />
      )}

      {/* Mode Selector for Local vs Online */}
      {!hasActiveGame && (
        <Card
          bg={useColorModeValue('white', 'whiteAlpha.100')}
          borderWidth="1px"
          borderColor={useColorModeValue('gray.200', 'whiteAlpha.200')}
        >
          <CardBody>
            <Stack spacing={4}>
              <Stack spacing={1}>
                <Heading size="sm">Choose game mode</Heading>
                <Text fontSize="sm" color="gray.500">
                  Start a local match on this device or find opponents online
                </Text>
              </Stack>
              <ButtonGroup isAttached variant="outline">
                <Button
                  colorScheme="teal"
                  variant="outline"
                  onClick={() => lobby.enableOnline()}
                  isDisabled={!auth.profile}
                >
                  Online Game
                </Button>
                <Button
                  colorScheme="teal"
                  variant="outline"
                  onClick={() => lobby.startLocalMatch()}
                >
                  Local Match
                </Button>
              </ButtonGroup>
              {!auth.profile && (
                <Text fontSize="sm" color="orange.500">
                  Sign in required for online games
                </Text>
              )}
            </Stack>
          </CardBody>
        </Card>
      )}

      {/* Game Board */}
      {sessionMode === 'local' && <LocalMatchPanel onExit={lobby.stopLocalMatch} />}

      {sessionMode === 'online' && hasActiveGame && (
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
          />
        </SantoriniProvider>
      )}

      {sessionMode === 'online' && !hasActiveGame && <NoActiveGamePrompt />}
    </Stack>
  );
}

export default GamePlayWorkspace;

