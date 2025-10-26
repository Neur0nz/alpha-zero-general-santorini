import { Box, Flex, Spinner, useDisclosure } from '@chakra-ui/react';
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
    <Flex direction="column" minH="100vh" bg="gray.900" color="whiteAlpha.900">
      <HeaderBar
        controls={controls}
        onReset={controls.reset}
        onShowHistory={historyDisclosure.onOpen}
      />
      <Flex
        direction={{ base: 'column', xl: 'row' }}
        flex="1"
        gap={{ base: 6, xl: 8 }}
        px={{ base: 4, md: 8 }}
        py={{ base: 6, md: 8 }}
      >
        <Box flex="0 0 auto">
          {loading ? (
            <Flex align="center" justify="center" minH="400px">
              <Spinner size="xl" color="teal.300" />
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
        <Box flex="1" minW={{ base: '100%', xl: '420px' }}>
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
