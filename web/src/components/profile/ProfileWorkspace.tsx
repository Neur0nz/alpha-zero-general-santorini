import { ChangeEvent, useEffect, useRef, useState } from 'react';
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
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
  Stack,
  Text,
  useBoolean,
  useColorModeValue,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import GoogleIcon from '@components/auth/GoogleIcon';
import type { SupabaseAuthState } from '@hooks/useSupabaseAuth';
import { generateDisplayName, validateDisplayName } from '@/utils/generateDisplayName';
import { useSurfaceTokens } from '@/theme/useSurfaceTokens';
import Cropper, { type Area } from 'react-easy-crop';
import { cropImageToFile } from '@/utils/cropImage';

const MAX_AVATAR_FILE_BYTES = 2 * 1024 * 1024;

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
    updateAvatar,
    refreshProfile,
  } = auth;
  const [savingName, setSavingName] = useBoolean(false);
  const [startingGoogle, setStartingGoogle] = useBoolean(false);
  const [signingOut, setSigningOut] = useBoolean(false);
  const [retrying, setRetrying] = useBoolean(false);
  const [savingAvatar, setSavingAvatar] = useBoolean(false);
  const [displayNameValue, setDisplayNameValue] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const { isOpen: isCropOpen, onOpen: openCrop, onClose: closeCrop } = useDisclosure();
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  useEffect(() => {
    setAvatarPreview(null);
  }, [profile?.avatar_url]);

  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  useEffect(() => {
    return () => {
      if (cropImageUrl) {
        URL.revokeObjectURL(cropImageUrl);
      }
    };
  }, [cropImageUrl]);

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

  const resetCropState = () => {
    if (cropImageUrl) {
      URL.revokeObjectURL(cropImageUrl);
    }
    setCropImageUrl(null);
    setPendingFile(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  };

  const handleChooseAvatar = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Unsupported file', status: 'error', description: 'Please choose an image file.' });
      event.target.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_FILE_BYTES) {
      toast({ title: 'File too large', status: 'error', description: 'Please choose an image 2 MB or smaller.' });
      event.target.value = '';
      return;
    }

    if (cropImageUrl) {
      URL.revokeObjectURL(cropImageUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setPendingFile(file);
    setCropImageUrl(previewUrl);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    openCrop();
    event.target.value = '';
  };

  const handleCancelCrop = () => {
    if (savingAvatar) {
      return;
    }
    resetCropState();
    closeCrop();
  };

  const handleCropComplete = (_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  };

  const handleConfirmCrop = async () => {
    if (!pendingFile || !cropImageUrl || !croppedAreaPixels) {
      toast({ title: 'Crop incomplete', status: 'error', description: 'Adjust the crop before saving.' });
      return;
    }

    setSavingAvatar.on();

    try {
      const croppedFile = await cropImageToFile(cropImageUrl, croppedAreaPixels, {
        mimeType: 'image/png',
        size: 512,
        fileName: `${pendingFile.name.replace(/\.[^/.]+$/, '')}-cropped.png`,
      });

      if (croppedFile.size > MAX_AVATAR_FILE_BYTES) {
        toast({
          title: 'Image too large',
          status: 'error',
          description: 'Try zooming out slightly so the final image is under 2 MB.',
        });
        return;
      }

      const uploadedUrl = await updateAvatar(croppedFile);
      if (uploadedUrl) {
        setAvatarPreview(uploadedUrl);
      }

      toast({ title: 'Profile picture updated', status: 'success' });
      closeCrop();
      resetCropState();
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Unable to update profile picture.';
      toast({ title: 'Upload failed', status: 'error', description: message });
    } finally {
      setSavingAvatar.off();
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
  const avatarSrc = avatarPreview
    ?? profile?.avatar_url
    ?? (typeof session?.user.user_metadata?.avatar_url === 'string' ? session.user.user_metadata.avatar_url : undefined);

  return (
    <>
      <Card bg={cardBg} borderWidth="1px" borderColor={cardBorder} w="100%">
        <CardBody as={Stack} spacing={6}>
        <Flex
          justify="space-between"
          align={{ base: 'stretch', md: 'center' }}
          direction={{ base: 'column', md: 'row' }}
          gap={{ base: 4, md: 6 }}
        >
          <HStack spacing={4} align="center">
            <Box position="relative">
              <Avatar size="lg" name={profile.display_name} src={avatarSrc} opacity={savingAvatar ? 0.6 : 1} />
              {savingAvatar && (
                <Center position="absolute" inset={0}>
                  <Spinner size="sm" />
                </Center>
              )}
            </Box>
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
              <HStack spacing={3} mt={3} align="center">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={handleChooseAvatar}
                  isLoading={savingAvatar}
                  isDisabled={savingAvatar || isCropOpen}
                >
                  Change photo
                </Button>
                <Text fontSize="xs" color={mutedText}>
                  PNG, JPG, or WEBP up to 2MB
                </Text>
              </HStack>
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
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            display="none"
            onChange={handleAvatarFile}
          />
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
      <Modal isOpen={isCropOpen} onClose={handleCancelCrop} size="lg" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Adjust your profile picture</ModalHeader>
          <ModalCloseButton isDisabled={savingAvatar} />
          <ModalBody>
            <Box
              position="relative"
              w="100%"
              pt="100%"
              bg={useColorModeValue('gray.100', 'gray.900')}
              borderRadius="xl"
              overflow="hidden"
            >
              {cropImageUrl && (
                <Box position="absolute" inset={0}>
                  <Cropper
                    image={cropImageUrl}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    cropShape="round"
                    showGrid={false}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={handleCropComplete}
                  />
                </Box>
              )}
            </Box>
            <Stack spacing={3} mt={6}>
              <Text fontSize="sm" color={mutedText}>
                Drag the image to reposition it and use the slider to zoom.
              </Text>
              <Slider value={zoom} min={1} max={3} step={0.05} onChange={setZoom} isDisabled={savingAvatar}>
                <SliderTrack>
                  <SliderFilledTrack />
                </SliderTrack>
                <SliderThumb />
              </Slider>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleCancelCrop} isDisabled={savingAvatar}>
              Cancel
            </Button>
            <Button colorScheme="teal" onClick={handleConfirmCrop} isLoading={savingAvatar} loadingText="Saving">
              Save
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

export default ProfileWorkspace;
