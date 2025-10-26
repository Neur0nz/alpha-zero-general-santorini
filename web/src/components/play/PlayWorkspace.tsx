import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Avatar,
  Badge,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardBody,
  CardHeader,
  Center,
  Flex,
  FormControl,
  FormLabel,
  FormErrorMessage,
  FormHelperText,
  Grid,
  GridItem,
  Heading,
  HStack,
  Input,
  List,
  ListItem,
  Radio,
  RadioGroup,
  Spinner,
  Stack,
  Switch,
  Text,
  Tooltip,
  VStack,
  useBoolean,
  useToast,
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import type { SupabaseAuthState } from '@hooks/useSupabaseAuth';
import { useMatchLobby, type CreateMatchPayload, type LobbyMatch } from '@hooks/useMatchLobby';
import { useOnlineSantorini } from '@hooks/useOnlineSantorini';
import GameBoard from '@components/GameBoard';
import GoogleIcon from '@components/auth/GoogleIcon';
import type { SantoriniMoveAction } from '@/types/match';
import { generateDisplayName, validateDisplayName } from '@/utils/generateDisplayName';

function formatDate(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MatchCreationForm({
  onCreate,
  loading,
}: {
  onCreate: (payload: CreateMatchPayload) => Promise<void>;
  loading: boolean;
}) {
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [rated, setRated] = useState(true);
  const [hasClock, setHasClock] = useState(true);
  const [minutes, setMinutes] = useState(10);
  const [increment, setIncrement] = useState(5);
  const toast = useToast();

  const handleSubmit = async () => {
    try {
      await onCreate({
        visibility,
        rated,
        hasClock,
        clockInitialMinutes: minutes,
        clockIncrementSeconds: increment,
      });
      toast({ title: 'Match created', status: 'success' });
    } catch (error) {
      toast({
        title: 'Unable to create match',
        status: 'error',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  return (
    <Card bg="whiteAlpha.100" borderWidth="1px" borderColor="whiteAlpha.200">
      <CardHeader>
        <Heading size="md">Create a match</Heading>
      </CardHeader>
      <CardBody as={Stack} spacing={4}>
        <FormControl as={Stack} spacing={2}>
          <FormLabel fontSize="sm">Visibility</FormLabel>
          <RadioGroup value={visibility} onChange={(value) => setVisibility(value as 'public' | 'private')}>
            <HStack spacing={4}>
              <Radio value="public">Public lobby</Radio>
              <Radio value="private">Private code</Radio>
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
        <Button colorScheme="teal" leftIcon={<AddIcon />} onClick={handleSubmit} isLoading={loading} alignSelf="flex-start">
          Create match
        </Button>
      </CardBody>
    </Card>
  );
}

function PublicLobbies({
  matches,
  loading,
  onJoin,
}: {
  matches: LobbyMatch[];
  loading: boolean;
  onJoin: (id: string) => Promise<LobbyMatch>;
}) {
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const toast = useToast();

  const handleJoin = async (id: string) => {
    setJoiningId(id);
    try {
      await onJoin(id);
      toast({ title: 'Joined match', status: 'success' });
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
    <Card bg="whiteAlpha.100" borderWidth="1px" borderColor="whiteAlpha.200">
      <CardHeader>
        <Heading size="md">Open public lobbies</Heading>
      </CardHeader>
      <CardBody>
        {loading ? (
          <Center py={8}>
            <Spinner />
          </Center>
        ) : matches.length === 0 ? (
          <Text color="whiteAlpha.700">No public games are waiting right now.</Text>
        ) : (
          <List spacing={3}>
            {matches.map((match) => (
              <ListItem
                key={match.id}
                borderWidth="1px"
                borderColor="whiteAlpha.200"
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
                  <Text fontSize="sm" color="whiteAlpha.700">
                    {match.opponent ? `Facing ${match.opponent.display_name}` : 'Waiting for an opponent'} ·
                    {' '}
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

function ActiveMatchPanel({
  match,
  role,
  moves,
  joinCode,
  onSubmitMove,
  onLeave,
  onOfferRematch,
}: {
  match: LobbyMatch | null;
  role: 'creator' | 'opponent' | null;
  moves: ReturnType<typeof useMatchLobby>['moves'];
  joinCode: string | null;
  onSubmitMove: ReturnType<typeof useMatchLobby>['submitMove'];
  onLeave: () => Promise<void>;
  onOfferRematch: ReturnType<typeof useMatchLobby>['offerRematch'];
}) {
  const toast = useToast();
  const [offerBusy, setOfferBusy] = useBoolean();
  const [leaveBusy, setLeaveBusy] = useBoolean();
  const lobbyMatch = match ?? null;
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
  const santorini = useOnlineSantorini({
    match: lobbyMatch,
    role,
    moves: typedMoves,
    onSubmitMove,
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
      await onLeave();
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
    <Card bg="whiteAlpha.100" borderWidth="1px" borderColor="whiteAlpha.200" w="100%">
      <CardHeader>
        <Flex justify="space-between" align="center">
          <Stack spacing={1}>
            <Heading size="md">Active match</Heading>
            {lobbyMatch && (
              <Text fontSize="sm" color="whiteAlpha.700">
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
            <Badge colorScheme={lobbyMatch?.rated ? 'purple' : 'gray'}>
              {lobbyMatch?.rated ? 'Rated' : 'Casual'}
            </Badge>
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
            <Text color="whiteAlpha.700">Select or create a match to begin.</Text>
          </Center>
        ) : (
          <Grid templateColumns={{ base: '1fr', xl: '1.2fr 0.8fr' }} gap={8} alignItems="flex-start">
            <GridItem>
              <VStack spacing={4} align="stretch">
                <Box
                  bg="blackAlpha.400"
                  borderRadius="xl"
                  borderWidth="1px"
                  borderColor="whiteAlpha.200"
                  p={{ base: 2, md: 3 }}
                  display="flex"
                  justifyContent="center"
                >
                  <GameBoard
                    board={santorini.board}
                    selectable={santorini.selectable}
                    onCellClick={santorini.onCellClick}
                    onCellHover={santorini.onCellHover}
                    onCellLeave={santorini.onCellLeave}
                    buttons={santorini.buttons}
                    undo={santorini.undo}
                    redo={santorini.redo}
                  />
                </Box>
                <HStack spacing={4} justify="space-between" w="100%">
                  <VStack spacing={1} align="flex-start">
                    <Text fontSize="sm" color="whiteAlpha.700">
                      {role === 'creator' ? 'Your clock' : 'Player 1 (Blue)'}
                    </Text>
                    <Heading size="lg" color={creatorTurnActive ? 'teal.200' : 'whiteAlpha.900'}>
                      {creatorClock}
                    </Heading>
                    <Text fontSize="xs" color="whiteAlpha.600">{creatorName}</Text>
                  </VStack>
                  <VStack spacing={1} align="flex-end">
                    <Text fontSize="sm" color="whiteAlpha.700" textAlign="right">
                      {role === 'opponent' ? 'Your clock' : 'Player 2 (Red)'}
                    </Text>
                    <Heading size="lg" color={opponentTurnActive ? 'teal.200' : 'whiteAlpha.900'}>
                      {opponentClock}
                    </Heading>
                    <Text fontSize="xs" color="whiteAlpha.600">{opponentName}</Text>
                  </VStack>
                </HStack>
              </VStack>
            </GridItem>
            <GridItem>
              <Stack spacing={6}>
                <Box>
                  <Heading size="sm" mb={3}>
                    Match status
                  </Heading>
                  <Text fontSize="sm" color="whiteAlpha.800">
                    {role === 'creator'
                      ? 'You are playing as Player 1 (Blue)'
                      : role === 'opponent'
                      ? 'You are playing as Player 2 (Red)'
                      : 'Spectating this match'}
                  </Text>
                  <Text fontSize="sm" color="whiteAlpha.600">
                    {typedMoves.length} moves played · Turn:{' '}
                    {santorini.currentTurn === 'creator'
                      ? `Player 1 (Blue) – ${creatorName}`
                      : `Player 2 (Red) – ${opponentName}`}
                  </Text>
                </Box>
                <Box>
                  <Heading size="sm" mb={3}>
                    Recent moves
                  </Heading>
                  {santorini.history.length === 0 ? (
                    <Text color="whiteAlpha.700" fontSize="sm">
                      No moves yet. Use the board to make the first move.
                    </Text>
                  ) : (
                    <Stack spacing={2} maxH="220px" overflowY="auto">
                      {[...santorini.history]
                        .slice()
                        .reverse()
                        .map((entry, index) => (
                          <Box key={`${entry.action}-${index}`} borderBottomWidth="1px" borderColor="whiteAlpha.200" pb={2}>
                            <Text fontWeight="semibold" fontSize="sm">
                              Move {santorini.history.length - index}
                            </Text>
                            <Text fontSize="sm" color="whiteAlpha.700">
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

function AuthGate({ auth }: { auth: SupabaseAuthState }) {
  const {
    profile,
    session,
    loading,
    error,
    isConfigured,
    signInWithGoogle,
    signOut,
    updateDisplayName,
    refreshProfile,
  } = auth;
  const [savingName, setSavingName] = useBoolean(false);
  const [startingGoogle, setStartingGoogle] = useBoolean(false);
  const [signingOut, setSigningOut] = useBoolean(false);
  const [retrying, setRetrying] = useBoolean(false);
  const [displayNameValue, setDisplayNameValue] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (profile) {
      setDisplayNameValue(profile.display_name);
      setNameError(null);
    } else {
      setDisplayNameValue('');
      setNameError(null);
    }
  }, [profile]);

  const handleGoogleSignIn = async () => {
    try {
      setStartingGoogle.on();
      await signInWithGoogle();
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

  const handleGenerateName = () => {
    const suggestion = generateDisplayName(session?.user.email ?? profile?.display_name);
    setDisplayNameValue(suggestion);
    setNameError(null);
  };

  const handleSaveName = async () => {
    const validationError = validateDisplayName(displayNameValue);
    if (validationError) {
      setNameError(validationError);
      return;
    }

    setSavingName.on();
    try {
      await updateDisplayName(displayNameValue);
      toast({ title: 'Display name updated', status: 'success' });
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : 'Unable to update display name.';
      setNameError(message);
      toast({ title: 'Update failed', status: 'error', description: message });
    } finally {
      setSavingName.off();
    }
  };

  const handleRetry = async () => {
    setRetrying.on();
    try {
      await refreshProfile();
    } catch (retryError) {
      toast({
        title: 'Unable to refresh',
        status: 'error',
        description: retryError instanceof Error ? retryError.message : 'Please try again later.',
      });
    } finally {
      setRetrying.off();
    }
  };

  const handleSignOut = async () => {
    setSigningOut.on();
    try {
      await signOut();
      toast({ title: 'Signed out', status: 'info' });
    } catch (signOutError) {
      toast({
        title: 'Sign-out failed',
        status: 'error',
        description: signOutError instanceof Error ? signOutError.message : 'Unable to sign out right now.',
      });
    } finally {
      setSigningOut.off();
    }
  };

  if (loading) {
    return (
      <Center py={20}>
        <Spinner size="lg" />
      </Center>
    );
  }

  if (!isConfigured) {
    return (
      <Alert status="warning" borderRadius="md">
        <AlertIcon />
        <Box>
          <AlertTitle>Supabase not configured</AlertTitle>
          <AlertDescription>
            Online play and authentication are disabled. Follow SUPABASE_SETUP.md to configure Supabase before signing
            in.
          </AlertDescription>
        </Box>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert status="error" borderRadius="md" alignItems="flex-start">
        <AlertIcon />
        <Box flex="1">
          <AlertTitle>Authentication issue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <Stack direction={{ base: 'column', sm: 'row' }} spacing={3} mt={4}>
            <Button size="sm" colorScheme="teal" onClick={handleRetry} isLoading={retrying}>
              Try again
            </Button>
            {session && (
              <Button size="sm" variant="outline" onClick={handleSignOut}>
                Sign out
              </Button>
            )}
          </Stack>
        </Box>
      </Alert>
    );
  }

  if (!profile) {
    return (
      <Card bg="whiteAlpha.100" borderWidth="1px" borderColor="whiteAlpha.200" w="100%">
        <CardBody as={Stack} spacing={6} align="center" textAlign="center" py={{ base: 8, md: 10 }}>
          <Stack spacing={2} maxW="lg">
            <Heading size="md">Sign in with Google to play online</Heading>
            <Text color="whiteAlpha.800">
              Challenge real opponents, protect your rating, and sync your Santorini journey across every device.
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
            _hover={{ bg: 'whiteAlpha.900', transform: 'translateY(-1px)', boxShadow: '2xl' }}
            _active={{ bg: 'whiteAlpha.800' }}
          >
            Continue with Google
          </Button>
          <Text fontSize="sm" color="whiteAlpha.700" maxW="md">
            After connecting, you&rsquo;ll be able to choose a unique display name that other players will see.
          </Text>
        </CardBody>
      </Card>
    );
  }

  const displayNameChanged = Boolean(profile && displayNameValue.trim() !== profile.display_name);

  return (
    <Card bg="whiteAlpha.100" borderWidth="1px" borderColor="whiteAlpha.200" w="100%">
      <CardBody as={Stack} spacing={6}>
        <Flex
          justify="space-between"
          align={{ base: 'stretch', md: 'center' }}
          direction={{ base: 'column', md: 'row' }}
          gap={{ base: 4, md: 6 }}
        >
          <HStack spacing={4} align="center">
            <Avatar
              size="lg"
              name={profile.display_name}
              src={typeof session?.user.user_metadata?.avatar_url === 'string' ? session.user.user_metadata.avatar_url : undefined}
            />
            <Box>
              <Heading size="sm">{profile.display_name}</Heading>
              {session?.user.email && (
                <Text fontSize="sm" color="whiteAlpha.700">
                  {session.user.email}
                </Text>
              )}
              <Text fontSize="sm" color="whiteAlpha.700">
                Connected with Google
              </Text>
              <HStack spacing={2} mt={3} flexWrap="wrap">
                <Badge colorScheme="teal" variant="subtle" px={2} py={1} borderRadius="md">
                  Rating: {profile.rating}
                </Badge>
                <Badge colorScheme="blue" variant="subtle" px={2} py={1} borderRadius="md">
                  Games: {profile.games_played}
                </Badge>
              </HStack>
            </Box>
          </HStack>
          <Button
            variant="outline"
            size="sm"
            alignSelf={{ base: 'flex-start', md: 'auto' }}
            onClick={handleSignOut}
            isLoading={signingOut}
            isDisabled={signingOut}
          >
            Sign out
          </Button>
        </Flex>
        <Stack spacing={3}>
          <FormControl isInvalid={Boolean(nameError)}>
            <FormLabel>Display name</FormLabel>
            <Input
              value={displayNameValue}
              onChange={(event) => {
                const next = event.target.value;
                setDisplayNameValue(next);
                setNameError(validateDisplayName(next));
              }}
              placeholder="Choose how other players see you"
            />
            {nameError ? (
              <FormErrorMessage>{nameError}</FormErrorMessage>
            ) : (
              <FormHelperText color="whiteAlpha.700">
                Your public username. Shareable across matches.
              </FormHelperText>
            )}
          </FormControl>
          <HStack spacing={3} align="flex-start">
            <Button
              colorScheme="teal"
              onClick={handleSaveName}
              isDisabled={!displayNameChanged}
              isLoading={savingName}
            >
              Save
            </Button>
            <Button variant="outline" onClick={handleGenerateName} isDisabled={savingName}>
              Generate suggestion
            </Button>
          </HStack>
        </Stack>
      </CardBody>
    </Card>
  );
}

function PlayWorkspace({ auth }: { auth: SupabaseAuthState }) {
  const lobby = useMatchLobby(auth.profile);
  const [joiningCode, setJoiningCode] = useState('');
  const toast = useToast();

  const handleCreate = async (payload: CreateMatchPayload) => {
    await lobby.createMatch(payload);
  };

  const handleJoinByCode = async () => {
    if (!joiningCode) return;
    try {
      await lobby.joinMatch(joiningCode.trim());
      toast({ title: 'Match ready', status: 'success' });
      setJoiningCode('');
    } catch (error) {
      toast({
        title: 'Unable to join',
        status: 'error',
        description: error instanceof Error ? error.message : 'Invalid code or match unavailable.',
      });
    }
  };

  return (
    <Stack spacing={6} py={{ base: 6, md: 10 }}>
      <AuthGate auth={auth} />
      {auth.profile && (
        <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={6} alignItems="flex-start">
          <GridItem>
            <Stack spacing={6}>
              <MatchCreationForm onCreate={handleCreate} loading={lobby.loading} />
              <Card bg="whiteAlpha.100" borderWidth="1px" borderColor="whiteAlpha.200">
                <CardHeader>
                  <Heading size="md">Join by code</Heading>
                </CardHeader>
                <CardBody>
                  <Stack spacing={3}>
                    <Text fontSize="sm" color="whiteAlpha.700">
                      Enter a private code or match ID to join a friend.
                    </Text>
                    <HStack spacing={3}>
                      <Input
                        placeholder="ABC123"
                        value={joiningCode}
                        onChange={(event) => setJoiningCode(event.target.value.toUpperCase())}
                      />
                      <Button colorScheme="teal" onClick={handleJoinByCode} isDisabled={!joiningCode}>
                        Join
                      </Button>
                    </HStack>
                  </Stack>
                </CardBody>
              </Card>
            </Stack>
          </GridItem>
          <GridItem>
            <PublicLobbies matches={lobby.matches} loading={lobby.loading} onJoin={lobby.joinMatch} />
          </GridItem>
        </Grid>
      )}
      {auth.profile && (
        <ActiveMatchPanel
          match={lobby.activeMatch}
          role={lobby.activeRole}
          moves={lobby.moves}
          joinCode={lobby.joinCode}
          onSubmitMove={lobby.submitMove}
          onLeave={lobby.leaveMatch}
          onOfferRematch={lobby.offerRematch}
        />
      )}
    </Stack>
  );
}

export default PlayWorkspace;
