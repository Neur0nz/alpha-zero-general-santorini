import { ReactNode, useMemo } from 'react';
import {
  Box,
  Flex,
  Heading,
  HStack,
  IconButton,
  Spacer,
  Tab,
  TabList,
  Text,
  Tooltip,
  VStack,
  useColorMode,
  useColorModeValue,
} from '@chakra-ui/react';
import { MoonIcon, SunIcon } from '@chakra-ui/icons';
import AuthJourney from '@components/auth/AuthJourney';
import type { SupabaseAuthState } from '@hooks/useSupabaseAuth';

export type AppTab = 'lobby' | 'play' | 'leaderboard' | 'practice' | 'analyze' | 'profile';

interface HeaderBarProps {
  activeTab: AppTab;
  actions?: ReactNode;
  auth: SupabaseAuthState;
}

const NAV_TABS: Array<{ key: AppTab; label: string; helper: string }> = [
  { key: 'lobby', label: 'Lobby', helper: 'Find players & matches' },
  { key: 'play', label: 'Play', helper: 'Active games & moves' },
  { key: 'leaderboard', label: 'Leaderboard', helper: 'Top rated players' },
  { key: 'practice', label: 'Practice', helper: 'Train with the AI' },
  { key: 'analyze', label: 'Analyze', helper: 'Review games & lines' },
  { key: 'profile', label: 'Profile', helper: 'Track your progress' },
];

function HeaderBar({ activeTab, actions, auth }: HeaderBarProps) {
  const { colorMode, toggleColorMode } = useColorMode();
  const bg = useColorModeValue('white', 'gray.850');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const headingColor = useColorModeValue('gray.900', 'white');
  const descriptionColor = useColorModeValue('gray.600', 'whiteAlpha.700');
  const helperMuted = useColorModeValue('gray.500', 'whiteAlpha.600');
  const tabBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const tabHover = useColorModeValue('white', 'whiteAlpha.200');
  const tabSelected = useColorModeValue('teal.50', 'teal.900');
  const tabSelectedColor = useColorModeValue('teal.800', 'teal.100');
  const tabHelperColor = useColorModeValue('gray.500', 'whiteAlpha.600');

  const activeTabDetails = useMemo(() => NAV_TABS.find((tab) => tab.key === activeTab), [activeTab]);

  return (
    <Box
      bg={bg}
      borderBottomWidth="1px"
      borderColor={borderColor}
      px={{ base: 3, md: 8 }}
      py={{ base: 4, md: 5 }}
      boxShadow={{ base: 'sm', md: 'none' }}
    >
      <Flex direction="column" gap={{ base: 3, md: 4 }}>
        <Flex
          direction={{ base: 'column', lg: 'row' }}
          align={{ base: 'flex-start', lg: 'center' }}
          gap={{ base: 2, md: 4 }}
        >
          <VStack align="flex-start" spacing={1}>
            <Heading size={{ base: 'md', md: 'lg' }} letterSpacing="tight" color={headingColor}>
              Ascent Santorini
            </Heading>
            <Text fontSize={{ base: 'sm', md: 'md' }} color={helperMuted}>
              Master Santorini with quick matchmaking, AI practice, and rich analysis.
            </Text>
          </VStack>
          <Spacer display={{ base: 'none', md: 'block' }} />
          <HStack
            spacing={3}
            align="center"
            w={{ base: '100%', lg: 'auto' }}
            justify={{ base: 'flex-end', lg: 'flex-end' }}
          >
            {actions && <Box display={{ base: 'flex', md: 'none' }}>{actions}</Box>}
            <AuthJourney auth={auth} />
            <Tooltip label="Toggle color mode" hasArrow>
              <IconButton
                aria-label="Toggle color mode"
                icon={colorMode === 'dark' ? <SunIcon /> : <MoonIcon />}
                size="sm"
                variant="outline"
                onClick={toggleColorMode}
              />
            </Tooltip>
          </HStack>
        </Flex>
        <Flex
          direction={{ base: 'column-reverse', md: 'row' }}
          align={{ base: 'stretch', md: 'center' }}
          gap={{ base: 3, md: 4 }}
        >
          <TabList
            display="flex"
            flexWrap="wrap"
            gap={{ base: 1, md: 2 }}
            borderBottom="none"
            justifyContent={{ base: 'center', md: 'flex-start' }}
            w="100%"
            sx={{ button: { fontWeight: 'semibold' } }}
          >
            {NAV_TABS.map((tab) => (
              <Tab
                key={tab.key}
                px={{ base: 3, md: 4 }}
                py={{ base: 2, md: 3 }}
                borderRadius="lg"
                bg={tabBg}
                color={descriptionColor}
                transition="all 0.15s ease-in-out"
                _hover={{ bg: tabHover, color: headingColor, transform: 'translateY(-1px)' }}
                _selected={{
                  bg: tabSelected,
                  color: tabSelectedColor,
                  boxShadow: 'md',
                  transform: 'translateY(-1px)',
                }}
              >
                <VStack spacing={0} align="flex-start">
                  <Text fontWeight="semibold">{tab.label}</Text>
                  <Text fontSize="xs" color={tabHelperColor}>
                    {tab.helper}
                  </Text>
                </VStack>
              </Tab>
            ))}
          </TabList>
          <Spacer />
          <HStack spacing={3} align="center">
            <Text fontSize="sm" color={descriptionColor} display={{ base: 'none', md: 'block' }}>
              {activeTabDetails ? activeTabDetails.helper : 'Explore Ascent features'}
            </Text>
            {actions && <HStack spacing={2} display={{ base: 'none', md: 'flex' }}>{actions}</HStack>}
          </HStack>
        </Flex>
      </Flex>
    </Box>
  );
}

export default HeaderBar;
