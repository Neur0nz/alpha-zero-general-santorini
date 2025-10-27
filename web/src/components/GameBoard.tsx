import {
  AspectRatio,
  Box,
  Button,
  Flex,
  Grid,
  GridItem,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
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

  return (
    <Flex
      direction="column"
      gap={{ base: 6, md: 7 }}
      w="100%"
      maxW={{ base: '100%', sm: '600px', md: '740px', lg: '880px', xl: '960px' }}
      mx="auto"
    >
      <AspectRatio ratio={1} w="100%" maxW="min(100%, 960px)">
        <Flex
          direction="column"
          w="100%"
          h="100%"
          bg="blackAlpha.500"
          p={{ base: 4, sm: 5, md: 6 }}
          borderRadius="xl"
          boxShadow="2xl"
        >
          <Grid
            templateColumns="repeat(5, 1fr)"
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
                        borderColor={highlight ? 'yellow.300' : 'whiteAlpha.300'}
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
        bg={buttons.setupMode ? 'blue.500' : 'blackAlpha.500'}
        borderWidth="1px"
        borderColor={buttons.setupMode ? 'blue.300' : 'whiteAlpha.200'}
        textAlign={{ base: 'center', sm: 'left' }}
      >
        <Text fontSize="sm" color="whiteAlpha.800">
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
