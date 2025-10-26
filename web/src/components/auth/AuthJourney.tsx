import { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  HStack,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { supabase } from '@/lib/supabaseClient';
import { useSupabaseAuth } from '@hooks/useSupabaseAuth';

interface SignInFormState {
  email: string;
  password: string;
}

interface SignUpFormState {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}

type AuthMode = 'signIn' | 'signUp';

const initialSignInState: SignInFormState = {
  email: '',
  password: '',
};

const initialSignUpState: SignUpFormState = {
  email: '',
  username: '',
  password: '',
  confirmPassword: '',
};

function AuthJourney() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [authMode, setAuthMode] = useState<AuthMode>('signIn');
  const [signInState, setSignInState] = useState<SignInFormState>(initialSignInState);
  const [signUpState, setSignUpState] = useState<SignUpFormState>(initialSignUpState);
  const [signInBusy, setSignInBusy] = useState(false);
  const [signUpBusy, setSignUpBusy] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const toast = useToast();
  const { profile, loading, error, signOut } = useSupabaseAuth();

  const openForMode = (mode: AuthMode) => {
    setAuthMode(mode);
    onOpen();
  };

  const handleClose = () => {
    setSignInState(initialSignInState);
    setSignUpState(initialSignUpState);
    onClose();
  };

  const handleSignInSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (!supabase) {
      toast({ title: 'Supabase not configured', status: 'error' });
      return;
    }

    setSignInBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: signInState.email,
        password: signInState.password,
      });

      if (signInError) {
        throw signInError;
      }

      toast({
        title: 'Signed in',
        description: `Welcome back, ${signInState.email}!`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      handleClose();
    } catch (signInError) {
      toast({
        title: 'Sign-in failed',
        description:
          signInError instanceof Error ? signInError.message : 'Unable to sign in with these credentials.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setSignInBusy(false);
    }
  };

  const handleSignUpSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    if (signUpState.password !== signUpState.confirmPassword) {
      toast({
        title: 'Passwords do not match',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
      return;
    }

    if (!supabase) {
      toast({ title: 'Supabase not configured', status: 'error' });
      return;
    }

    setSignUpBusy(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: signUpState.email,
        password: signUpState.password,
        options: {
          data: { display_name: signUpState.username },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      toast({
        title: 'Account created',
        description: `Welcome to Ascent, ${signUpState.username || 'new strategist'}! Check your email to confirm your account.`,
        status: 'success',
        duration: 4000,
        isClosable: true,
      });
      handleClose();
    } catch (signUpError) {
      toast({
        title: 'Sign-up failed',
        description:
          signUpError instanceof Error ? signUpError.message : 'Unable to create an account with these details.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setSignUpBusy(false);
    }
  };

  const handleSignOut = async () => {
    setSignOutBusy(true);
    try {
      await signOut();
      toast({ title: 'Signed out', status: 'success', duration: 3000, isClosable: true });
    } catch (signOutError) {
      toast({
        title: 'Sign-out failed',
        description: signOutError instanceof Error ? signOutError.message : 'Unable to sign out right now.',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setSignOutBusy(false);
    }
  };

  return (
    <>
      {profile ? (
        <HStack spacing={3}>
          <Text fontSize="sm" color="whiteAlpha.800">
            Signed in as <Text as="span" fontWeight="semibold">{profile.display_name}</Text>
          </Text>
          <Button size="sm" variant="outline" colorScheme="teal" onClick={handleSignOut} isLoading={signOutBusy}>
            Log out
          </Button>
        </HStack>
      ) : (
        <Button
          size="sm"
          colorScheme="teal"
          variant="solid"
          onClick={() => openForMode('signIn')}
          isLoading={loading}
          isDisabled={Boolean(error)}
        >
          {error ? 'Supabase unavailable' : 'Sign in / Sign up'}
        </Button>
      )}

      <Modal isOpen={isOpen} onClose={handleClose} size="lg" isCentered>
        <ModalOverlay backdropFilter="blur(6px)" />
        <ModalContent bg="gray.900" borderWidth="1px" borderColor="whiteAlpha.200">
          <ModalHeader textAlign="center">
            {authMode === 'signIn' ? 'Sign in to Ascent' : 'Create your Ascent account'}
          </ModalHeader>
          <ModalCloseButton />

          <ModalBody>
            <Tabs
              index={authMode === 'signIn' ? 0 : 1}
              onChange={(index) => setAuthMode(index === 0 ? 'signIn' : 'signUp')}
              isFitted
              variant="soft-rounded"
              colorScheme="teal"
            >
              <TabList mb={4}>
                <Tab>Sign in</Tab>
                <Tab>Sign up</Tab>
              </TabList>

              <TabPanels>
                <TabPanel px={0}>
                  <Box as="form" onSubmit={handleSignInSubmit}>
                    <Stack spacing={4}>
                      <FormControl id="sign-in-email" isRequired>
                        <FormLabel>Email address</FormLabel>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          value={signInState.email}
                          onChange={(event) =>
                            setSignInState((prev) => ({ ...prev, email: event.target.value }))
                          }
                        />
                      </FormControl>
                      <FormControl id="sign-in-password" isRequired>
                        <FormLabel>Password</FormLabel>
                        <Input
                          type="password"
                          placeholder="Enter your password"
                          value={signInState.password}
                          onChange={(event) =>
                            setSignInState((prev) => ({ ...prev, password: event.target.value }))
                          }
                        />
                      </FormControl>
                    </Stack>

                    <ModalFooter px={0} pb={0} mt={6} display="flex" flexDirection="column" gap={3}>
                      <Button type="submit" colorScheme="teal" w="full" isLoading={signInBusy} isDisabled={signInBusy}>
                        Sign in
                      </Button>
                      <Button variant="ghost" w="full" onClick={() => setAuthMode('signUp')}>
                        Need an account? Create one
                      </Button>
                    </ModalFooter>
                  </Box>
                </TabPanel>

                <TabPanel px={0}>
                  <Box as="form" onSubmit={handleSignUpSubmit}>
                    <Stack spacing={4}>
                      <FormControl id="sign-up-email" isRequired>
                        <FormLabel>Email address</FormLabel>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          value={signUpState.email}
                          onChange={(event) =>
                            setSignUpState((prev) => ({ ...prev, email: event.target.value }))
                          }
                        />
                      </FormControl>
                      <FormControl id="sign-up-username" isRequired>
                        <FormLabel>Username</FormLabel>
                        <Input
                          placeholder="Choose a username"
                          value={signUpState.username}
                          onChange={(event) =>
                            setSignUpState((prev) => ({ ...prev, username: event.target.value }))
                          }
                        />
                      </FormControl>
                      <FormControl id="sign-up-password" isRequired>
                        <FormLabel>Password</FormLabel>
                        <Input
                          type="password"
                          placeholder="Create a password"
                          value={signUpState.password}
                          onChange={(event) =>
                            setSignUpState((prev) => ({ ...prev, password: event.target.value }))
                          }
                        />
                      </FormControl>
                      <FormControl id="sign-up-confirm-password" isRequired>
                        <FormLabel>Confirm password</FormLabel>
                        <Input
                          type="password"
                          placeholder="Repeat your password"
                          value={signUpState.confirmPassword}
                          onChange={(event) =>
                            setSignUpState((prev) => ({ ...prev, confirmPassword: event.target.value }))
                          }
                        />
                      </FormControl>
                    </Stack>

                    <ModalFooter px={0} pb={0} mt={6} display="flex" flexDirection="column" gap={3}>
                      <Button type="submit" colorScheme="teal" w="full" isLoading={signUpBusy} isDisabled={signUpBusy}>
                        Create account
                      </Button>
                      <Button variant="ghost" w="full" onClick={() => setAuthMode('signIn')}>
                        Already have an account? Sign in
                      </Button>
                      <Text fontSize="xs" color="whiteAlpha.600" textAlign="center">
                        Usernames let other players find and challenge you. Choose something memorable!
                      </Text>
                    </ModalFooter>
                  </Box>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}

export default AuthJourney;
