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
import type { Controls, ButtonsState } from '@hooks/useSantorini';

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
  buttons: ButtonsState;
}

function HeaderBar({ controls, onReset, onShowHistory, buttons }: HeaderBarProps) {
  const { colorMode, toggleColorMode } = useColorMode();
  const bg = useColorModeValue('whiteAlpha.200', 'gray.800');
  const selectBg = useColorModeValue('white', 'gray.700');
  const selectBorderColor = useColorModeValue('gray.300', 'gray.600');
  const selectTextColor = useColorModeValue('gray.900', 'white');
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
    <Box bg={bg} borderBottomWidth="1px" borderColor="whiteAlpha.200" px={{ base: 3, md: 8 }} py={{ base: 3, md: 4 }}>
      <Flex 
        direction={{ base: 'column', md: 'row' }} 
        align={{ base: 'stretch', md: 'center' }} 
        gap={{ base: 3, md: 4 }}
      >
        <Flex align="center" justify="space-between" flex="1">
          <Heading size={{ base: "sm", md: "md" }} letterSpacing="wide">
            Santorini AlphaZero
          </Heading>
          <HStack spacing={2} display={{ base: 'flex', md: 'none' }}>
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
        
        <HStack spacing={{ base: 2, md: 3 }} flexWrap="wrap" justify={{ base: 'center', md: 'flex-start' }}>
          <Button colorScheme="teal" size={{ base: "xs", md: "sm" }} onClick={onReset} leftIcon={<RepeatIcon />}>
            <Box display={{ base: 'none', sm: 'inline' }}>New game</Box>
            <Box display={{ base: 'inline', sm: 'none' }}>New</Box>
          </Button>
          <Button 
            colorScheme="blue" 
            size={{ base: "xs", md: "sm" }}
            onClick={controls.startGuidedSetup}
            isDisabled={buttons.setupMode}
            title="Guided setup: place pieces then start"
          >
            Setup
          </Button>
          <Button colorScheme="orange" size={{ base: "xs", md: "sm" }} onClick={controls.toggleEdit}>
            <Box display={{ base: 'none', sm: 'inline' }}>Toggle edit</Box>
            <Box display={{ base: 'inline', sm: 'none' }}>Edit</Box>
          </Button>
          <Tooltip label="Jump to history" hasArrow>
            <IconButton
              aria-label="History"
              icon={<TimeIcon />}
              size={{ base: "sm", md: "sm" }}
              variant="outline"
              colorScheme="blue"
              onClick={onShowHistory}
              display={{ base: 'none', md: 'flex' }}
            />
          </Tooltip>
        </HStack>
        
        <HStack spacing={3} flexWrap="wrap" justify={{ base: 'center', md: 'flex-end' }} display={{ base: 'none', md: 'flex' }}>
          <Select
            size="sm"
            value={difficulty}
            onChange={handleDifficulty}
            bg={selectBg}
            borderColor={selectBorderColor}
            color={selectTextColor}
            _hover={{ borderColor: selectBorderColor }}
            _focus={{ borderColor: 'teal.400', boxShadow: '0 0 0 1px teal.400' }}
            maxW="200px"
          >
            {difficultyPresets.map((preset) => (
              <option key={preset.value} value={preset.value} style={{ backgroundColor: colorMode === 'dark' ? '#2D3748' : 'white', color: colorMode === 'dark' ? 'white' : 'black' }}>
                {preset.label}
              </option>
            ))}
          </Select>
          <Select
            size="sm"
            value={mode}
            onChange={handleMode}
            bg={selectBg}
            borderColor={selectBorderColor}
            color={selectTextColor}
            _hover={{ borderColor: selectBorderColor }}
            _focus={{ borderColor: 'teal.400', boxShadow: '0 0 0 1px teal.400' }}
            maxW="200px"
          >
            {gameModes.map((preset) => (
              <option key={preset.value} value={preset.value} style={{ backgroundColor: colorMode === 'dark' ? '#2D3748' : 'white', color: colorMode === 'dark' ? 'white' : 'black' }}>
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
