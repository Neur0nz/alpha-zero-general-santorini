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
      gap={{ base: 4, md: 5 }}
      w="100%"
      maxW={{ base: '100%', sm: '380px', md: '480px', lg: '540px' }}
      mx="auto"
    >
      <Box>
        <Grid
          templateColumns="repeat(5, 1fr)"
          gap={{ base: 1.5, sm: 3, md: 3 }}
          bg="blackAlpha.500"
          p={{ base: 3, sm: 4, md: 4 }}
          borderRadius="lg"
          boxShadow="xl"
          w="100%"
          h={{ base: '260px', sm: '360px', md: '460px', lg: '520px' }}
          minH={{ base: '260px', sm: '360px', md: '460px', lg: '520px' }}
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
                            width: '78%',
                            height: '78%',
                            maxWidth: '78%',
                            maxHeight: '78%',
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
      </Box>
      <Flex gap={3} direction={{ base: 'column', sm: 'row' }} w="100%">
        <Button
          flex="1"
          w={{ base: '100%', sm: 'auto' }}
          onClick={undo}
          isDisabled={!buttons.canUndo}
          colorScheme="blue"
        >
          Undo
        </Button>
        <Button
          flex="1"
          w={{ base: '100%', sm: 'auto' }}
          onClick={redo}
          isDisabled={!buttons.canRedo}
          colorScheme="purple"
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
