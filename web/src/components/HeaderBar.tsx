import { ChangeEvent, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  IconButton,
  Select,
  Spacer,
  Tooltip,
  useColorMode,
  useColorModeValue,
} from '@chakra-ui/react';
import { RepeatIcon, SunIcon, MoonIcon, TimeIcon } from '@chakra-ui/icons';
import type { Controls } from '@hooks/useSantorini';

const difficultyPresets: Array<{ label: string; value: number }> = [
  { label: 'God-like (12800)', value: 12800 },
  { label: 'Boosted (3200)', value: 3200 },
  { label: 'Native (800)', value: 800 },
  { label: 'Medium (200)', value: 200 },
  { label: 'Easy (50)', value: 50 },
  { label: 'Easier (12)', value: 12 },
  { label: 'Come on (3)', value: 3 },
];

const gameModes: Array<{ label: string; value: 'P0' | 'P1' | 'Human' | 'AI' }> = [
  { label: 'You vs AI', value: 'P0' },
  { label: 'AI vs You', value: 'P1' },
  { label: 'No AI', value: 'Human' },
  { label: 'WarGames', value: 'AI' },
];

interface HeaderBarProps {
  controls: Controls;
  onReset: () => Promise<void>;
  onShowHistory: () => void;
}

function HeaderBar({ controls, onReset, onShowHistory }: HeaderBarProps) {
  const { colorMode, toggleColorMode } = useColorMode();
  const bg = useColorModeValue('whiteAlpha.200', 'gray.800');
  const [difficulty, setDifficulty] = useState<number>(50);
  const [mode, setMode] = useState<'P0' | 'P1' | 'Human' | 'AI'>('P0');

  const handleDifficulty = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = Number(event.target.value);
    setDifficulty(value);
    controls.changeDifficulty(value);
  };

  const handleMode = async (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as 'P0' | 'P1' | 'Human' | 'AI';
    setMode(value);
    await controls.setGameMode(value);
  };

  return (
    <Box bg={bg} borderBottomWidth="1px" borderColor="whiteAlpha.200" px={{ base: 4, md: 8 }} py={4}>
      <Flex align="center" gap={4} wrap="wrap">
        <Heading size="md" letterSpacing="wide">
          Santorini AlphaZero
        </Heading>
        <HStack spacing={3} flexWrap="wrap">
          <Button colorScheme="teal" size="sm" onClick={onReset} leftIcon={<RepeatIcon />}>
            New game
          </Button>
          <Button colorScheme="orange" size="sm" onClick={controls.toggleEdit}>
            Toggle edit
          </Button>
          <Tooltip label="Jump to history" hasArrow>
            <IconButton
              aria-label="History"
              icon={<TimeIcon />}
              size="sm"
              variant="outline"
              colorScheme="blue"
              onClick={onShowHistory}
            />
          </Tooltip>
        </HStack>
        <Spacer />
        <HStack spacing={3} flexWrap="wrap">
          <Select
            size="sm"
            value={difficulty}
            onChange={handleDifficulty}
            bg="blackAlpha.500"
            borderColor="whiteAlpha.300"
            maxW="200px"
          >
            {difficultyPresets.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </Select>
          <Select
            size="sm"
            value={mode}
            onChange={handleMode}
            bg="blackAlpha.500"
            borderColor="whiteAlpha.300"
            maxW="200px"
          >
            {gameModes.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </Select>
          <Tooltip label="Refresh evaluation" hasArrow>
            <IconButton
              aria-label="Refresh evaluation"
              icon={<RepeatIcon />}
              size="sm"
              variant="outline"
              onClick={controls.refreshEvaluation}
            />
          </Tooltip>
          <Tooltip label="Toggle color mode" hasArrow>
            <IconButton
              aria-label="Toggle color mode"
              icon={colorMode === 'dark' ? <SunIcon /> : <MoonIcon />}
              size="sm"
              variant="outline"
              onClick={toggleColorMode}
            />
          </Tooltip>
        </HStack>
      </Flex>
    </Box>
  );
}

export default HeaderBar;
