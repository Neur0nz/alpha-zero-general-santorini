import { ChangeEvent, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Select,
  Tooltip,
  useColorMode,
  useColorModeValue,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { RepeatIcon, TimeIcon } from '@chakra-ui/icons';
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

interface PracticeToolbarProps {
  controls: Controls;
  onReset: () => Promise<void>;
  onShowHistory: () => void;
  buttons: ButtonsState;
}

function PracticeToolbar({ controls, onReset, onShowHistory, buttons }: PracticeToolbarProps) {
  const [difficulty, setDifficulty] = useState<number>(50);
  const [mode, setMode] = useState<'P0' | 'P1' | 'Human' | 'AI'>('P0');
  const selectBg = useColorModeValue('white', 'gray.700');
  const selectBorderColor = useColorModeValue('gray.300', 'gray.600');
  const selectTextColor = useColorModeValue('gray.900', 'white');
  const { colorMode } = useColorMode();

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
    <Box
      bg={useColorModeValue('white', 'blackAlpha.300')}
      borderRadius="xl"
      px={{ base: 3, md: 5 }}
      py={{ base: 3, md: 4 }}
      borderWidth="1px"
      borderColor={useColorModeValue('gray.200', 'whiteAlpha.200')}
    >
      <Flex direction={{ base: 'column', lg: 'row' }} gap={{ base: 3, lg: 6 }} align={{ base: 'stretch', lg: 'center' }}>
        <Wrap spacing={{ base: 2, md: 3 }} align="center">
          <WrapItem>
            <Button colorScheme="teal" size={{ base: 'sm', md: 'sm' }} onClick={onReset} leftIcon={<RepeatIcon />}>
              <Box display={{ base: 'none', sm: 'inline' }}>New game</Box>
              <Box display={{ base: 'inline', sm: 'none' }}>New</Box>
            </Button>
          </WrapItem>
          <WrapItem>
            <Button
              colorScheme="blue"
              size={{ base: 'sm', md: 'sm' }}
              onClick={controls.startGuidedSetup}
              isDisabled={buttons.setupMode}
              title="Guided setup: place pieces then start"
            >
              Setup
            </Button>
          </WrapItem>
          <WrapItem>
            <Button colorScheme="orange" size={{ base: 'sm', md: 'sm' }} onClick={controls.toggleEdit}>
              <Box display={{ base: 'none', sm: 'inline' }}>Toggle edit</Box>
              <Box display={{ base: 'inline', sm: 'none' }}>Edit</Box>
            </Button>
          </WrapItem>
          <WrapItem>
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
          </WrapItem>
          <WrapItem>
            <Tooltip label="Refresh evaluation" hasArrow>
              <IconButton
                aria-label="Refresh evaluation"
                icon={<RepeatIcon />}
                size="sm"
                variant="outline"
                onClick={controls.refreshEvaluation}
              />
            </Tooltip>
          </WrapItem>
        </Wrap>
        <HStack
          spacing={{ base: 2, md: 4 }}
          flex="1"
          justify={{ base: 'flex-start', lg: 'flex-end' }}
          align="center"
          flexWrap="wrap"
        >
          <Select
            size="sm"
            value={difficulty}
            onChange={handleDifficulty}
            bg={selectBg}
            borderColor={selectBorderColor}
            color={selectTextColor}
            _hover={{ borderColor: selectBorderColor }}
            _focus={{ borderColor: 'teal.400', boxShadow: '0 0 0 1px teal.400' }}
            maxW="220px"
          >
            {difficultyPresets.map((preset) => (
              <option
                key={preset.value}
                value={preset.value}
                style={{
                  backgroundColor: colorMode === 'dark' ? '#2D3748' : 'white',
                  color: colorMode === 'dark' ? 'white' : 'black',
                }}
              >
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
            maxW="220px"
          >
            {gameModes.map((preset) => (
              <option
                key={preset.value}
                value={preset.value}
                style={{
                  backgroundColor: colorMode === 'dark' ? '#2D3748' : 'white',
                  color: colorMode === 'dark' ? 'white' : 'black',
                }}
              >
                {preset.label}
              </option>
            ))}
          </Select>
        </HStack>
      </Flex>
    </Box>
  );
}

export default PracticeToolbar;
