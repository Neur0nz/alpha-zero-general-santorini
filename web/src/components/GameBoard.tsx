import {
  AspectRatio,
  Box,
  Button,
  Flex,
  Grid,
  GridItem,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import type { BoardCell, ButtonsState } from '@hooks/useSantorini';

interface GameBoardProps {
  board: BoardCell[][];
  selectable: boolean[][];
  onCellClick: (y: number, x: number) => void;
  onCellHover: (y: number, x: number) => void;
  onCellLeave: (y: number, x: number) => void;
  buttons: ButtonsState;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

function GameBoard({
  board,
  selectable,
  onCellClick,
  onCellHover,
  onCellLeave,
  buttons,
  undo,
  redo,
}: GameBoardProps) {
  const cellBg = useColorModeValue('gray.50', 'gray.700');
  const selectableBg = useColorModeValue('teal.100', 'teal.700');
  const setupSelectableBg = useColorModeValue('blue.100', 'blue.700');
  const labelColor = useColorModeValue('gray.600', 'whiteAlpha.700');
  const subtleLabelColor = useColorModeValue('gray.500', 'whiteAlpha.600');
  const boardFrameBg = useColorModeValue('gray.100', 'blackAlpha.500');
  const defaultBorderColor = useColorModeValue('gray.300', 'whiteAlpha.300');
  const highlightBorderColor = useColorModeValue('yellow.400', 'yellow.300');
  const actionBorderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const panelTextColor = useColorModeValue('gray.800', 'whiteAlpha.800');
  const [boardPixels, setBoardPixels] = useState<number>(() => {
    if (typeof window === 'undefined') {
      return 600;
    }
    const stored = window.localStorage.getItem('santorini:boardSize');
    const parsed = Number(stored);
    if (Number.isFinite(parsed) && parsed >= 320 && parsed <= 960) {
      return parsed;
    }
    const viewportWidth = window.innerWidth || 0;
    if (viewportWidth <= 0) {
      return 720;
    }
    const preferred = Math.round(viewportWidth - 96);
    return Math.min(960, Math.max(360, preferred));
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem('santorini:boardSize', String(boardPixels));
  }, [boardPixels]);

  const boardColumns = Math.max(1, board[0]?.length ?? board.length);
  const gridTemplateColumns = `repeat(${boardColumns}, 1fr)`;

  const boardMaxWidth = useMemo(() => `min(${boardPixels}px, calc(100vw - 24px))`, [boardPixels]);

  return (
    <Flex
      direction="column"
      gap={{ base: 6, md: 7 }}
      w="100%"
      maxW="100%"
      mx="auto"
    >
      <Flex direction="column" gap={3} w="100%">
        <Flex align="center" gap={3} w="100%" px={{ base: 0, sm: 1 }}>
          <Text fontSize="sm" color={labelColor} whiteSpace="nowrap">
            Board size
          </Text>
          <Slider
            aria-label="Board size"
            value={boardPixels}
            onChange={setBoardPixels}
            min={320}
            max={960}
            step={10}
            colorScheme="teal"
            flex={1}
          >
            <SliderTrack bg={defaultBorderColor}>
              <SliderFilledTrack />
            </SliderTrack>
            <SliderThumb boxSize={5} />
          </Slider>
          <Text fontSize="sm" color={subtleLabelColor} w="64px" textAlign="right">
            {Math.round(boardPixels)}px
          </Text>
        </Flex>
        <AspectRatio ratio={1} w="100%" maxW={boardMaxWidth} mx="auto">
          <Flex
            direction="column"
            w="100%"
            h="100%"
            bg={boardFrameBg}
            p={{ base: 2, sm: 4, md: 6 }}
            borderRadius="xl"
            boxShadow="2xl"
          >
            <Grid
              templateColumns={gridTemplateColumns}
              gap={{ base: 1, sm: 2, md: 3 }}
              w="100%"
              h="100%"
              flex={1}
            >
              {board.map((row, y) =>
                row.map((cell, x) => {
                  const isSelectable = selectable[y]?.[x];
                  const isSetupSelectable = buttons.setupMode && cell.worker === 0; // Empty cells during setup
                  const highlight = cell.highlight;
                  const canClick = isSelectable || isSetupSelectable;
                  return (
                    <GridItem key={`${y}-${x}`}>
                      <AspectRatio ratio={1} w="100%">
                        <Box
                          role="button"
                          tabIndex={0}
                          aria-label={`Cell ${y},${x}`}
                          onClick={() => onCellClick(y, x)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onCellClick(y, x);
                            }
                          }}
                          onMouseEnter={() => onCellHover(y, x)}
                          onMouseLeave={() => onCellLeave(y, x)}
                          cursor={canClick ? 'pointer' : 'default'}
                          borderRadius="lg"
                          borderWidth={highlight ? '3px' : '1px'}
                          borderColor={highlight ? highlightBorderColor : defaultBorderColor}
                          bg={
                            isSetupSelectable
                              ? setupSelectableBg
                              : isSelectable
                                ? selectableBg
                                : cellBg
                          }
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          transition="all 0.2s ease"
                          position="relative"
                          _hover={{ boxShadow: canClick ? 'dark-lg' : undefined }}
                        >
                          <Box
                            pointerEvents="none"
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            w="100%"
                            h="100%"
                            sx={{
                              '& svg': {
                                width: '88%',
                                height: '88%',
                                maxWidth: '88%',
                                maxHeight: '88%',
                              },
                            }}
                            dangerouslySetInnerHTML={{ __html: cell.svg }}
                          />
                        </Box>
                      </AspectRatio>
                    </GridItem>
                  );
                }),
              )}
            </Grid>
          </Flex>
        </AspectRatio>
      </Flex>
      <Flex
        gap={3}
        direction={{ base: 'column', sm: 'row' }}
        w="100%"
        align="stretch"
      >
        <Button
          flex="1"
          w={{ base: '100%', sm: 'auto' }}
          size="lg"
          py={{ base: 5, sm: 6 }}
          onClick={undo}
          isDisabled={!buttons.canUndo}
          colorScheme="blue"
          boxShadow="lg"
        >
          Undo
        </Button>
        <Button
          flex="1"
          w={{ base: '100%', sm: 'auto' }}
          size="lg"
          py={{ base: 5, sm: 6 }}
          onClick={redo}
          isDisabled={!buttons.canRedo}
          colorScheme="purple"
          boxShadow="lg"
        >
          Redo
        </Button>
      </Flex>
      <Box
        px={4}
        py={3}
        borderRadius="md"
        bg={buttons.setupMode ? 'blue.500' : boardFrameBg}
        borderWidth="1px"
        borderColor={buttons.setupMode ? 'blue.300' : actionBorderColor}
        textAlign={{ base: 'center', sm: 'left' }}
      >
        <Text fontSize="sm" color={panelTextColor}>
          {buttons.status}
        </Text>
        {buttons.loading && (
          <Text mt={2} fontSize="sm" color="teal.200">
            AI thinking...
          </Text>
        )}
        {buttons.setupMode && (
          <Text mt={2} fontSize="sm" color="blue.200">
            Setup Mode: Click empty cells to place workers
          </Text>
        )}
      </Box>
    </Flex>
  );
}

export default GameBoard;
