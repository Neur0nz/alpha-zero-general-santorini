import { useCallback, useMemo, useState } from 'react';
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
  Input,
  Spinner,
  Stack,
  Text,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import GameBoard from '@components/GameBoard';
import EvaluationPanel from '@components/EvaluationPanel';
import { useSantorini } from '@hooks/useSantorini';
import { supabase } from '@/lib/supabaseClient';
import type { MatchMoveRecord, MatchRecord, SantoriniMoveAction } from '@/types/match';

interface LoadedAnalysis {
  match: MatchRecord;
  moves: MatchMoveRecord<SantoriniMoveAction>[];
}

function AnalyzeWorkspace() {
  const santorini = useSantorini();
  const toast = useToast();
  const [matchId, setMatchId] = useState(() => localStorage.getItem('santorini:lastAnalyzedMatch') ?? '');
  const [loaded, setLoaded] = useState<LoadedAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const moves = loaded?.moves ?? [];

  const replayTo = useCallback(
    async (index: number, sourceMoves: MatchMoveRecord<SantoriniMoveAction>[]) => {
      await santorini.controls.reset();
      if (index >= 0) {
        for (let i = 0; i <= index; i += 1) {
          const action = sourceMoves[i]?.action;
          if (action && action.kind === 'santorini.move') {
            await santorini.applyMove(action.move, { triggerAi: false });
          }
        }
      }
      setCurrentIndex(index);
    },
    [santorini],
  );

  const loadMatch = useCallback(async () => {
    if (!supabase) {
      toast({
        title: 'Supabase not configured',
        description: 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable analysis.',
        status: 'warning',
      });
      return;
    }
    if (!matchId) {
      toast({ title: 'Enter a match ID', status: 'info' });
      return;
    }

    setLoading(true);
    try {
      const [{ data: matchData, error: matchError }, { data: movesData, error: movesError }] = await Promise.all([
        supabase.from('matches').select('*').eq('id', matchId).maybeSingle(),
        supabase
          .from('match_moves')
          .select('*')
          .eq('match_id', matchId)
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

      setLoaded({ match: matchData as MatchRecord, moves: typedMoves });
      await replayTo(typedMoves.length - 1, typedMoves);
      localStorage.setItem('santorini:lastAnalyzedMatch', matchId);
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
  }, [matchId, replayTo, toast]);

  const goToMove = useCallback(
    async (index: number) => {
      if (!loaded) return;
      await replayTo(index, loaded.moves);
    },
    [loaded, replayTo],
  );

  const summary = useMemo(() => {
    if (!loaded) return null;
    return {
      rated: loaded.match.rated,
      visibility: loaded.match.visibility,
      clock: loaded.match.clock_initial_seconds > 0
        ? `${Math.round(loaded.match.clock_initial_seconds / 60)}+${loaded.match.clock_increment_seconds}`
        : 'No clock',
    };
  }, [loaded]);

  const canStepBack = currentIndex > -1;
  const canStepForward = loaded ? currentIndex < loaded.moves.length - 1 : false;
  const cardBg = useColorModeValue('white', 'whiteAlpha.100');
  const cardBorder = useColorModeValue('gray.200', 'whiteAlpha.200');
  const mutedText = useColorModeValue('gray.600', 'whiteAlpha.700');
  const helperText = useColorModeValue('gray.500', 'whiteAlpha.600');
  const highlightBorder = useColorModeValue('teal.500', 'teal.300');
  const badgeBorder = useColorModeValue('gray.200', 'whiteAlpha.200');

  return (
    <Stack spacing={6} py={{ base: 6, md: 10 }}>
      <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder}>
        <CardHeader>
          <Heading size="md">Load a completed match</Heading>
        </CardHeader>
        <CardBody as={Stack} spacing={4}>
          <Text color={mutedText}>
            Paste a match ID from the Play tab or use the most recent game sent from "Analyze game".
          </Text>
          <HStack spacing={3} align="center">
            <Input
              placeholder="Match ID"
              value={matchId}
              onChange={(event) => setMatchId(event.target.value)}
            />
            <Button colorScheme="teal" onClick={loadMatch} isLoading={loading}>
              Load
            </Button>
          </HStack>
          {loaded && summary && (
            <HStack spacing={3}>
              <Badge colorScheme={summary.rated ? 'purple' : 'gray'}>{summary.rated ? 'Rated' : 'Casual'}</Badge>
              <Badge colorScheme="blue">{summary.visibility === 'public' ? 'Public' : 'Private'}</Badge>
              <Badge borderWidth="1px" borderColor={badgeBorder}>{summary.clock}</Badge>
            </HStack>
          )}
        </CardBody>
      </Card>

      {!loaded ? (
        <Center py={12}>
          {loading ? <Spinner size="lg" /> : <Text color={mutedText}>Load a match to begin analysis.</Text>}
        </Center>
      ) : (
        <Stack spacing={6}>
          <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder}>
            <CardBody>
              <Flex direction={{ base: 'column', xl: 'row' }} gap={6} align="stretch">
                <Box flex="1" display="flex" justifyContent="center">
                  <GameBoard
                    board={santorini.board}
                    selectable={santorini.selectable}
                    onCellClick={() => {}}
                    onCellHover={() => {}}
                    onCellLeave={() => {}}
                    buttons={santorini.buttons}
                    undo={async () => {}}
                    redo={async () => {}}
                  />
                </Box>
                <Box flex={{ base: '1', xl: '0 0 360px' }}>
                  <Stack spacing={4}>
                    <Box>
                      <Heading size="sm" mb={2}>
                        Move controls
                      </Heading>
                      <ButtonGroup size="sm" variant="outline" spacing={3}>
                        <Button onClick={() => goToMove(Math.max(-1, currentIndex - 1))} isDisabled={!loaded || !canStepBack}>
                          Previous
                        </Button>
                        <Button
                          onClick={() => goToMove(Math.min(loaded.moves.length - 1, currentIndex + 1))}
                          isDisabled={!canStepForward}
                        >
                          Next
                        </Button>
                        <Button onClick={() => goToMove(loaded.moves.length - 1)} isDisabled={!loaded}>
                          Latest
                        </Button>
                      </ButtonGroup>
                      <Text fontSize="sm" color={mutedText} mt={3}>
                        Viewing move {currentIndex >= 0 ? currentIndex + 1 : 0} of {loaded.moves.length}
                      </Text>
                    </Box>
                    <Box>
                      <Heading size="sm" mb={2}>
                        Move list
                      </Heading>
                      <Stack spacing={2} maxH="260px" overflowY="auto">
                        {moves.map((move, index) => (
                          <Box
                            key={move.id}
                            borderWidth="1px"
                          borderColor={currentIndex === index ? highlightBorder : cardBorder}
                            borderRadius="md"
                            px={3}
                            py={2}
                            cursor="pointer"
                            onClick={() => goToMove(index)}
                          >
                            <HStack justify="space-between" align="center">
                              <Text fontWeight="semibold" fontSize="sm">
                                {index + 1}. {move.action?.kind === 'santorini.move' ? `Action ${move.action.move}` : 'Move'}
                              </Text>
                              <Text fontSize="xs" color={helperText}>
                                {new Date(move.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            </HStack>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                    <EvaluationPanel
                      loading={santorini.loading}
                      evaluation={santorini.evaluation}
                      topMoves={santorini.topMoves}
                      calcOptionsBusy={santorini.calcOptionsBusy}
                      refreshEvaluation={santorini.controls.refreshEvaluation}
                      calculateOptions={santorini.controls.calculateOptions}
                      updateDepth={santorini.controls.updateCalcDepth}
                    />
                  </Stack>
                </Box>
              </Flex>
            </CardBody>
          </Card>
        </Stack>
      )}
    </Stack>
  );
}

export default AnalyzeWorkspace;
