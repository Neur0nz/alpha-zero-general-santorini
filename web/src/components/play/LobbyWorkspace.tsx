import { useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Center,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Radio,
  RadioGroup,
  Spinner,
  Stack,
  Switch,
  Text,
  Tooltip,
  useColorModeValue,
  useDisclosure,
  useToast,
  useBoolean,
} from '@chakra-ui/react';
import { AddIcon, ArrowForwardIcon } from '@chakra-ui/icons';
import type { SupabaseAuthState } from '@hooks/useSupabaseAuth';
import type { CreateMatchPayload, LobbyMatch, StartingPlayer } from '@hooks/useMatchLobby';
import { useMatchLobbyContext } from '@hooks/matchLobbyContext';
import GoogleIcon from '@components/auth/GoogleIcon';
import { useSurfaceTokens } from '@/theme/useSurfaceTokens';

function formatDate(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ActiveGameNotice({ 
  match, 
  onNavigateToPlay 
}: { 
  match: LobbyMatch; 
  onNavigateToPlay: () => void;
}) {
  const { cardBorder } = useSurfaceTokens();
  
  const isWaiting = match.status === 'waiting_for_opponent';
  const opponentName = match.opponent?.display_name || 'an opponent';
  
  return (
    <Alert 
      status="info" 
      variant="left-accent" 
      borderRadius="md"
      borderWidth="1px"
      borderColor={cardBorder}
    >
      <AlertIcon />
      <Stack spacing={1} flex="1">
        <AlertTitle>
          {isWaiting ? 'Waiting for opponent' : 'Game in progress'}
        </AlertTitle>
        <AlertDescription>
          {isWaiting 
            ? 'Your game is waiting for an opponent to join. You cannot create new games until this one starts or is cancelled.'
            : `You're playing against ${opponentName}. Finish this game before starting a new one.`
          }
        </AlertDescription>
      </Stack>
      <Button 
        colorScheme="teal" 
        size="sm"
        onClick={onNavigateToPlay}
        rightIcon={<ArrowForwardIcon />}
      >
        {isWaiting ? 'View game' : 'Continue game'}
      </Button>
    </Alert>
  );
}

function LobbyHero({
  onQuickMatch,
  quickMatchLoading,
  onOpenCreate,
  onOpenJoin,
  hasActiveGame,
}: {
  onQuickMatch: () => Promise<void>;
  quickMatchLoading: boolean;
  onOpenCreate: () => void;
  onOpenJoin: () => void;
  hasActiveGame: boolean;
}) {
  const gradientBg = useColorModeValue('linear(to-r, teal.100, teal.300)', 'linear(to-r, teal.700, teal.500)');
  const frameBorder = useColorModeValue('teal.200', 'teal.500');
  const bodyColor = useColorModeValue('gray.900', 'whiteAlpha.900');
  const helperText = useColorModeValue('teal.900', 'teal.50');

  return (
    <Card bgGradient={gradientBg} borderWidth="1px" borderColor={frameBorder} color={bodyColor} shadow="lg">
      <CardBody>
        <Stack spacing={6}>
          <Stack spacing={2}>
            <Badge colorScheme="teal" w="fit-content" borderRadius="full" px={3} py={1} fontSize="xs" textTransform="uppercase">
              Online play
            </Badge>
            <Heading size={{ base: 'md', md: 'lg' }}>Jump into a Santorini match</Heading>
            <Text fontSize={{ base: 'sm', md: 'md' }} color={helperText}>
              Play rated matches, create custom games, or join with a friend's code
            </Text>
          </Stack>
          <Stack
            direction={{ base: 'column', sm: 'row' }}
            spacing={{ base: 3, sm: 4 }}
            align={{ base: 'stretch', sm: 'center' }}
            w={{ base: '100%', sm: 'auto' }}
          >
            <Tooltip 
              label={hasActiveGame ? "Finish your current game first" : ""} 
              isDisabled={!hasActiveGame}
              hasArrow
            >
              <Button
                size="lg"
                colorScheme="teal"
                rightIcon={<ArrowForwardIcon />}
                onClick={onQuickMatch}
                isLoading={quickMatchLoading}
                isDisabled={hasActiveGame || quickMatchLoading}
                w={{ base: '100%', sm: 'auto' }}
                whiteSpace="normal"
                height="auto"
                textAlign="center"
                px={{ base: 4, sm: 6 }}
              >
                Start quick match
              </Button>
            </Tooltip>
            <Tooltip 
              label={hasActiveGame ? "Finish your current game first" : ""} 
              isDisabled={!hasActiveGame}
              hasArrow
            >
              <Button
                size="lg"
                variant="outline"
                leftIcon={<AddIcon />}
                onClick={onOpenCreate}
                isDisabled={hasActiveGame}
                w={{ base: '100%', sm: 'auto' }}
                whiteSpace="normal"
                height="auto"
                textAlign="center"
                px={{ base: 4, sm: 6 }}
              >
                Custom match
              </Button>
            </Tooltip>
            <Button
              size="lg"
              variant="ghost"
              onClick={onOpenJoin}
              w={{ base: '100%', sm: 'auto' }}
              whiteSpace="normal"
              height="auto"
              textAlign="center"
              px={{ base: 4, sm: 6 }}
            >
              Join by code
            </Button>
          </Stack>
        </Stack>
      </CardBody>
    </Card>
  );
}

function MatchCreationModal({
  isOpen,
  onClose,
  onCreate,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (payload: CreateMatchPayload) => Promise<void>;
  loading: boolean;
}) {
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [rated, setRated] = useState(true);
  const [hasClock, setHasClock] = useState(true);
  const [minutes, setMinutes] = useState(10);
  const [increment, setIncrement] = useState(5);
  const [startingPlayer, setStartingPlayer] = useState<StartingPlayer>('random');
  const toast = useToast();
  const { mutedText } = useSurfaceTokens();

  const handleSubmit = async () => {
    try {
      await onCreate({
        visibility,
        rated,
        hasClock,
        clockInitialMinutes: minutes,
        clockIncrementSeconds: increment,
        startingPlayer,
      });
      toast({ title: 'Match created successfully!', status: 'success' });
      onClose();
    } catch (error) {
      toast({
        title: 'Unable to create match',
        status: 'error',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Create New Match</ModalHeader>
        <ModalCloseButton />
        <ModalBody as={Stack} spacing={4}>
          <FormControl as={Stack} spacing={2}>
            <FormLabel fontSize="sm">Visibility</FormLabel>
            <RadioGroup value={visibility} onChange={(value) => setVisibility(value as 'public' | 'private')}>
              <HStack spacing={4}>
                <Radio value="public">Public lobby</Radio>
                <Radio value="private">Private code</Radio>
              </HStack>
            </RadioGroup>
          </FormControl>
          <FormControl as={Stack} spacing={2}>
            <FormLabel fontSize="sm">Starting player</FormLabel>
            <RadioGroup value={startingPlayer} onChange={(value) => setStartingPlayer(value as StartingPlayer)}>
              <HStack spacing={4}>
                <Radio value="creator">You</Radio>
                <Radio value="opponent">Opponent</Radio>
                <Radio value="random">Random</Radio>
              </HStack>
            </RadioGroup>
          </FormControl>
          <FormControl display="flex" alignItems="center" justifyContent="space-between">
            <FormLabel htmlFor="rated-switch" mb="0">
              Rated game (affects ELO)
            </FormLabel>
            <Switch id="rated-switch" isChecked={rated} onChange={(event) => setRated(event.target.checked)} />
          </FormControl>
          <FormControl display="flex" flexDir="column" gap={3}>
            <HStack justify="space-between">
              <FormLabel htmlFor="clock-switch" mb="0">
                Enable clock
              </FormLabel>
              <Switch id="clock-switch" isChecked={hasClock} onChange={(event) => setHasClock(event.target.checked)} />
            </HStack>
            {hasClock && (
              <Stack direction={{ base: 'column', md: 'row' }} spacing={3}>
                <FormControl>
                  <FormLabel fontSize="sm">Initial time (minutes)</FormLabel>
                  <Input
                    type="number"
                    min={1}
                    value={minutes}
                    onChange={(event) => setMinutes(Number(event.target.value))}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Increment (seconds)</FormLabel>
                  <Input
                    type="number"
                    min={0}
                    value={increment}
                    onChange={(event) => setIncrement(Number(event.target.value))}
                  />
                </FormControl>
              </Stack>
            )}
          </FormControl>
          <Button colorScheme="teal" onClick={handleSubmit} isDisabled={loading} isLoading={loading} w="full">
            Create Match
          </Button>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onClose} w="full">
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function PublicLobbies({
  matches,
  loading,
  onJoin,
  onAfterJoin,
}: {
  matches: LobbyMatch[];
  loading: boolean;
  onJoin: (id: string) => Promise<LobbyMatch>;
  onAfterJoin?: () => void;
}) {
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const toast = useToast();
  const { cardBg, cardBorder, mutedText } = useSurfaceTokens();

  const handleJoin = async (id: string) => {
    setJoiningId(id);
    try {
      await onJoin(id);
      toast({ title: 'Joined match', status: 'success' });
      onAfterJoin?.();
    } catch (error) {
      toast({
        title: 'Failed to join match',
        status: 'error',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder}>
      <CardHeader>
        <Heading size="md">Public games</Heading>
      </CardHeader>
      <CardBody>
        {loading ? (
          <Center py={8}>
            <Spinner />
          </Center>
        ) : matches.length === 0 ? (
          <Text color={mutedText}>No public games are waiting right now.</Text>
        ) : (
          <List spacing={3}>
            {matches.map((match) => (
              <ListItem
                key={match.id}
                borderWidth="1px"
                borderColor={cardBorder}
                borderRadius="md"
                px={4}
                py={3}
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                gap={4}
              >
                <Box>
                  <HStack spacing={3} align="center">
                    <Heading size="sm">{match.creator?.display_name ?? 'Unknown player'}</Heading>
                    <Badge colorScheme={match.rated ? 'purple' : 'gray'}>{match.rated ? 'Rated' : 'Casual'}</Badge>
                    {match.clock_initial_seconds > 0 && (
                      <Badge colorScheme="blue">
                        {Math.round(match.clock_initial_seconds / 60)}+{match.clock_increment_seconds}
                      </Badge>
                    )}
                  </HStack>
                  <Text fontSize="sm" color={mutedText}>
                    {match.opponent ? `Facing ${match.opponent.display_name}` : 'Waiting for an opponent'} ·{' '}
                    {match.visibility === 'public' ? 'Public lobby' : 'Private code'} · Created {formatDate(match.created_at)}
                  </Text>
                </Box>
                <Button
                  size="sm"
                  colorScheme="teal"
                  onClick={() => handleJoin(match.id)}
                  isLoading={joiningId === match.id}
                >
                  Join
                </Button>
              </ListItem>
            ))}
          </List>
        )}
      </CardBody>
    </Card>
  );
}

function PendingMatches({
  matches,
  profile,
  onSelect,
  onCancel,
  onAfterSelect,
}: {
  matches: LobbyMatch[];
  profile: any;
  onSelect: (matchId: string) => void;
  onCancel: (matchId: string) => Promise<void>;
  onAfterSelect?: () => void;
}) {
  const { cardBg, cardBorder, mutedText } = useSurfaceTokens();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const toast = useToast();

  const handleSelect = (matchId: string) => {
    onSelect(matchId);
    onAfterSelect?.();
  };

  const pendingMatches = matches.filter((m) => m.status === 'waiting_for_opponent');

  if (pendingMatches.length === 0) {
    return null;
  }

  const handleCancel = async (matchId: string) => {
    setCancellingId(matchId);
    try {
      await onCancel(matchId);
      toast({ title: 'Match cancelled', status: 'info' });
    } catch (error) {
      toast({
        title: 'Failed to cancel match',
        status: 'error',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder}>
      <CardHeader>
        <Heading size="md">Your pending matches</Heading>
      </CardHeader>
      <CardBody>
        <Stack spacing={3}>
          {pendingMatches.map((match) => {
            const isCreator = profile ? match.creator_id === profile.id : false;
            return (
              <Box
                key={match.id}
                borderWidth="1px"
                borderColor={cardBorder}
                borderRadius="md"
                px={4}
                py={3}
              >
                <Flex justify="space-between" align="center" gap={4}>
                  <Stack spacing={1} flex="1">
                    <HStack spacing={2}>
                      <Heading size="sm">
                        {isCreator ? 'Waiting for opponent' : 'Joining...'}
                      </Heading>
                      <Badge colorScheme="yellow">Pending</Badge>
                      {match.rated && <Badge colorScheme="purple">Rated</Badge>}
                    </HStack>
                    <Text fontSize="sm" color={mutedText}>
                      {match.visibility === 'private' && match.private_join_code && (
                        <>Code: <strong>{match.private_join_code}</strong> · </>
                      )}
                      Created {formatDate(match.created_at)}
                      {match.clock_initial_seconds > 0 && (
                        <> · {Math.round(match.clock_initial_seconds / 60)}+{match.clock_increment_seconds}</>
                      )}
                    </Text>
                  </Stack>
                  <HStack spacing={2}>
                    <Button size="sm" variant="outline" onClick={() => handleSelect(match.id)}>
                      View
                    </Button>
                    <Button
                      size="sm"
                      colorScheme="red"
                      variant="ghost"
                      onClick={() => handleCancel(match.id)}
                      isLoading={cancellingId === match.id}
                    >
                      Cancel
                    </Button>
                  </HStack>
                </Flex>
              </Box>
            );
          })}
        </Stack>
      </CardBody>
    </Card>
  );
}

function SignInPrompt({ auth }: { auth: SupabaseAuthState }) {
  const [startingGoogle, setStartingGoogle] = useBoolean(false);
  const toast = useToast();
  const googleHoverBg = useColorModeValue('gray.100', 'whiteAlpha.300');
  const googleActiveBg = useColorModeValue('gray.200', 'whiteAlpha.200');
  const { cardBg, cardBorder, mutedText } = useSurfaceTokens();

  const handleGoogleSignIn = async () => {
    try {
      setStartingGoogle.on();
      await auth.signInWithGoogle();
      toast({ title: 'Redirecting to Google', status: 'info' });
    } catch (oauthError) {
      toast({
        title: 'Google sign-in failed',
        status: 'error',
        description: oauthError instanceof Error ? oauthError.message : 'Unable to start Google sign-in.',
      });
    } finally {
      setStartingGoogle.off();
    }
  };

  return (
    <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder} w="100%">
      <CardBody as={Stack} spacing={6} align="center" textAlign="center" py={{ base: 8, md: 10 }}>
        <Stack spacing={2} maxW="lg">
          <Heading size="md">Sign in to join online lobbies</Heading>
          <Text color={mutedText}>
            Challenge real opponents, protect your rating, and sync your Santorini journey across every device.
          </Text>
          <Text color={mutedText}>
            Unlock practice tools, deep analysis, and the global leaderboard to track your climb.
          </Text>
        </Stack>
        <HStack spacing={2} flexWrap="wrap" justify="center">
          <Badge colorScheme="teal" px={3} py={1} borderRadius="full">
            Keep your rating
          </Badge>
          <Badge colorScheme="purple" px={3} py={1} borderRadius="full">
            Save match history
          </Badge>
          <Badge colorScheme="orange" px={3} py={1} borderRadius="full">
            Challenge friends
          </Badge>
        </HStack>
        <Button
          size="lg"
          bg="white"
          color="gray.800"
          leftIcon={<GoogleIcon boxSize={5} />}
          onClick={handleGoogleSignIn}
          isLoading={startingGoogle}
          isDisabled={startingGoogle}
          _hover={{ bg: googleHoverBg, transform: 'translateY(-1px)', boxShadow: '2xl' }}
          _active={{ bg: googleActiveBg }}
        >
          Continue with Google
        </Button>
      </CardBody>
    </Card>
  );
}

function LobbyWorkspace({
  auth,
  onNavigateToPlay,
}: {
  auth: SupabaseAuthState;
  onNavigateToPlay: () => void;
}) {
  const lobby = useMatchLobbyContext();
  const [joiningCode, setJoiningCode] = useState('');
  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onClose: onCreateClose } = useDisclosure();
  const { isOpen: isJoinOpen, onOpen: onJoinOpen, onClose: onJoinClose } = useDisclosure();
  const toast = useToast();
  const [creatingQuickMatch, setCreatingQuickMatch] = useBoolean(false);

  const handleCreate = async (payload: CreateMatchPayload) => {
    try {
      await lobby.createMatch(payload);
      // Navigate to Play tab after creating match
      onNavigateToPlay();
    } catch (error: any) {
      // Re-throw to be caught by the modal's error handling
      if (error.code === 'ACTIVE_GAME_EXISTS') {
        toast({
          title: 'Active game exists',
          description: error.message,
          status: 'warning',
          duration: 5000,
        });
        onCreateClose();
        // Navigate to the active game
        if (error.activeMatchId) {
          lobby.setActiveMatch(error.activeMatchId);
          onNavigateToPlay();
        }
      }
      throw error;
    }
  };

  const handleJoinByCode = async () => {
    if (!joiningCode) return;
    try {
      await lobby.joinMatch(joiningCode.trim());
      toast({ title: 'Match joined successfully!', status: 'success' });
      setJoiningCode('');
      onJoinClose();
      // Navigate to Play tab after joining match
      onNavigateToPlay();
    } catch (error: any) {
      if (error.code === 'ACTIVE_GAME_EXISTS') {
        toast({
          title: 'Active game exists',
          description: error.message,
          status: 'warning',
          duration: 5000,
        });
        onJoinClose();
        // Navigate to the active game
        if (error.activeMatchId) {
          lobby.setActiveMatch(error.activeMatchId);
          onNavigateToPlay();
        }
      } else {
        toast({
          title: 'Unable to join',
          status: 'error',
          description: error instanceof Error ? error.message : 'Invalid code or match unavailable.',
        });
      }
    }
  };

  const handleQuickMatch = async () => {
    setCreatingQuickMatch.on();
    try {
      await handleCreate({
        visibility: 'public',
        rated: false,
        hasClock: false,
        clockInitialMinutes: 0,
        clockIncrementSeconds: 0,
        startingPlayer: 'random',
      });
      toast({
        title: 'Quick match created',
        status: 'success',
        description: 'Casual game posted to the lobby. Waiting for an opponent to join…',
      });
    } catch (error) {
      toast({
        title: 'Quick match failed',
        status: 'error',
        description: error instanceof Error ? error.message : 'Unable to start a new match right now.',
      });
    } finally {
      setCreatingQuickMatch.off();
    }
  };

  if (!auth.profile) {
    return (
      <Stack spacing={6} py={{ base: 6, md: 10 }}>
        <SignInPrompt auth={auth} />
      </Stack>
    );
  }

  // Find the active game (if any)
  const activeGame = lobby.myMatches.find(m => 
    m.status === 'waiting_for_opponent' || m.status === 'in_progress'
  );

  return (
    <Stack spacing={{ base: 6, md: 8 }} py={{ base: 6, md: 10 }}>
      {/* Show active game notice if user has an active game */}
      {activeGame && (
        <ActiveGameNotice 
          match={activeGame} 
          onNavigateToPlay={onNavigateToPlay}
        />
      )}
      
      <LobbyHero
        onQuickMatch={handleQuickMatch}
        quickMatchLoading={creatingQuickMatch}
        onOpenCreate={onCreateOpen}
        onOpenJoin={onJoinOpen}
        hasActiveGame={lobby.hasActiveGame}
      />
      {/* Your Pending Matches */}
      {lobby.myMatches && (
        <PendingMatches
          matches={lobby.myMatches}
          profile={auth.profile}
          onSelect={lobby.setActiveMatch}
          onCancel={lobby.leaveMatch}
          onAfterSelect={onNavigateToPlay}
        />
      )}

      {/* Public Lobbies */}
      <PublicLobbies matches={lobby.matches} loading={lobby.loading} onJoin={lobby.joinMatch} onAfterJoin={onNavigateToPlay} />

      {/* Match Creation Modal */}
      <MatchCreationModal isOpen={isCreateOpen} onClose={onCreateClose} onCreate={handleCreate} loading={lobby.loading} />

      {/* Join by Code Modal */}
      <Modal isOpen={isJoinOpen} onClose={onJoinClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Join by Code</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={3}>
              <Text fontSize="sm" color="gray.500">
                Enter a private join code or match ID to join a friend's game.
              </Text>
              <Input
                placeholder="ABC123"
                value={joiningCode}
                onChange={(event) => setJoiningCode(event.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && handleJoinByCode()}
                autoFocus
              />
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onJoinClose}>
              Cancel
            </Button>
            <Button colorScheme="teal" onClick={handleJoinByCode} isDisabled={!joiningCode}>
              Join Match
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Stack>
  );
}

export default LobbyWorkspace;
