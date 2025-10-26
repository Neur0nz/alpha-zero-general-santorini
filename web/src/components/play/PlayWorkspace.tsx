import { Box, Heading, Text, VStack } from '@chakra-ui/react';

function PlayWorkspace() {
  return (
    <Box w="100%" py={{ base: 6, md: 10 }}>
      <VStack spacing={4} align="center" textAlign="center">
        <Heading size="lg">Play mode</Heading>
        <Text maxW="2xl" color="whiteAlpha.800">
          Matchmaking, challenges, and community rooms will live here. Stay tuned while we build out the
          competitive Santorini experience.
        </Text>
      </VStack>
    </Box>
  );
}

export default PlayWorkspace;
