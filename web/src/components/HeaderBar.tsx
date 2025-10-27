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
  useColorMode,
  useColorModeValue,
} from '@chakra-ui/react';
import { MoonIcon, SunIcon } from '@chakra-ui/icons';
import AuthJourney from '@components/auth/AuthJourney';
import type { SupabaseAuthState } from '@hooks/useSupabaseAuth';

export type AppTab = 'practice' | 'play' | 'analyze';

interface HeaderBarProps {
  activeTab: AppTab;
  actions?: ReactNode;
  auth: SupabaseAuthState;
}

function HeaderBar({ activeTab, actions, auth }: HeaderBarProps) {
  const { colorMode, toggleColorMode } = useColorMode();
  const bg = useColorModeValue('whiteAlpha.200', 'gray.800');
  const headingColor = useColorModeValue('whiteAlpha.900', 'white');
  const activeTabLabel = useMemo(
    () => `${activeTab.charAt(0).toUpperCase()}${activeTab.slice(1)} workspace`,
    [activeTab],
  );

  return (
    <Box bg={bg} borderBottomWidth="1px" borderColor="whiteAlpha.200" px={{ base: 3, md: 8 }} py={{ base: 3, md: 4 }}>
      <Flex direction="column" gap={{ base: 3, md: 4 }}>
        <Flex direction={{ base: 'column', md: 'row' }} align={{ base: 'flex-start', md: 'center' }} gap={{ base: 2, md: 3 }}>
          <Heading size={{ base: 'sm', md: 'md' }} letterSpacing="wide" color={headingColor}>
          Ascent, Competitive Santorini.
          </Heading>
          <Spacer display={{ base: 'none', md: 'block' }} />
          <HStack spacing={2} align="center" w={{ base: '100%', md: 'auto' }} justify={{ base: 'flex-end', md: 'flex-end' }}>
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
        <Flex direction={{ base: 'column', md: 'row' }} align={{ base: 'stretch', md: 'center' }} gap={{ base: 2, md: 4 }}>
          <TabList
            display="flex"
            flexWrap="wrap"
            gap={{ base: 1, md: 2 }}
            borderBottom="none"
            justifyContent={{ base: 'center', md: 'flex-start' }}
            w="100%"
            sx={{ button: { fontWeight: 'semibold' } }}
          >
            <Tab
              _selected={{ color: 'teal.300', boxShadow: 'inset 0 -2px 0 0 currentColor' }}
              px={{ base: 2, md: 3 }}
              py={{ base: 1, md: 2 }}
            >
              Play
            </Tab>
            <Tab
              _selected={{ color: 'teal.300', boxShadow: 'inset 0 -2px 0 0 currentColor' }}
              px={{ base: 2, md: 3 }}
              py={{ base: 1, md: 2 }}
            >
              Practice
            </Tab>
            <Tab
              _selected={{ color: 'teal.300', boxShadow: 'inset 0 -2px 0 0 currentColor' }}
              px={{ base: 2, md: 3 }}
              py={{ base: 1, md: 2 }}
            >
              Analyze
            </Tab>
          </TabList>
          <Spacer />
          <HStack spacing={3} align="center">
            <Text fontSize="sm" color="whiteAlpha.700" display={{ base: 'none', md: 'block' }}>
              {activeTabLabel}
            </Text>
            {actions && <HStack spacing={2} display={{ base: 'none', md: 'flex' }}>{actions}</HStack>}
          </HStack>
        </Flex>
      </Flex>
    </Box>
  );
}

export default HeaderBar;
