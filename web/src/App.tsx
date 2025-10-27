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
  useColorModeValue,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { SearchIcon } from '@chakra-ui/icons';
import { SantoriniProvider, useSantorini } from '@hooks/useSantorini';
import { useSupabaseAuth } from '@hooks/useSupabaseAuth';
import HeaderBar, { type AppTab } from '@components/HeaderBar';
import GameBoard from '@components/GameBoard';
import EvaluationPanel from '@components/EvaluationPanel';
import HistoryModal from '@components/HistoryModal';
import PracticeToolbar from '@components/PracticeToolbar';
import LobbyWorkspace from '@components/play/LobbyWorkspace';
import GamePlayWorkspace from '@components/play/GamePlayWorkspace';
import AnalyzeWorkspace from '@components/analyze/AnalyzeWorkspace';
import ProfileWorkspace from '@components/profile/ProfileWorkspace';

const TAB_ORDER: AppTab[] = ['lobby', 'play', 'practice', 'analyze', 'profile'];
const TAB_STORAGE_KEY = 'santorini:lastTab';

function PracticeTabContent({ onShowHistory }: { onShowHistory: () => void }) {
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
    redo,
    undo,
    calcOptionsBusy,
  } = useSantorini();
  const [, startInitializeTransition] = useTransition();

  useEffect(() => {
    // Initialize game engine in background without blocking urgent UI updates
    startInitializeTransition(() => {
      initialize().catch(console.error);
    });
  }, [initialize, startInitializeTransition]);

  return (
    <Flex direction="column" gap={{ base: 6, md: 8 }}>
      <PracticeToolbar
        controls={controls}
        onReset={controls.reset}
        onShowHistory={onShowHistory}
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
          flex="1 1 0"
          display="flex"
          justifyContent="center"
          w="100%"
          minW={{ base: '280px', sm: '360px' }}
          maxW="960px"
        >
          {loading ? (
            <Flex
              align="center"
              justify="center"
              h={{ base: '300px', sm: '400px', md: '500px', lg: '600px' }}
              w="100%"
              maxW="960px"
              minH={{ base: '300px', sm: '360px' }}
              minW={{ base: '280px', sm: '360px' }}
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
  );
}

function PracticeHistoryModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { history, controls } = useSantorini();
  return (
    <HistoryModal
      isOpen={isOpen}
      onClose={onClose}
      history={history}
      jumpToMove={controls.jumpToMove}
    />
  );
}

function App() {
  const { isOpen: isHistoryOpen, onOpen: openHistory, onClose: closeHistory } = useDisclosure();
  const tabOrder = TAB_ORDER;
  const [activeTab, setActiveTab] = useState<AppTab>('lobby');
  const activeIndex = Math.max(0, tabOrder.indexOf(activeTab));
  const auth = useSupabaseAuth();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const storedTab = window.localStorage.getItem(TAB_STORAGE_KEY) as AppTab | null;
      if (storedTab && tabOrder.includes(storedTab)) {
        setActiveTab(storedTab);
      }
    } catch (error) {
      console.error('Failed to restore last active tab', error);
    }
  }, [tabOrder]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    } catch (error) {
      console.error('Failed to persist last active tab', error);
    }
  }, [activeTab]);

  const tabActions = useMemo(() => {
    switch (activeTab) {
      case 'lobby':
        return null;
      case 'play':
        return null;
      case 'practice':
        return null;
      case 'analyze':
        return (
          <Tooltip label="Search saved games (coming soon)" hasArrow>
            <IconButton aria-label="Search games" icon={<SearchIcon />} size="sm" variant="outline" isDisabled />
          </Tooltip>
        );
      case 'profile':
        return null;
      default:
        return null;
    }
  }, [activeTab, openHistory]);

  const handleTabChange = (index: number) => {
    const nextTab = tabOrder[index];
    if (!nextTab) {
      return;
    }
    setActiveTab(nextTab);
  };

  const appBg = useColorModeValue('linear(to-br, gray.50, gray.100)', 'linear(to-br, gray.900, gray.800)');
  const appColor = useColorModeValue('gray.900', 'whiteAlpha.900');

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
      <Flex direction="column" flex="1" minH="100vh" bgGradient={appBg} color={appColor}>
        <HeaderBar activeTab={activeTab} actions={tabActions} auth={auth} />
        <Flex flex="1" py={{ base: 6, md: 8 }}>
          <Container maxW="7xl" flex="1" px={{ base: 3, md: 6 }}>
            <TabPanels flex="1">
              <TabPanel px={0}>
                <LobbyWorkspace auth={auth} onNavigateToPlay={() => setActiveTab('play')} />
              </TabPanel>
              <TabPanel px={0}>
                <GamePlayWorkspace auth={auth} />
              </TabPanel>
              <TabPanel px={0}>
                <SantoriniProvider>
                  <PracticeTabContent onShowHistory={openHistory} />
                  <PracticeHistoryModal isOpen={isHistoryOpen} onClose={closeHistory} />
                </SantoriniProvider>
              </TabPanel>
              <TabPanel px={0}>
                <SantoriniProvider evaluationEnabled={true}>
                  <AnalyzeWorkspace auth={auth} />
                </SantoriniProvider>
              </TabPanel>
              <TabPanel px={0}>
                <ProfileWorkspace auth={auth} />
              </TabPanel>
            </TabPanels>
          </Container>
        </Flex>
      </Flex>
    </Tabs>
  );
}

export default App;
