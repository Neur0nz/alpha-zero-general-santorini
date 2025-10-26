import {
  Box,
  Container,
  Flex,
  IconButton,
  Spinner,
  TabPanel,
  TabPanels,
  Tabs,
  Tooltip,
  useDisclosure,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { TimeIcon, SmallAddIcon, SearchIcon } from '@chakra-ui/icons';
import { useSantorini } from '@hooks/useSantorini';
import { useSupabaseAuth } from '@hooks/useSupabaseAuth';
import HeaderBar, { type AppTab } from '@components/HeaderBar';
import GameBoard from '@components/GameBoard';
import EvaluationPanel from '@components/EvaluationPanel';
import HistoryModal from '@components/HistoryModal';
import PracticeToolbar from '@components/PracticeToolbar';
import PlayWorkspace from '@components/play/PlayWorkspace';
import AnalyzeWorkspace from '@components/analyze/AnalyzeWorkspace';

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
  const { isOpen: isHistoryOpen, onOpen: openHistory, onClose: closeHistory } = useDisclosure();
  const tabOrder: AppTab[] = ['practice', 'play', 'analyze'];
  const [activeTab, setActiveTab] = useState<AppTab>('practice');
  const activeIndex = tabOrder.indexOf(activeTab);
  const auth = useSupabaseAuth();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const tabActions = useMemo(() => {
    switch (activeTab) {
      case 'practice':
        return (
          <Tooltip label="Jump to history" hasArrow>
            <IconButton
              aria-label="History"
              icon={<TimeIcon />}
              size="sm"
              variant="outline"
              colorScheme="blue"
              onClick={openHistory}
            />
          </Tooltip>
        );
      case 'play':
        return (
          <Tooltip label="Create a new match (coming soon)" hasArrow>
            <IconButton aria-label="Create match" icon={<SmallAddIcon />} size="sm" variant="outline" isDisabled />
          </Tooltip>
        );
      case 'analyze':
        return (
          <Tooltip label="Search saved games (coming soon)" hasArrow>
            <IconButton aria-label="Search games" icon={<SearchIcon />} size="sm" variant="outline" isDisabled />
          </Tooltip>
        );
      default:
        return null;
    }
  }, [activeTab, openHistory]);

  const handleTabChange = (index: number) => {
    setActiveTab(tabOrder[index]);
  };

  return (
    <Tabs
      index={activeIndex}
      onChange={handleTabChange}
      isLazy
      variant="unstyled"
      h="100%"
      display="flex"
      flexDirection="column"
      minH="100vh"
    >
      <Flex direction="column" flex="1" minH="100vh" bgGradient="linear(to-br, gray.900, gray.800)" color="whiteAlpha.900">
        <HeaderBar activeTab={activeTab} actions={tabActions} auth={auth} />
        <Flex flex="1" py={{ base: 6, md: 8 }}>
          <Container maxW="7xl" flex="1">
            <TabPanels flex="1">
              <TabPanel px={0}>
                <Flex direction="column" gap={{ base: 6, md: 8 }}>
                  <PracticeToolbar
                    controls={controls}
                    onReset={controls.reset}
                    onShowHistory={openHistory}
                    buttons={buttons}
                  />
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
                          h={{ base: '300px', sm: '400px', md: '500px', lg: '550px' }}
                          w={{ base: '100%', sm: '400px', md: '500px', lg: '550px' }}
                          minH={{ base: '300px', sm: '400px', md: '500px', lg: '550px' }}
                          minW={{ base: '300px', sm: '400px', md: '500px', lg: '550px' }}
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
                      flex={{ base: '0 0 auto', lg: '0 0 auto' }}
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
                </Flex>
              </TabPanel>
              <TabPanel px={0}>
                <PlayWorkspace auth={auth} />
              </TabPanel>
              <TabPanel px={0}>
                <AnalyzeWorkspace />
              </TabPanel>
            </TabPanels>
          </Container>
        </Flex>
        <HistoryModal
          isOpen={isHistoryOpen}
          onClose={closeHistory}
          history={history}
          jumpToMove={controls.jumpToMove}
        />
      </Flex>
    </Tabs>
  );
}

export default App;
