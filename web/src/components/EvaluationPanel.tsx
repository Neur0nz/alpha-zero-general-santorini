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
import { ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons';
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
  const movesDisclosure = useDisclosure({ defaultIsOpen: true });

  return (
    <Box
      borderRadius="lg"
      borderWidth="1px"
      borderColor="whiteAlpha.200"
      bgGradient="linear(to-br, blackAlpha.500, blackAlpha.400)"
      p={disclosure.isOpen ? { base: 5, md: 6 } : 3}
      minH={disclosure.isOpen ? (movesDisclosure.isOpen ? "360px" : "200px") : "auto"}
      boxShadow="dark-lg"
      transition="all 0.3s ease"
    >
      {disclosure.isOpen ? (
        <>
          <Flex justify="space-between" align="center" mb={4}>
            <Heading size="md">AI Evaluation</Heading>
            <HStack spacing={3}>
              <Button size="sm" variant="outline" onClick={disclosure.onToggle}>
                Hide
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
            <Flex justify="space-between" align={{ base: 'flex-start', sm: 'center' }} mb={2} wrap="wrap" gap={2}>
              <Heading size="sm">Best moves</Heading>
              <HStack spacing={2} align="center">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={movesDisclosure.onToggle}
                  leftIcon={movesDisclosure.isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                >
                  {movesDisclosure.isOpen ? 'Hide list' : 'Show list'}
                </Button>
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
            <Collapse in={movesDisclosure.isOpen} animateOpacity>
              <Stack spacing={3} mt={2}>
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
                    <Flex align="center" justify="space-between" mt={2} gap={3}>
                      <Progress
                        value={move.prob * 100}
                        colorScheme="teal"
                        borderRadius="full"
                        flex="1"
                        height="6px"
                      />
                      <Text fontSize="sm" color="whiteAlpha.800" minW="48px" textAlign="right">
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
            </Collapse>
          </Box>
        </Stack>
          </Collapse>
        </>
      ) : (
        <Flex justify="space-between" align="center">
          <Heading size="sm" color="whiteAlpha.800">
            AI Evaluation
          </Heading>
          <Button size="sm" colorScheme="teal" onClick={disclosure.onToggle}>
            Show
          </Button>
        </Flex>
      )}
    </Box>
  );
}

export default EvaluationPanel;
