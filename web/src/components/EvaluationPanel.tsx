import {
  Box,
  Button,
  Collapse,
  Flex,
  Heading,
  HStack,
  Progress,
  Select,
  Stack,
  Text,
  useDisclosure,
} from '@chakra-ui/react';
import type { EvaluationState, TopMove } from '@hooks/useSantorini';

interface EvaluationPanelProps {
  loading: boolean;
  evaluation: EvaluationState;
  topMoves: TopMove[];
  calcOptionsBusy: boolean;
  refreshEvaluation: () => Promise<void>;
  calculateOptions: () => Promise<void>;
  updateDepth: (depth: number | null) => void;
}

const depthOptions = [
  { label: 'Use AI setting', value: 'ai' },
  { label: 'Easy (50)', value: '50' },
  { label: 'Medium (200)', value: '200' },
  { label: 'Native (800)', value: '800' },
  { label: 'Boosted (3200)', value: '3200' },
];

function EvaluationPanel({
  loading,
  evaluation,
  topMoves,
  calcOptionsBusy,
  refreshEvaluation,
  calculateOptions,
  updateDepth,
}: EvaluationPanelProps) {
  const disclosure = useDisclosure({ defaultIsOpen: true });

  return (
    <Box
      borderRadius="lg"
      borderWidth="1px"
      borderColor="whiteAlpha.200"
      bg="blackAlpha.500"
      p={6}
      minH="360px"
    >
      <Flex justify="space-between" align="center" mb={4}>
        <Heading size="md">AI Evaluation</Heading>
        <HStack spacing={3}>
          <Button size="sm" variant="outline" onClick={disclosure.onToggle}>
            {disclosure.isOpen ? 'Hide' : 'Show'}
          </Button>
          <Button size="sm" colorScheme="teal" onClick={refreshEvaluation} isLoading={loading}>
            Refresh
          </Button>
        </HStack>
      </Flex>
      <Collapse in={disclosure.isOpen} animateOpacity>
        <Stack spacing={5}>
          <Box>
            <Text fontSize="sm" color="whiteAlpha.700" mb={2}>
              Advantage: {evaluation.advantage}
            </Text>
            <Progress
              value={((evaluation.value + 1) / 2) * 100}
              colorScheme={evaluation.value >= 0 ? 'green' : 'red'}
              borderRadius="full"
              height="10px"
            />
            <Text mt={2} fontSize="2xl" fontWeight="bold">
              {evaluation.label}
            </Text>
          </Box>
          <Box>
            <Flex justify="space-between" align="center" mb={2}>
              <Heading size="sm">Top moves</Heading>
              <HStack spacing={3}>
                <Select
                  size="sm"
                  maxW="180px"
                  defaultValue="ai"
                  onChange={(event) => {
                    const value = event.target.value;
                    updateDepth(value === 'ai' ? null : Number(value));
                  }}
                >
                  {depthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  colorScheme="purple"
                  onClick={calculateOptions}
                  isLoading={calcOptionsBusy}
                >
                  Calc options
                </Button>
              </HStack>
            </Flex>
            <Stack spacing={3}>
              {topMoves.length === 0 && (
                <Text fontSize="sm" color="whiteAlpha.600">
                  Run a calculation to see detailed options.
                </Text>
              )}
              {topMoves.map((move) => (
                <Box
                  key={move.action}
                  borderWidth="1px"
                  borderRadius="md"
                  borderColor="whiteAlpha.200"
                  p={3}
                  bg="whiteAlpha.100"
                >
                  <Text fontWeight="medium">{move.text}</Text>
                  <Flex align="center" justify="space-between" mt={2}>
                    <Progress
                      value={move.prob * 100}
                      colorScheme="teal"
                      borderRadius="full"
                      flex="1"
                      mr={3}
                      height="6px"
                    />
                    <Text fontSize="sm" color="whiteAlpha.800">
                      {(move.prob * 100).toFixed(0)}%
                    </Text>
                  </Flex>
                  {typeof move.eval === 'number' && (
                    <Text fontSize="sm" color="whiteAlpha.700" mt={2}>
                      Eval: {move.eval >= 0 ? `+${move.eval.toFixed(2)}` : move.eval.toFixed(2)}
                      {typeof move.delta === 'number' && Math.abs(move.delta) >= 0.005
                        ? ` (Δ ${move.delta >= 0 ? '+' : ''}${move.delta.toFixed(2)})`
                        : ''}
                    </Text>
                  )}
                </Box>
              ))}
            </Stack>
          </Box>
        </Stack>
      </Collapse>
    </Box>
  );
}

export default EvaluationPanel;
