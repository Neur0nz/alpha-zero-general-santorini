import { Box, Heading, Text, VStack } from '@chakra-ui/react';

function AnalyzeWorkspace() {
  return (
    <Box w="100%" py={{ base: 6, md: 10 }}>
      <VStack spacing={4} align="center" textAlign="center">
        <Heading size="lg">Analyze mode</Heading>
        <Text maxW="2xl" color="whiteAlpha.800">
          Import games, inspect move quality, and explore variations from this workspace once analysis tools are
          ready.
        </Text>
      </VStack>
    </Box>
  );
}

export default AnalyzeWorkspace;
