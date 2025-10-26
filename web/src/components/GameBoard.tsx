import {
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

  return (
    <Flex direction="column" gap={4} maxW="420px">
      <Box>
        <Grid templateColumns="repeat(5, 1fr)" gap={1} bg="blackAlpha.500" p={2} borderRadius="lg">
          {board.map((row, y) =>
            row.map((cell, x) => {
              const isSelectable = selectable[y]?.[x];
              const highlight = cell.highlight;
              return (
                <GridItem key={`${y}-${x}`}>
                  <Box
                    role="button"
                    tabIndex={0}
                    aria-label={`Cell ${y},${x}`}
                    onClick={() => onCellClick(y, x)}
                    onMouseEnter={() => onCellHover(y, x)}
                    onMouseLeave={() => onCellLeave(y, x)}
                    cursor={isSelectable ? 'pointer' : 'default'}
                    borderRadius="md"
                    borderWidth={highlight ? '2px' : '1px'}
                    borderColor={highlight ? 'yellow.300' : 'whiteAlpha.300'}
                    bg={isSelectable ? selectableBg : cellBg}
                    minH="70px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    transition="all 0.2s ease"
                    _hover={{ boxShadow: isSelectable ? 'xl' : undefined }}
                  >
                    <Box dangerouslySetInnerHTML={{ __html: cell.svg }} transform="scale(0.18)" transformOrigin="center" />
                  </Box>
                </GridItem>
              );
            }),
          )}
        </Grid>
      </Box>
      <Flex gap={3}>
        <Button flex="1" onClick={undo} isDisabled={!buttons.canUndo} colorScheme="blue">
          Undo
        </Button>
        <Button flex="1" onClick={redo} isDisabled={!buttons.canRedo} colorScheme="purple">
          Redo
        </Button>
      </Flex>
      <Box
        px={4}
        py={3}
        borderRadius="md"
        bg="blackAlpha.500"
        borderWidth="1px"
        borderColor="whiteAlpha.200"
      >
        <Text fontSize="sm" color="whiteAlpha.800">
          {buttons.status}
        </Text>
        {buttons.loading && (
          <Text mt={2} fontSize="sm" color="teal.200">
            AI thinking...
          </Text>
        )}
      </Box>
    </Flex>
  );
}

export default GameBoard;
