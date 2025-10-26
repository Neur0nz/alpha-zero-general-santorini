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
  useDisclosure,
  useToast,
} from '@chakra-ui/react';

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
  const toast = useToast();

  const openForMode = (mode: AuthMode) => {
    setAuthMode(mode);
    onOpen();
  };

  const handleClose = () => {
    setSignInState(initialSignInState);
    setSignUpState(initialSignUpState);
    onClose();
  };

  const handleSignInSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    toast({
      title: 'Signed in',
      description: `Welcome back, ${signInState.email}!`,
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
    handleClose();
  };

  const handleSignUpSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    toast({
      title: 'Account created',
      description: `Welcome to Ascent, ${signUpState.username || 'new strategist'}!`,
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
    handleClose();
  };

  return (
    <>
      <Button
        size="sm"
        colorScheme="teal"
        variant="solid"
        onClick={() => openForMode('signIn')}
      >
        Sign in / Sign up
      </Button>

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
                      <Button type="submit" colorScheme="teal" w="full">
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
                      <Button type="submit" colorScheme="teal" w="full">
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
