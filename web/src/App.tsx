import { Box, Container, Flex, Spinner, useDisclosure } from '@chakra-ui/react';
import { useEffect } from 'react';
import { useSantorini } from '@hooks/useSantorini';
import HeaderBar from '@components/HeaderBar';
import GameBoard from '@components/GameBoard';
import EvaluationPanel from '@components/EvaluationPanel';
import HistoryModal from '@components/HistoryModal';

function App() {
  const {
    loading,
    initialize,
    board,
    selectable,
    onCellClick,
    onCellHover,
    onCellLeave,
    buttons,
    evaluation,
    topMoves,
    controls,
    history,
    redo,
    undo,
    calcOptionsBusy,
  } = useSantorini();
  const historyDisclosure = useDisclosure();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <Flex direction="column" minH="100vh" bgGradient="linear(to-br, gray.900, gray.800)" color="whiteAlpha.900">
      <HeaderBar
        controls={controls}
        onReset={controls.reset}
        onShowHistory={historyDisclosure.onOpen}
      />
      <Flex flex="1" py={{ base: 6, md: 8 }}>
        <Container maxW="7xl" flex="1">
          <Flex
            direction={{ base: 'column', xl: 'row' }}
            align="flex-start"
            justify="center"
            gap={{ base: 8, xl: 12 }}
            flexWrap="wrap"
          >
            <Box
              flexShrink={0}
              flexBasis={{ base: '100%', md: 'auto' }}
              display="flex"
              justifyContent="center"
            >
              {loading ? (
                <Flex
                  align="center"
                  justify="center"
                  minH="360px"
                  minW={{ base: '260px', md: '420px' }}
                  w="100%"
                >
                  <Spinner size="xl" color="teal.300" thickness="4px" />
                </Flex>
              ) : (
                <GameBoard
                  board={board}
                  selectable={selectable}
                  onCellClick={onCellClick}
                  onCellHover={onCellHover}
                  onCellLeave={onCellLeave}
                  buttons={buttons}
                  undo={undo}
                  redo={redo}
                />
              )}
            </Box>
            <Box
              flex="1"
              minW={{ base: '100%', xl: '380px' }}
              maxW={{ base: '100%', xl: '460px' }}
              width="100%"
            >
              <EvaluationPanel
                loading={loading}
                evaluation={evaluation}
                topMoves={topMoves}
                calcOptionsBusy={calcOptionsBusy}
                refreshEvaluation={controls.refreshEvaluation}
                calculateOptions={controls.calculateOptions}
                updateDepth={controls.updateCalcDepth}
              />
            </Box>
          </Flex>
        </Container>
      </Flex>
      <HistoryModal
        isOpen={historyDisclosure.isOpen}
        onClose={historyDisclosure.onClose}
        history={history}
        jumpToMove={controls.jumpToMove}
      />
    </Flex>
  );
}

export default App;
