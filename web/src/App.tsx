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
        buttons={buttons}
      />
      <Flex flex="1" py={{ base: 6, md: 8 }}>
        <Container maxW="7xl" flex="1">
          <Flex
            direction={{ base: 'column', lg: 'row' }}
            align={{ base: 'center', lg: 'flex-start' }}
            justify={{ base: 'center', lg: 'space-between' }}
            gap={{ base: 6, lg: 8 }}
            flexWrap="nowrap"
            w="100%"
          >
            <Box
              flexShrink={0}
              flexBasis={{ base: '100%', lg: 'auto' }}
              display="flex"
              justifyContent="center"
              w={{ base: '100%', sm: '400px', md: '500px', lg: '550px' }}
              minW={{ base: '300px', sm: '400px', md: '500px', lg: '550px' }}
              maxW={{ base: '100%', sm: '400px', md: '500px', lg: '550px' }}
            >
              {loading ? (
                <Flex
                  align="center"
                  justify="center"
                  h={{ base: "300px", sm: "400px", md: "500px", lg: "550px" }}
                  w={{ base: "100%", sm: "400px", md: "500px", lg: "550px" }}
                  minH={{ base: "300px", sm: "400px", md: "500px", lg: "550px" }}
                  minW={{ base: "300px", sm: "400px", md: "500px", lg: "550px" }}
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
              flex={{ base: "0 0 auto", lg: "0 0 auto" }}
              minW={{ base: '100%', lg: '320px' }}
              maxW={{ base: '100%', lg: '420px' }}
              width={{ base: '100%', lg: '420px' }}
              order={{ base: -1, lg: 0 }}
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
