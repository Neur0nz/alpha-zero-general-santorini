import {
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  Flex,
  HStack,
  Stack,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { ChevronRightIcon } from '@chakra-ui/icons';
import type { LobbyMatch } from '@hooks/useMatchLobby';
import type { PlayerProfile } from '@/types/match';

interface ActiveGameSwitcherProps {
  matches: LobbyMatch[];
  activeMatchId: string | null;
  profile: PlayerProfile | null;
  onSelectMatch: (matchId: string) => void;
}

function formatMatchTitle(match: LobbyMatch, profile: PlayerProfile | null): string {
  const isCreator = profile ? match.creator_id === profile.id : false;
  const opponentName = isCreator ? match.opponent?.display_name : match.creator?.display_name;
  return `vs ${opponentName || 'Opponent'}`;
}

function ActiveGameSwitcher({ matches, activeMatchId, profile, onSelectMatch }: ActiveGameSwitcherProps) {
  const cardBg = useColorModeValue('white', 'whiteAlpha.100');
  const cardBorder = useColorModeValue('gray.200', 'whiteAlpha.200');
  const activeGameBg = useColorModeValue('teal.50', 'teal.900');
  const activeGameBorder = useColorModeValue('teal.300', 'teal.600');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.200');
  const mutedText = useColorModeValue('gray.600', 'whiteAlpha.700');

  // Filter to only in-progress matches
  const activeGames = matches.filter((m) => m.status === 'in_progress');

  if (activeGames.length === 0) {
    return null;
  }

  return (
    <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder} w="100%">
      <CardBody py={3}>
        <Stack spacing={2}>
          <Text fontSize="sm" fontWeight="semibold" color={mutedText} px={2}>
            Your Active Games ({activeGames.length})
          </Text>
          <Flex
            direction={{ base: 'column', md: 'row' }}
            gap={2}
            overflowX={{ base: 'visible', md: 'auto' }}
            pb={{ base: 0, md: 2 }}
          >
            {activeGames.map((match) => {
              const isActive = match.id === activeMatchId;
              const isCreator = profile ? match.creator_id === profile.id : false;
              const myTurn = isCreator
                ? (match as any).next_player === 'creator'
                : (match as any).next_player === 'opponent';

              return (
                <Button
                  key={match.id}
                  onClick={() => onSelectMatch(match.id)}
                  size="sm"
                  variant="outline"
                  bg={isActive ? activeGameBg : 'transparent'}
                  borderColor={isActive ? activeGameBorder : cardBorder}
                  _hover={{ bg: isActive ? activeGameBg : hoverBg }}
                  flex={{ base: '1', md: '0 0 auto' }}
                  minW={{ base: 'auto', md: '200px' }}
                  justifyContent="space-between"
                  rightIcon={isActive ? <ChevronRightIcon /> : undefined}
                  px={3}
                  py={2}
                  h="auto"
                >
                  <HStack spacing={2} align="center" w="full" justify="space-between">
                    <Stack spacing={0} align="flex-start" flex="1">
                      <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
                        {formatMatchTitle(match, profile)}
                      </Text>
                      {match.clock_initial_seconds > 0 && (
                        <Text fontSize="xs" color={mutedText}>
                          {Math.round(match.clock_initial_seconds / 60)}+{match.clock_increment_seconds}
                        </Text>
                      )}
                    </Stack>
                    {myTurn && (
                      <Badge colorScheme="green" fontSize="xs">
                        Your turn
                      </Badge>
                    )}
                  </HStack>
                </Button>
              );
            })}
          </Flex>
        </Stack>
      </CardBody>
    </Card>
  );
}

export default ActiveGameSwitcher;

