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
  Heading,
  HStack,
  IconButton,
  Input,
  Spinner,
  Stack,
  Text,
  Tooltip,
  useColorModeValue,
  useToast,
  Divider,
} from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon, ArrowBackIcon, ArrowForwardIcon } from '@chakra-ui/icons';
import GameBoard from '@components/GameBoard';
import EvaluationPanel from '@components/EvaluationPanel';
import { supabase } from '@/lib/supabaseClient';
import { SantoriniEngine, type SantoriniSnapshot } from '@/lib/santoriniEngine';
import { renderCellSvg } from '@game/svg';
import { useSantorini } from '@hooks/useSantorini';
import type { MatchMoveRecord, MatchRecord, SantoriniMoveAction, PlayerProfile } from '@/types/match';
import type { SupabaseAuthState } from '@hooks/useSupabaseAuth';
import type { LobbyMatch } from '@hooks/useMatchLobby';

interface LoadedAnalysis {
  match: MatchRecord;
  moves: MatchMoveRecord<SantoriniMoveAction>[];
}

interface BoardCell {
  worker: number;
  level: number;
  levels: number;
  svg: string;
  highlight: boolean;
}

function engineToBoard(snapshot: SantoriniSnapshot): BoardCell[][] {
  const board: BoardCell[][] = [];
  for (let y = 0; y < 5; y++) {
    const row: BoardCell[] = [];
    for (let x = 0; x < 5; x++) {
      const cell = snapshot.board[y][x];
      const worker = cell[0] || 0;
      const level = cell[1] || 0;
      row.push({
        worker,
        level,
        levels: level,
        svg: renderCellSvg({ levels: level, worker }),
        highlight: false,
      });
    }
    board.push(row);
  }
  return board;
}

function describeMatch(match: LobbyMatch, profile: PlayerProfile | null) {
  const isCreator = profile ? match.creator_id === profile.id : false;
  if (isCreator) {
    const opponentName = match.opponent?.display_name ?? 'Unknown opponent';
    return `You vs ${opponentName}`;
  }
  if (profile && match.opponent_id === profile.id) {
    const creatorName = match.creator?.display_name ?? 'Unknown opponent';
    return `${creatorName} vs You`;
  }
  const creatorName = match.creator?.display_name ?? 'Player 1';
  const opponentName = match.opponent?.display_name ?? 'Player 2';
  return `${creatorName} vs ${opponentName}`;
}

interface AnalyzeWorkspaceProps {
  auth: SupabaseAuthState;
}

function AnalyzeWorkspace({ auth }: AnalyzeWorkspaceProps) {
  const toast = useToast();
  const santorini = useSantorini(); // AI engine for evaluation
  const [matchId, setMatchId] = useState(() => localStorage.getItem('santorini:lastAnalyzedMatch') ?? '');
  const [loaded, setLoaded] = useState<LoadedAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [engine, setEngine] = useState<SantoriniEngine | null>(null);
  const [board, setBoard] = useState<BoardCell[][]>([]);
  const [myCompletedGames, setMyCompletedGames] = useState<LobbyMatch[]>([]);
  const [loadingMyGames, setLoadingMyGames] = useState(false);
  const [aiInitialized, setAiInitialized] = useState(false);
  const [replaying, setReplaying] = useState(false);

  // Initialize AI engine on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await santorini.initialize();
        if (!cancelled) {
          setAiInitialized(true);
        }
      } catch (error) {
        console.error('Failed to initialize AI engine for analysis', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [santorini]);

  // Fetch user's completed games
  useEffect(() => {
    const fetchMyCompletedGames = async () => {
      if (!supabase || !auth?.profile) {
        setMyCompletedGames([]);
        return;
      }

      setLoadingMyGames(true);
      try {
        const { data, error } = await supabase
          .from('matches')
          .select(`
            *,
            creator:players!matches_creator_id_fkey(*),
            opponent:players!matches_opponent_id_fkey(*)
          `)
          .eq('status', 'completed')
          .or(`creator_id.eq.${auth.profile.id},opponent_id.eq.${auth.profile.id}`)
          .order('updated_at', { ascending: false })
          .limit(20);

        if (error) {
          console.error('Failed to fetch completed games', error);
          return;
        }

        setMyCompletedGames((data ?? []) as unknown as LobbyMatch[]);
      } catch (error) {
        console.error('Failed to fetch completed games', error);
      } finally {
        setLoadingMyGames(false);
      }
    };

    fetchMyCompletedGames();
  }, [auth?.profile]);

  // Replay game to a specific move index
  const replayTo = useCallback(
    async (index: number, sourceMoves: MatchMoveRecord<SantoriniMoveAction>[]) => {
      if (!loaded || !aiInitialized || replaying) return;

      setReplaying(true);
      try {
        // Start from initial state for TypeScript engine (fast display)
        const initialState = loaded.match.initial_state as SantoriniSnapshot;
        let currentEngine = SantoriniEngine.fromSnapshot(initialState);

        // Update display immediately
        setEngine(currentEngine);
        setBoard(engineToBoard(currentEngine.snapshot));
        setCurrentIndex(index);

        // Reset AI engine and replay moves
        await santorini.controls.reset();

        // Apply moves up to index
        if (index >= 0) {
          for (let i = 0; i <= index; i++) {
            const action = sourceMoves[i]?.action;
            if (action && action.kind === 'santorini.move' && typeof action.move === 'number') {
              // Update TypeScript engine for display
              const result = currentEngine.applyMove(action.move);
              currentEngine = SantoriniEngine.fromSnapshot(result.snapshot);
              
              // Apply to AI engine (without triggering automatic AI move)
              await santorini.applyMove(action.move, { triggerAi: false });
            }
          }
        }

        // Update display with final state
        setEngine(currentEngine);
        setBoard(engineToBoard(currentEngine.snapshot));

        // Refresh AI evaluation for current position (this triggers the analysis)
        await santorini.controls.refreshEvaluation();
      } catch (error) {
        console.error('Failed to replay to move', index, error);
        toast({
          title: 'Failed to replay move',
          status: 'error',
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setReplaying(false);
      }
    },
    [loaded, aiInitialized, replaying, santorini, toast],
  );

  const loadMatchById = useCallback(async (id: string) => {
    if (!supabase) {
      toast({
        title: 'Supabase not configured',
        description: 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable analysis.',
        status: 'warning',
      });
      return;
    }
    if (!id.trim()) {
      toast({ title: 'Enter a match ID', status: 'info' });
      return;
    }

    setLoading(true);
    try {
      const [{ data: matchData, error: matchError }, { data: movesData, error: movesError }] = await Promise.all([
        supabase.from('matches').select('*').eq('id', id.trim()).maybeSingle(),
        supabase
          .from('match_moves')
          .select('*')
          .eq('match_id', id.trim())
          .order('move_index', { ascending: true }),
      ]);

      if (matchError) {
        throw matchError;
      }
      if (!matchData) {
        throw new Error('Match not found.');
      }
      if (movesError) {
        throw movesError;
      }

      const typedMoves: MatchMoveRecord<SantoriniMoveAction>[] = (movesData ?? []).map(
        (move: MatchMoveRecord) => ({
          ...move,
          action: move.action as SantoriniMoveAction,
        }),
      );

      const loadedData = { match: matchData as MatchRecord, moves: typedMoves };
      setLoaded(loadedData);
      
      // Start at the last move
      await replayTo(typedMoves.length - 1, typedMoves);
      
      localStorage.setItem('santorini:lastAnalyzedMatch', id.trim());
      setMatchId(id.trim());
      
      toast({
        title: 'Match loaded',
        description: `${typedMoves.length} moves loaded successfully`,
        status: 'success',
      });
    } catch (error) {
      console.error('Failed to load match', error);
      toast({
        title: 'Failed to load match',
        status: 'error',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  }, [replayTo, toast]);

  const loadMatch = useCallback(() => {
    loadMatchById(matchId);
  }, [loadMatchById, matchId]);

  const goToMove = useCallback(
    async (index: number) => {
      if (!loaded) return;
      await replayTo(index, loaded.moves);
    },
    [loaded, replayTo],
  );

  const goToStart = useCallback(() => goToMove(-1), [goToMove]);
  const goToEnd = useCallback(() => {
    if (loaded) goToMove(loaded.moves.length - 1);
  }, [goToMove, loaded]);
  const stepBack = useCallback(() => {
    if (currentIndex > -1) goToMove(currentIndex - 1);
  }, [currentIndex, goToMove]);
  const stepForward = useCallback(() => {
    if (loaded && currentIndex < loaded.moves.length - 1) goToMove(currentIndex + 1);
  }, [currentIndex, goToMove, loaded]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!loaded) return;
      
      // Arrow keys for navigation
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepBack();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepForward();
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToStart();
      } else if (e.key === 'End') {
        e.preventDefault();
        goToEnd();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loaded, stepBack, stepForward, goToStart, goToEnd]);

  const summary = useMemo(() => {
    if (!loaded) return null;
    return {
      rated: loaded.match.rated,
      visibility: loaded.match.visibility,
      status: loaded.match.status,
      clock: loaded.match.clock_initial_seconds > 0
        ? `${Math.round(loaded.match.clock_initial_seconds / 60)}+${loaded.match.clock_increment_seconds}`
        : 'No clock',
    };
  }, [loaded]);

  const gameResult = useMemo(() => {
    if (!engine || !loaded) return null;
    const [p0Score, p1Score] = engine.getGameEnded();
    if (p0Score === 0 && p1Score === 0) return null;
    
    const winner = p0Score === 1 ? 'Creator' : p1Score === 1 ? 'Opponent' : 'Draw';
    return winner;
  }, [engine, loaded]);

  const canStepBack = currentIndex > -1;
  const canStepForward = loaded ? currentIndex < loaded.moves.length - 1 : false;
  const cardBg = useColorModeValue('white', 'whiteAlpha.100');
  const cardBorder = useColorModeValue('gray.200', 'whiteAlpha.200');
  const mutedText = useColorModeValue('gray.600', 'whiteAlpha.700');
  const helperText = useColorModeValue('gray.500', 'whiteAlpha.600');
  const highlightBorder = useColorModeValue('teal.500', 'teal.300');
  const highlightBg = useColorModeValue('teal.50', 'teal.900');
  const badgeBorder = useColorModeValue('gray.200', 'whiteAlpha.200');

  return (
    <Stack spacing={6} py={{ base: 6, md: 10 }}>
      <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder}>
        <CardHeader>
          <Heading size="md">Analyze a completed match</Heading>
        </CardHeader>
        <CardBody as={Stack} spacing={4}>
          {/* Your Completed Games */}
          {auth?.profile && (
            <>
              <Box>
                <Heading size="sm" mb={3}>Your recent games</Heading>
                {loadingMyGames ? (
                  <Center py={4}>
                    <Spinner size="sm" />
                  </Center>
                ) : myCompletedGames.length === 0 ? (
                  <Text color={mutedText} fontSize="sm">
                    No completed games yet. Finish a game to see it here.
                  </Text>
                ) : (
                  <Stack spacing={2} maxH="300px" overflowY="auto">
                    {myCompletedGames.map((game) => {
                      const isCurrentlyLoaded = loaded?.match.id === game.id;
                      return (
                        <Box
                          key={game.id}
                          borderWidth="2px"
                          borderColor={isCurrentlyLoaded ? highlightBorder : cardBorder}
                          bg={isCurrentlyLoaded ? highlightBg : 'transparent'}
                          borderRadius="md"
                          px={3}
                          py={2}
                          cursor="pointer"
                          onClick={() => loadMatchById(game.id)}
                          transition="all 0.2s"
                          _hover={{ borderColor: highlightBorder }}
                        >
                          <Flex justify="space-between" align="center" gap={3}>
                            <Stack spacing={1} flex="1">
                              <Text fontWeight={isCurrentlyLoaded ? 'bold' : 'semibold'} fontSize="sm">
                                {describeMatch(game, auth?.profile ?? null)}
                              </Text>
                              <HStack spacing={2} flexWrap="wrap">
                                <Badge colorScheme={game.rated ? 'purple' : 'gray'} fontSize="xs">
                                  {game.rated ? 'Rated' : 'Casual'}
                                </Badge>
                                {game.clock_initial_seconds > 0 && (
                                  <Badge colorScheme="blue" fontSize="xs">
                                    {Math.round(game.clock_initial_seconds / 60)}+{game.clock_increment_seconds}
                                  </Badge>
                                )}
                                <Text fontSize="xs" color={helperText}>
                                  {new Date(game.created_at).toLocaleDateString()}
                                </Text>
                              </HStack>
                            </Stack>
                            <Button
                              size="xs"
                              colorScheme="teal"
                              variant={isCurrentlyLoaded ? 'solid' : 'outline'}
                              onClick={(e) => {
                                e.stopPropagation();
                                loadMatchById(game.id);
                              }}
                              isLoading={loading && matchId === game.id}
                            >
                              {isCurrentlyLoaded ? 'Loaded' : 'Analyze'}
                            </Button>
                          </Flex>
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </Box>

              <Divider />
            </>
          )}

          {/* Manual Match ID Entry */}
          <Box>
            <Heading size="sm" mb={3}>Or enter a match ID</Heading>
            <Text color={mutedText} fontSize="sm" mb={3}>
              Paste any match ID to analyze games not in your history.
          </Text>
          <HStack spacing={3} align="center">
            <Input
                placeholder="Match ID (e.g., 2af5ce96-718b-4361-bb6c-b6c419f21010)"
              value={matchId}
              onChange={(event) => setMatchId(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    loadMatch();
                  }
                }}
            />
              <Button colorScheme="teal" onClick={loadMatch} isLoading={loading} minW="100px">
              Load
            </Button>
          </HStack>
          </Box>

          {loaded && summary && (
            <HStack spacing={3} flexWrap="wrap">
              <Badge colorScheme={summary.rated ? 'purple' : 'gray'}>
                {summary.rated ? 'Rated' : 'Casual'}
              </Badge>
              <Badge colorScheme="blue">
                {summary.visibility === 'public' ? 'Public' : 'Private'}
              </Badge>
              <Badge colorScheme={summary.status === 'completed' ? 'green' : 'gray'}>
                {summary.status}
              </Badge>
              <Badge borderWidth="1px" borderColor={badgeBorder}>
                {summary.clock}
              </Badge>
              {gameResult && (
                <Badge colorScheme="yellow">
                  Winner: {gameResult}
                </Badge>
              )}
              <Badge>
                {loaded.moves.length} moves
              </Badge>
            </HStack>
          )}
        </CardBody>
      </Card>

      {!loaded ? (
        <Center py={12}>
          {loading ? (
            <Stack spacing={3} align="center">
              <Spinner size="lg" color="teal.500" />
              <Text color={mutedText}>Loading match...</Text>
            </Stack>
          ) : (
            <Text color={mutedText}>Load a match to begin analysis.</Text>
          )}
        </Center>
      ) : (
        <Stack spacing={6}>
          {/* Navigation Controls */}
          <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder}>
            <CardBody>
              <Stack spacing={4}>
                <Flex justify="space-between" align="center" gap={4} flexWrap="wrap">
                  <Text fontSize="sm" color={mutedText}>
                    Move {currentIndex + 1} of {loaded.moves.length}
                    {currentIndex === -1 && ' (Initial position)'}
                  </Text>
                  <ButtonGroup size="sm" isAttached variant="outline">
                    <Tooltip label="Go to start (Home)" hasArrow>
                      <IconButton
                        aria-label="Go to start"
                        icon={<ArrowBackIcon />}
                        onClick={goToStart}
                        isDisabled={!canStepBack}
                      />
                    </Tooltip>
                    <Tooltip label="Previous move (←)" hasArrow>
                      <IconButton
                        aria-label="Previous move"
                        icon={<ChevronLeftIcon />}
                        onClick={stepBack}
                        isDisabled={!canStepBack}
                      />
                    </Tooltip>
                    <Tooltip label="Next move (→)" hasArrow>
                      <IconButton
                        aria-label="Next move"
                        icon={<ChevronRightIcon />}
                        onClick={stepForward}
                        isDisabled={!canStepForward}
                      />
                    </Tooltip>
                    <Tooltip label="Go to end (End)" hasArrow>
                      <IconButton
                        aria-label="Go to end"
                        icon={<ArrowForwardIcon />}
                        onClick={goToEnd}
                        isDisabled={!canStepForward}
                      />
                    </Tooltip>
                  </ButtonGroup>
                </Flex>
              </Stack>
            </CardBody>
          </Card>

          {/* Board and Move List */}
          <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder}>
            <CardBody>
              <Flex direction={{ base: 'column', xl: 'row' }} gap={6} align="stretch">
                {/* Game Board - Read-only for analysis */}
                <Box flex="1" display="flex" justifyContent="center" pointerEvents={replaying ? 'none' : 'auto'}>
                  <GameBoard
                    board={board}
                    selectable={Array.from({ length: 5 }, () => Array(5).fill(false))}
                    cancelSelectable={Array.from({ length: 5 }, () => Array(5).fill(false))}
                    onCellClick={() => {}}
                    onCellHover={() => {}}
                    onCellLeave={() => {}}
                    buttons={{
                      loading: replaying,
                      canUndo: false,
                      canRedo: false,
                      status: replaying 
                        ? 'Loading position...' 
                        : currentIndex === -1 
                          ? 'Initial position' 
                          : `Move ${currentIndex + 1} of ${loaded?.moves.length ?? 0}`,
                      editMode: 0,
                      setupMode: false,
                      setupTurn: 0,
                    }}
                    undo={async () => {}}
                    redo={async () => {}}
                    hideRedoButton={true}
                    undoLabel="Previous"
                    undoDisabledOverride={true}
                  />
                </Box>

                {/* Move List and Evaluation */}
                <Box flex={{ base: '1', xl: '0 0 360px' }}>
                  <Stack spacing={4}>
                    {/* AI Evaluation Panel */}
                    <EvaluationPanel
                      loading={santorini.loading}
                      evaluation={santorini.evaluation}
                      topMoves={santorini.topMoves}
                      calcOptionsBusy={santorini.calcOptionsBusy}
                      refreshEvaluation={santorini.controls.refreshEvaluation}
                      calculateOptions={santorini.controls.calculateOptions}
                      updateDepth={santorini.controls.updateCalcDepth}
                    />

                    <Box>
                      <Heading size="sm" mb={3}>
                        Move history
                      </Heading>
                      <Stack spacing={2} maxH="400px" overflowY="auto" pr={2}>
                        {/* Initial position */}
                        <Box
                          borderWidth="2px"
                          borderColor={currentIndex === -1 ? highlightBorder : cardBorder}
                          bg={currentIndex === -1 ? highlightBg : 'transparent'}
                          borderRadius="md"
                          px={3}
                          py={2}
                          cursor="pointer"
                          onClick={goToStart}
                          transition="all 0.2s"
                          _hover={{ borderColor: highlightBorder }}
                        >
                          <Text fontWeight={currentIndex === -1 ? 'bold' : 'semibold'} fontSize="sm">
                            0. Initial position
                          </Text>
                        </Box>

                        {/* Move list */}
                        {loaded.moves.map((move, index) => {
                          const isSelected = currentIndex === index;
                          return (
                            <Box
                              key={move.id}
                              borderWidth="2px"
                              borderColor={isSelected ? highlightBorder : cardBorder}
                              bg={isSelected ? highlightBg : 'transparent'}
                              borderRadius="md"
                              px={3}
                              py={2}
                              cursor="pointer"
                              onClick={() => goToMove(index)}
                              transition="all 0.2s"
                              _hover={{ borderColor: highlightBorder }}
                            >
                              <HStack justify="space-between" align="center">
                                <Text fontWeight={isSelected ? 'bold' : 'semibold'} fontSize="sm">
                                  {index + 1}. {move.action?.kind === 'santorini.move' ? `Move ${move.action.move}` : 'Move'}
                                </Text>
                                <Text fontSize="xs" color={helperText}>
                                  {new Date(move.created_at).toLocaleTimeString([], { 
                                    hour: '2-digit', 
                                    minute: '2-digit',
                                    second: '2-digit',
                                  })}
                                </Text>
                              </HStack>
                            </Box>
                          );
                        })}
                      </Stack>
                    </Box>
                  </Stack>
                </Box>
              </Flex>
            </CardBody>
          </Card>

          {/* Keyboard shortcuts hint */}
          <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder}>
            <CardBody py={3}>
              <HStack spacing={6} fontSize="sm" color={mutedText} flexWrap="wrap">
                <HStack spacing={2}>
                  <Badge>←</Badge>
                  <Text>Previous</Text>
                </HStack>
                <HStack spacing={2}>
                  <Badge>→</Badge>
                  <Text>Next</Text>
                </HStack>
                <HStack spacing={2}>
                  <Badge>Home</Badge>
                  <Text>Start</Text>
                </HStack>
                <HStack spacing={2}>
                  <Badge>End</Badge>
                  <Text>End</Text>
                </HStack>
              </HStack>
            </CardBody>
          </Card>
        </Stack>
      )}
    </Stack>
  );
}

export default AnalyzeWorkspace;
