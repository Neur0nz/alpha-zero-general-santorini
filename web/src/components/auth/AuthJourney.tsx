import {
  Avatar,
  Box,
  Button,
  HStack,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Spinner,
  Text,
  Tooltip,
  useBoolean,
  useToast,
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import GoogleIcon from '@components/auth/GoogleIcon';
import type { SupabaseAuthState } from '@hooks/useSupabaseAuth';

interface AuthJourneyProps {
  auth: SupabaseAuthState;
}

function AuthJourney({ auth }: AuthJourneyProps) {
  const { profile, session, loading, error, isConfigured, signInWithGoogle, signOut, refreshProfile } = auth;
  const toast = useToast();
  const [signingOut, setSigningOut] = useBoolean(false);
  const [retrying, setRetrying] = useBoolean(false);

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      toast({ title: 'Redirecting to Google', status: 'info' });
    } catch (signInError) {
      toast({
        title: 'Google sign-in failed',
        status: 'error',
        description: signInError instanceof Error ? signInError.message : 'Unable to start Google authentication.',
      });
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

  const handleRetry = async () => {
    setRetrying.on();
    try {
      await refreshProfile();
    } catch (retryError) {
      toast({
        title: 'Unable to refresh profile',
        status: 'error',
        description: retryError instanceof Error ? retryError.message : 'Please try again later.',
      });
    } finally {
      setRetrying.off();
    }
  };

  if (!isConfigured) {
    return (
      <Tooltip label="Online play is disabled until Supabase is configured." hasArrow>
        <Button size="sm" variant="outline" isDisabled>
          Sign in
        </Button>
      </Tooltip>
    );
  }

  if (loading && session) {
    return (
      <Button size="sm" variant="outline" isLoading loadingText="Loading">
        Loading
      </Button>
    );
  }

  if (!profile) {
    const signInButton = (
      <Button
        size="sm"
        bg="white"
        color="gray.800"
        leftIcon={<GoogleIcon boxSize={4} />}
        onClick={handleGoogleSignIn}
        _hover={{ bg: 'whiteAlpha.900', transform: 'translateY(-1px)', boxShadow: 'lg' }}
        _active={{ bg: 'whiteAlpha.800' }}
      >
        Sign in with Google
      </Button>
    );

    return error ? (
      <Tooltip label={error} hasArrow>
        {signInButton}
      </Tooltip>
    ) : (
      signInButton
    );
  }

  const avatarUrl = typeof session?.user.user_metadata?.avatar_url === 'string' ? session.user.user_metadata.avatar_url : undefined;
  const email = session?.user.email;

  return (
    <Menu placement="bottom-end" closeOnSelect={false}>
      <MenuButton
        as={Button}
        size="sm"
        variant="outline"
        px={3}
        py={2}
        _hover={{ bg: 'whiteAlpha.200', transform: 'translateY(-1px)' }}
        _active={{ bg: 'whiteAlpha.300' }}
      >
        <HStack spacing={2} align="center">
          <Avatar size="xs" name={profile.display_name} src={avatarUrl} />
          <Text fontSize="sm" fontWeight="semibold">
            {profile.display_name}
          </Text>
          <ChevronDownIcon />
        </HStack>
      </MenuButton>
      <MenuList bg="gray.900" borderColor="whiteAlpha.200" minW="56">
        <Box px={3} py={2} display="flex" flexDir="column" gap={1}>
          <Text fontSize="xs" textTransform="uppercase" color="whiteAlpha.600" letterSpacing="wide">
            Signed in
          </Text>
          <Text fontWeight="semibold">{profile.display_name}</Text>
          {email && (
            <Text fontSize="sm" color="whiteAlpha.700">
              {email}
            </Text>
          )}
        </Box>
        <MenuDivider borderColor="whiteAlpha.200" />
        {error && (
          <MenuItem onClick={handleRetry} isDisabled={retrying} _hover={{ bg: 'whiteAlpha.200' }}>
            <HStack spacing={3} align="center">
              {retrying && <Spinner size="sm" />}
              <Text>{retrying ? 'Refreshing…' : 'Retry profile sync'}</Text>
            </HStack>
          </MenuItem>
        )}
        <MenuItem onClick={handleSignOut} isDisabled={signingOut} _hover={{ bg: 'whiteAlpha.200' }}>
          <HStack spacing={3} align="center">
            {signingOut && <Spinner size="sm" />}
            <Text>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
          </HStack>
        </MenuItem>
      </MenuList>
    </Menu>
  );
}

export default AuthJourney;
