import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, type SupabaseClient } from '@/lib/supabaseClient';
import type { AuthChangeEvent, PostgrestError, Session, User } from '@supabase/supabase-js';
import type { PlayerProfile } from '@/types/match';
import { generateDisplayName, validateDisplayName } from '@/utils/generateDisplayName';

interface AuthState {
  session: Session | null;
  profile: PlayerProfile | null;
  loading: boolean;
  error: string | null;
}

const DEFAULT_STATE: AuthState = {
  session: null,
  profile: null,
  loading: true,
  error: null,
};

function getDisplayNameSeed(user: User): string | undefined {
  const metadataName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : undefined;
  if (metadataName && metadataName.trim().length > 0) {
    return metadataName;
  }
  if (user.email) {
    return user.email.split('@')[0];
  }
  return undefined;
}

async function ensureProfile(client: SupabaseClient, user: User): Promise<PlayerProfile> {
  console.log('Ensuring profile for user:', user.id);
  
  
  try {
    const { data, error } = await client
      .from('players')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Failed to load player profile', error);
      throw error;
    }

    if (data) {
      console.log('Found existing profile:', data);
      return data as PlayerProfile;
    }

    console.log('No existing profile found, creating new one...');
    const seed = getDisplayNameSeed(user);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateDisplayName(seed);
      console.log(`Attempt ${attempt + 1}: Creating profile with display name "${candidate}"`);
      
      const { data: insertData, error: insertError } = await client
        .from('players')
        .insert({ auth_user_id: user.id, display_name: candidate })
        .select('*')
        .single();

      if (!insertError && insertData) {
        console.log('Successfully created profile:', insertData);
        return insertData as PlayerProfile;
      }

      if ((insertError as PostgrestError | null)?.code !== '23505') {
        console.error('Failed to create player profile', insertError);
        throw insertError;
      }
      
      console.log(`Display name "${candidate}" already exists, trying again...`);
    }

    throw new Error('Unable to generate a unique display name. Please try again.');
  } catch (error) {
    console.error('ensureProfile failed:', error);
    
    // If database is completely unavailable, create a temporary fallback profile
    if (error instanceof Error && 
        (error.message.includes('fetch') || 
         error.message.includes('network') ||
         error.message.includes('timeout') ||
         error.message.includes('Failed to load player profile'))) {
      console.warn('Database unavailable, creating temporary profile');
      const fallbackProfile: PlayerProfile = {
        id: `temp_${user.id}`,
        auth_user_id: user.id,
        display_name: getDisplayNameSeed(user) || `Player_${user.id.slice(0, 8)}`,
        rating: 1200,
        games_played: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      return fallbackProfile;
    }
    
    throw error;
  }
}

// Simple cache for instant auth
const CACHE_KEY = 'santorini-auth-cache';

const cacheAuthState = (session: Session | null, profile: PlayerProfile | null) => {
  if (typeof window !== 'undefined' && session) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        session,
        profile,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('Failed to cache auth state:', error);
    }
  }
};

const getCachedAuthState = (): { session: Session; profile: PlayerProfile } | null => {
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { session, profile, timestamp } = JSON.parse(cached);
        // Use cache if less than 1 hour old
        if (Date.now() - timestamp < 60 * 60 * 1000) {
          return { session, profile };
        }
        // Clear old cache
        localStorage.removeItem(CACHE_KEY);
      }
    } catch (error) {
      localStorage.removeItem(CACHE_KEY);
    }
  }
  return null;
};

export function useSupabaseAuth() {
  const [state, setState] = useState<AuthState>(() => {
    const cached = getCachedAuthState();
    if (cached) {
      console.log('Restoring auth state from cache');
      return { session: cached.session, profile: cached.profile, loading: false, error: null };
    }
    return DEFAULT_STATE;
  });
  
  const isConfigured = Boolean(supabase);
  const loadingProfileRef = useRef<Promise<void> | null>(null);

  const loadSessionProfile = useCallback(async (session: Session | null) => {
    const client = supabase;
    if (!client) {
      setState({ session: null, profile: null, loading: false, error: 'Supabase is not configured.' });
      return;
    }

    if (!session) {
      setState({ session: null, profile: null, loading: false, error: null });
      return;
    }

    // Check if we're already loading a profile for this user
    if (loadingProfileRef.current) {
      console.log('Profile loading already in progress, waiting...');
      await loadingProfileRef.current;
      return;
    }

    // Check if we already have a profile for this user
    if (state.profile?.auth_user_id === session.user.id) {
      console.log('Profile already loaded for this user');
      const newState = { session, profile: state.profile, loading: false, error: null };
      setState(newState);
      cacheAuthState(session, state.profile);
      return;
    }

    setState((prev) => ({
      ...prev,
      session,
      loading: true,
      error: null,
    }));

    const loadPromise = (async () => {
      try {
        console.log('Loading profile for session user:', session.user.id);
        
        // Add a timeout wrapper for the profile loading
        const profilePromise = ensureProfile(client, session.user);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Profile loading timed out')), 10000);
        });
        
        const profile = await Promise.race([profilePromise, timeoutPromise]);
        console.log('Profile loaded successfully:', profile);
        const newState = { session, profile, loading: false, error: null };
        setState(newState);
        cacheAuthState(session, profile);
      } catch (profileError) {
        console.error('Failed to load player profile', profileError);
        
        // Check if it's a network error or timeout
        const isNetworkError = profileError instanceof Error && 
          (profileError.message.includes('fetch') || 
           profileError.message.includes('network') ||
           profileError.message.includes('timeout') ||
           profileError.message.includes('Profile loading timed out'));
        
        const errorMessage = isNetworkError 
          ? 'Network connection issue. Please check your internet connection and try again.'
          : 'Failed to load player profile. Please try again.';
          
        setState({ session, profile: null, loading: false, error: errorMessage });
      } finally {
        loadingProfileRef.current = null;
      }
    })();

    loadingProfileRef.current = loadPromise;
    await loadPromise;
  }, [state.profile]);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setState({ session: null, profile: null, loading: false, error: 'Supabase is not configured.' });
      return;
    }

    const init = async () => {
      try {
        const {
          data: { session },
          error,
        } = await client.auth.getSession();

        if (error) {
          console.error('Failed to load Supabase session', error);
          
          // Check if it's a network error
          const isNetworkError = error.message && 
            (error.message.includes('fetch') || 
             error.message.includes('network') ||
             error.message.includes('timeout'));
          
          const errorMessage = isNetworkError 
            ? 'Network connection issue. Please check your internet connection and refresh the page.'
            : 'Unable to load authentication session. Please refresh and try again.';
            
          setState({ session: null, profile: null, loading: false, error: errorMessage });
          return;
        }

        await loadSessionProfile(session);
      } catch (err) {
        console.error('Failed to initialize authentication', err);
        
        // Check if it's a network error
        const isNetworkError = err instanceof Error && 
          (err.message.includes('fetch') || 
           err.message.includes('network') ||
           err.message.includes('timeout'));
        
        const errorMessage = isNetworkError 
          ? 'Network connection issue. Please check your internet connection and refresh the page.'
          : 'Failed to initialize authentication. Please refresh the page and try again.';
          
        setState({ session: null, profile: null, loading: false, error: errorMessage });
      }
    };

    init();

    const { data: listener } = client.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      console.log('Auth state change:', event, session?.user?.id);
      await loadSessionProfile(session);
    });

    return () => {
      listener.subscription.unsubscribe();
      loadingProfileRef.current = null;
    };
  }, []); // Remove loadSessionProfile from dependencies to prevent re-initialization

  const refreshProfile = useCallback(async () => {
    const client = supabase;
    if (!client) {
      throw new Error('Supabase is not configured.');
    }
    
    console.log('Refreshing profile...');
    const {
      data: { session },
      error,
    } = await client.auth.getSession();
    if (error) {
      console.error('Failed to refresh Supabase session', error);
      throw error;
    }
    
    if (!session) {
      console.log('No session found during refresh');
      setState({ session: null, profile: null, loading: false, error: null });
      return;
    }
    
    await loadSessionProfile(session);
  }, [loadSessionProfile]);

  const signInWithGoogle = useCallback(async () => {
    const client = supabase;
    if (!client) {
      throw new Error('Supabase is not configured.');
    }
    
    // Determine the correct redirect URL based on environment
    const redirectTo = window.location.origin + window.location.pathname;
    
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) {
      console.error('Failed to start Google sign-in', error);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) {
      console.error('Failed to sign out', error);
      throw error;
    }
    // Clear cache on sign out
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CACHE_KEY);
    }
  }, []);

  const userId = state.session?.user.id ?? null;

  const updateDisplayName = useCallback(
    async (displayName: string) => {
      const client = supabase;
      if (!client) {
        throw new Error('Supabase is not configured.');
      }
      if (!userId) {
        throw new Error('You must be signed in to update your display name.');
      }

      const validationError = validateDisplayName(displayName);
      if (validationError) {
        throw new Error(validationError);
      }

      const normalized = displayName.trim();
      const { data, error } = await client
        .from('players')
        .update({ display_name: normalized })
        .eq('auth_user_id', userId)
        .select('*')
        .single();

      if (error) {
        if ((error as PostgrestError | null)?.code === '23505') {
          throw new Error('That display name is already taken. Try another one.');
        }
        console.error('Failed to update display name', error);
        throw error;
      }

      setState((prev) => ({ ...prev, profile: data as PlayerProfile }));
    },
    [userId]
  );

  useEffect(() => {
    if (!state.loading) {
      return undefined;
    }

    if (typeof window === 'undefined') {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setState((prev) => {
        if (!prev.loading) {
          return prev;
        }

        // Don't timeout if we're actively loading a profile
        if (loadingProfileRef.current) {
          console.log('Profile loading in progress, extending timeout...');
          return prev;
        }

        console.warn('Authentication request timed out. Resetting state to allow retry.');

        const fallbackError = prev.session && !prev.profile
          ? 'We were unable to finish loading your profile. Please try refreshing the page or sign in again.'
          : 'Unable to reach Supabase to verify your session. Please check your internet connection and try again.';

        return {
          session: null,
          profile: null,
          loading: false,
          error: prev.error ?? fallbackError,
        };
      });
    }, 15000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [state.loading, state.session, state.profile]);

  return {
    session: state.session,
    profile: state.profile,
    loading: state.loading,
    error: state.error,
    isConfigured,
    refreshProfile,
    signInWithGoogle,
    signOut,
    updateDisplayName,
  };
}

export type SupabaseAuthState = ReturnType<typeof useSupabaseAuth>;
