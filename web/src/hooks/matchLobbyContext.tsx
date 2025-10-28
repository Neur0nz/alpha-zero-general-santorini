import { createContext, useContext, type ReactNode, useEffect } from 'react';
import type { PlayerProfile } from '@/types/match';
import { useMatchLobby } from './useMatchLobby';

type MatchLobbyValue = ReturnType<typeof useMatchLobby>;

const MatchLobbyContext = createContext<MatchLobbyValue | null>(null);

interface MatchLobbyProviderProps {
  profile: PlayerProfile | null;
  children: ReactNode;
}

export function MatchLobbyProvider({ profile, children }: MatchLobbyProviderProps) {
  const lobby = useMatchLobby(profile, { autoConnectOnline: true });
  const { onlineEnabled, disableOnline, enableOnline, sessionMode } = lobby;

  useEffect(() => {
    // Don't interfere with local mode
    if (sessionMode === 'local') {
      return;
    }
    
    if (!profile && onlineEnabled) {
      disableOnline();
    } else if (profile && !onlineEnabled) {
      enableOnline();
    }
  }, [profile, onlineEnabled, disableOnline, enableOnline, sessionMode]);

  return <MatchLobbyContext.Provider value={lobby}>{children}</MatchLobbyContext.Provider>;
}

export function useMatchLobbyContext(): MatchLobbyValue {
  const context = useContext(MatchLobbyContext);
  if (!context) {
    throw new Error('useMatchLobbyContext must be used within a MatchLobbyProvider');
  }
  return context;
}
