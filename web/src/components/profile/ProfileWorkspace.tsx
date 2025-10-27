import { useEffect, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  Center,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Heading,
  HStack,
  Input,
  Spinner,
  Stack,
  Text,
  useBoolean,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import GoogleIcon from '@components/auth/GoogleIcon';
import type { SupabaseAuthState } from '@hooks/useSupabaseAuth';
import { generateDisplayName, validateDisplayName } from '@/utils/generateDisplayName';

function useSurfaceTokens() {
  const cardBg = useColorModeValue('white', 'whiteAlpha.100');
  const cardBorder = useColorModeValue('gray.200', 'whiteAlpha.200');
  const mutedText = useColorModeValue('gray.600', 'whiteAlpha.700');
  const helperText = useColorModeValue('gray.500', 'whiteAlpha.600');
  const accentHeading = useColorModeValue('teal.600', 'teal.200');
  return { cardBg, cardBorder, mutedText, helperText, accentHeading };
}

interface ProfileWorkspaceProps {
  auth: SupabaseAuthState;
}

function ProfileWorkspace({ auth }: ProfileWorkspaceProps) {
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
  const googleHoverBg = useColorModeValue('gray.100', 'whiteAlpha.300');
  const googleActiveBg = useColorModeValue('gray.200', 'whiteAlpha.200');
  const { cardBg, cardBorder, mutedText, helperText, accentHeading } = useSurfaceTokens();

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
            Online play and authentication are disabled. Follow SUPABASE_SETUP.md to configure Supabase before signing in.
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
      <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder} w="100%">
        <CardBody as={Stack} spacing={6} align="center" textAlign="center" py={{ base: 8, md: 10 }}>
          <Stack spacing={2} maxW="lg">
            <Heading size="md">Sign in with Google to play online</Heading>
            <Text color={mutedText}>
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
            _hover={{ bg: googleHoverBg, transform: 'translateY(-1px)', boxShadow: '2xl' }}
            _active={{ bg: googleActiveBg }}
          >
            Continue with Google
          </Button>
          <Text fontSize="sm" color={mutedText} maxW="md">
            After connecting, you&rsquo;ll be able to choose a unique display name that other players will see.
          </Text>
        </CardBody>
      </Card>
    );
  }

  const displayNameChanged = Boolean(profile && displayNameValue.trim() !== profile.display_name);

  return (
    <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder} w="100%">
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
                <Text fontSize="sm" color={mutedText}>
                  {session.user.email}
                </Text>
              )}
              <Text fontSize="sm" color={mutedText}>
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
              <FormHelperText color={helperText}>Your public username. Shareable across matches.</FormHelperText>
            )}
          </FormControl>
          <HStack spacing={3} align="flex-start">
            <Button colorScheme="teal" onClick={handleSaveName} isDisabled={!displayNameChanged} isLoading={savingName}>
              Save
            </Button>
            <Button variant="outline" onClick={handleGenerateName} isDisabled={savingName}>
              Generate suggestion
            </Button>
          </HStack>
        </Stack>
        <Stack spacing={2}>
          <Heading size="sm" color={accentHeading}>
            Account security
          </Heading>
          <Text fontSize="sm" color={mutedText}>
            You&rsquo;re signed in with Google. If you revoke access, you&rsquo;ll need to reconnect to play online and keep your rating in
            sync across devices.
          </Text>
        </Stack>
      </CardBody>
    </Card>
  );
}

export default ProfileWorkspace;
