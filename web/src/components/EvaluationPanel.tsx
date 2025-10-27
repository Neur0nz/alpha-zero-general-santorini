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
  useColorModeValue,
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

function EvaluationBar({ value }: { value: number }) {
  const safeValue = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  const positiveWidth = safeValue > 0 ? safeValue * 50 : 0;
  const negativeWidth = safeValue < 0 ? Math.abs(safeValue) * 50 : 0;
  const trackBg = useColorModeValue('gray.200', 'whiteAlpha.300');
  const centerLineColor = useColorModeValue('gray.400', 'whiteAlpha.600');

  return (
    <Box
      position="relative"
      height="12px"
      borderRadius="full"
      overflow="hidden"
      bg={trackBg}
    >
      <Box
        position="absolute"
        top={0}
        bottom={0}
        left="50%"
        width="1px"
        bg={centerLineColor}
        opacity={0.6}
      />
      {negativeWidth > 0 && (
        <Box
          position="absolute"
          top={0}
          bottom={0}
          right="50%"
          width={`${negativeWidth}%`}
          bgGradient="linear(to-l, red.400, red.500)"
          borderTopLeftRadius="full"
          borderBottomLeftRadius="full"
          transition="width 0.3s ease"
        />
      )}
      {positiveWidth > 0 && (
        <Box
          position="absolute"
          top={0}
          bottom={0}
          left="50%"
          width={`${positiveWidth}%`}
          bgGradient="linear(to-r, green.400, green.500)"
          borderTopRightRadius="full"
          borderBottomRightRadius="full"
          transition="width 0.3s ease"
        />
      )}
    </Box>
  );
}

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
  const panelGradient = useColorModeValue('linear(to-br, gray.50, white)', 'linear(to-br, blackAlpha.500, blackAlpha.400)');
  const panelBorder = useColorModeValue('gray.200', 'whiteAlpha.200');
  const mutedText = useColorModeValue('gray.600', 'whiteAlpha.700');
  const subtleText = useColorModeValue('gray.500', 'whiteAlpha.600');
  const strongText = useColorModeValue('gray.800', 'whiteAlpha.800');
  const moveBg = useColorModeValue('gray.50', 'whiteAlpha.100');

  return (
    <Box
      borderRadius="lg"
      borderWidth="1px"
      borderColor={panelBorder}
      bgGradient={panelGradient}
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
            <Text fontSize="sm" color={mutedText} mb={2}>
              Advantage: {evaluation.advantage}
            </Text>
            <EvaluationBar value={evaluation.value} />
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
                  {movesDisclosure.isOpen ? 'Hide' : 'Show'}
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
                  Analyze
                </Button>
              </HStack>
            </Flex>
            <Collapse in={movesDisclosure.isOpen} animateOpacity>
              <Stack spacing={3} mt={2}>
                {topMoves.length === 0 && (
                  <Text fontSize="sm" color={subtleText}>
                    Run a calculation to see detailed options.
                  </Text>
                )}
                {topMoves.map((move) => {
                  const clampedProb = Math.max(0, Math.min(move.prob, 1));
                  const percentValue = clampedProb * 100;
                  const percentLabel =
                    percentValue >= 0.1
                      ? `${percentValue.toFixed(1)}%`
                      : percentValue > 0
                      ? '<0.1%'
                      : '0%';

                  return (
                    <Box
                      key={move.action}
                      borderWidth="1px"
                      borderRadius="md"
                      borderColor={panelBorder}
                      p={3}
                      bg={moveBg}
                    >
                      <Text fontWeight="medium">{move.text}</Text>
                      <Flex align="center" justify="space-between" mt={2} gap={3}>
                        <Progress
                          value={percentValue}
                          colorScheme="teal"
                          borderRadius="full"
                          flex="1"
                          height="6px"
                        />
                        <Text fontSize="sm" color={strongText} minW="48px" textAlign="right">
                          {percentLabel}
                        </Text>
                      </Flex>
                      {typeof move.eval === 'number' && (
                        <Text fontSize="sm" color={mutedText} mt={2}>
                          Eval: {move.eval >= 0 ? `+${move.eval.toFixed(2)}` : move.eval.toFixed(2)}
                          {typeof move.delta === 'number' && Math.abs(move.delta) >= 0.005
                            ? ` (Δ ${move.delta >= 0 ? '+' : ''}${move.delta.toFixed(2)})`
                            : ''}
                        </Text>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </Collapse>
          </Box>
            </Stack>
          </Collapse>
        </>
      ) : (
        <Flex justify="space-between" align="center">
          <Heading size="sm" color={strongText}>
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
