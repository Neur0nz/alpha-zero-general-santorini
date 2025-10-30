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

const PROFILE_QUERY_FIELDS =
  'id, auth_user_id, display_name, rating, games_played, created_at, updated_at';
const PROFILE_RETRY_DELAY = 2000; // Retry quickly to mask transient hiccups

const NETWORK_ERROR_TOKENS = ['fetch', 'network', 'timeout', 'offline'];
const INVALID_SESSION_TOKENS = [
  'invalid refresh token',
  'refresh token not found',
  'session not found',
  'invalid grant',
  'expired',
  'jwt expired',
  'token has expired',
  'invalid_token',
];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return '';
}

function isNetworkError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return NETWORK_ERROR_TOKENS.some((token) => message.includes(token));
}

function isInvalidSessionError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  if (!message) {
    return false;
  }
  return INVALID_SESSION_TOKENS.some((token) => message.includes(token));
}

function isPostgrestUnauthorizedError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const maybePostgrest = error as Partial<PostgrestError> & { status?: number };
    const code = typeof maybePostgrest.code === 'string' ? maybePostgrest.code.toLowerCase() : '';
    const message = typeof maybePostgrest.message === 'string' ? maybePostgrest.message.toLowerCase() : '';

    if (
      code === '42501' ||
      code === 'pgrst301' ||
      code === 'pgrst302' ||
      code === 'pgrst303' ||
      message.includes('jwt expired') ||
      message.includes('invalid jwt') ||
      message.includes('permission denied') ||
      message.includes('no auth header')
    ) {
      return true;
    }
  }

  return INVALID_SESSION_TOKENS.some((token) => getErrorMessage(error).toLowerCase().includes(token));
}

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

async function ensureProfile(client: SupabaseClient, user: User, signal?: AbortSignal): Promise<PlayerProfile> {
  try {
    const selectQuery = client
      .from('players')
      .select(PROFILE_QUERY_FIELDS)
      .eq('auth_user_id', user.id);

    if (signal) {
      (selectQuery as any).abortSignal?.(signal);
    }

    const { data, error } = await selectQuery.maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data as PlayerProfile;
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('fetch') ||
        error.message.includes('network') ||
        error.message.includes('timeout'))
    ) {
      console.warn('Profile fetch failed, will retry without creating temporary profile.', error.message);
      // Don't create temporary profile - just throw the error and let retry logic handle it
      // This prevents subscription teardown during network issues
      throw error;
    }
    throw error;
  }

  // No profile exists yet, create one with a deterministic seed.
  const seed = getDisplayNameSeed(user);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateDisplayName(seed);
    try {
      const insertQuery = client
        .from('players')
        .insert({ auth_user_id: user.id, display_name: candidate })
        .select(PROFILE_QUERY_FIELDS)
        .single();

      if (signal) {
        (insertQuery as any).abortSignal?.(signal);
      }

      const { data: insertData, error: insertError } = await insertQuery;

      if (!insertError && insertData) {
        return insertData as PlayerProfile;
      }

      if ((insertError as PostgrestError | null)?.code !== '23505') {
        throw insertError;
      }
      // Duplicate name, try again.
      } catch (insertError) {
        if (
          insertError instanceof Error &&
          (insertError.message.includes('fetch') ||
            insertError.message.includes('network') ||
            insertError.message.includes('timeout'))
      ) {
        continue;
      }
      throw insertError;
    }
  }

  throw new Error('Unable to generate a unique display name. Please try again.');
}

// Simple cache for instant auth
const CACHE_KEY = 'santorini-auth-cache';

const cacheAuthState = (session: Session | null, profile: PlayerProfile | null) => {
  if (typeof window !== 'undefined') {
    try {
      if (session && profile) {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          session,
          profile,
          timestamp: Date.now()
        }));
      } else {
        localStorage.removeItem(CACHE_KEY);
      }
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
  const cachedInitialState = getCachedAuthState();
  const cachedStateRef = useRef(cachedInitialState);
  const [state, setState] = useState<AuthState>(() => {
    if (cachedInitialState) {
      console.log('Restoring auth state from cache');
      return { session: cachedInitialState.session, profile: cachedInitialState.profile, loading: false, error: null };
    }
    return DEFAULT_STATE;
  });
  
  const isConfigured = Boolean(supabase);
  const loadingProfileRef = useRef<Promise<void> | null>(null);
  const activeRequestIdRef = useRef(0);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeUserIdRef = useRef<string | null>(null);

  const clearCachedSession = useCallback(async () => {
    const client = supabase;
    if (client) {
      try {
        await client.auth.signOut({ scope: 'local' });
      } catch (signOutError) {
        console.warn('Failed to clear Supabase local session cache', signOutError);
      }
    }
    cacheAuthState(null, null);
    cachedStateRef.current = null;
  }, []);

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

    // Check if we're already loading a profile. If it's for the same user, just wait.
    if (loadingProfileRef.current) {
      console.log('Profile loading already in progress, waiting...');
      await loadingProfileRef.current;
      return;
    }

    // Cancel any in-flight request only if it exists for a different user
    if (activeAbortControllerRef.current && activeUserIdRef.current && activeUserIdRef.current !== session.user.id) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }

    // Check if we already have a profile for this user
    const cachedProfile = cachedStateRef.current?.profile;
    if (cachedProfile?.auth_user_id === session.user.id && !cachedProfile.id.startsWith('temp_')) {
      console.log('Using cached profile for this user');
      const newState = { session, profile: cachedProfile, loading: false, error: null };
      setState(newState);
      cacheAuthState(session, cachedProfile);
      return;
    }

    if (state.profile?.auth_user_id === session.user.id && !state.profile.id.startsWith('temp_')) {
      console.log('Profile already loaded for this user');
      const newState = { session, profile: state.profile, loading: false, error: null };
      setState(newState);
      cacheAuthState(session, state.profile);
      return;
    }

    activeRequestIdRef.current += 1;
    const requestId = activeRequestIdRef.current;
    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;
    activeUserIdRef.current = session.user.id;

    setState((prev) => ({
      ...prev,
      session,
      loading: true,
      error: null,
    }));

    let promiseRef: Promise<void>;
    const run = async () => {
      try {
        console.log('Loading profile for session user:', session.user.id);
        
        // Load profile with retry logic
        let retryCount = 0;
        const maxRetries = 3;
        let profile: PlayerProfile | null = null;
        let lastError: unknown = null;
        const errors: unknown[] = [];

        while (retryCount < maxRetries && !profile) {
          try {
            console.log(`Loading profile for session user: ${session.user.id} (attempt ${retryCount + 1})`);
            profile = await ensureProfile(client, session.user, abortController.signal);
            console.log('✅ Profile loaded successfully');
          } catch (error) {
            lastError = error;
            errors.push(error);
            if (isInvalidSessionError(error) || isPostgrestUnauthorizedError(error)) {
              console.warn('Profile load failed due to invalid or expired session. Clearing cached auth state.', error);
              await clearCachedSession();
              setState({ session: null, profile: null, loading: false, error: 'Your session expired. Please sign in again.' });
              return;
            }

            retryCount++;
            console.warn(`Profile load attempt ${retryCount} failed:`, error);

            const shouldStopEarly = isNetworkError(error);

            if (retryCount < maxRetries && !shouldStopEarly) {
              console.log(`Retrying profile load in ${PROFILE_RETRY_DELAY}ms... (attempt ${retryCount + 1}/${maxRetries})`);
              await new Promise((resolve) => setTimeout(resolve, PROFILE_RETRY_DELAY));
            } else {
              console.error('All profile load attempts failed:', error);
              break;
            }
          }
        }

        if (!profile && cachedStateRef.current?.profile?.auth_user_id === session.user.id) {
          console.warn('Falling back to cached profile after failed attempts.');
          const cachedProfile = cachedStateRef.current.profile;
          if (activeRequestIdRef.current !== requestId) {
            return;
          }
          setState({ session, profile: cachedProfile, loading: false, error: lastError instanceof Error ? lastError.message : null });
          cacheAuthState(session, cachedProfile);
          return;
        }

        if (profile) {
          if (activeRequestIdRef.current !== requestId) {
            return;
          }

          const newState = { session, profile, loading: false, error: null };
          setState(newState);
          cacheAuthState(session, profile);
          cachedStateRef.current = { session, profile };
        } else {
          const networkError = lastError && (isNetworkError(lastError) || (lastError instanceof Error && lastError.message.includes('Profile loading timed out')));

          const errorMessage = networkError
            ? 'Network connection issue. Please check your internet connection and try again.'
            : 'Failed to load player profile. Please try again.';

          if (networkError && cachedStateRef.current?.profile) {
            const cachedProfile = cachedStateRef.current.profile;
            if (activeRequestIdRef.current !== requestId) {
              return;
            }
            setState({ session, profile: cachedProfile, loading: false, error: errorMessage });
            cacheAuthState(session, cachedProfile);
            console.warn('Using cached profile due to network issues during profile load.', errors);
            return;
          }

          if (activeRequestIdRef.current !== requestId) {
            return;
          }

          setState({ session, profile: null, loading: false, error: errorMessage });
          return;
        }
      } catch (profileError) {
        if (profileError instanceof Error && profileError.name === 'AbortError') {
          console.log('Profile load request was aborted');
          return;
        }
        if (isInvalidSessionError(profileError) || isPostgrestUnauthorizedError(profileError)) {
          console.warn('Profile load failed after retries due to invalid session. Clearing cached auth state.', profileError);
          await clearCachedSession();
          if (activeRequestIdRef.current !== requestId) {
            return;
          }
          setState({ session: null, profile: null, loading: false, error: 'Your session expired. Please sign in again.' });
          return;
        }

        console.error('Failed to load player profile', profileError);

        // Check if it's a network error or timeout
        const networkError = isNetworkError(profileError) || (profileError instanceof Error && profileError.message.includes('Profile loading timed out'));

        const errorMessage = networkError 
          ? 'Network connection issue. Please check your internet connection and try again.'
          : 'Failed to load player profile. Please try again.';

        if (networkError && cachedStateRef.current?.profile) {
          const cachedProfile = cachedStateRef.current.profile;
          if (activeRequestIdRef.current !== requestId) {
            return;
          }
          setState({ session, profile: cachedProfile, loading: false, error: errorMessage });
          cacheAuthState(session, cachedProfile);
        } else {
          if (activeRequestIdRef.current !== requestId) {
            return;
          }
          setState((prev) => ({
            session,
            profile: prev.profile,
            loading: false,
            error: errorMessage,
          }));
        }
      } finally {
        if (loadingProfileRef.current === promiseRef) {
          loadingProfileRef.current = null;
        }
        if (activeAbortControllerRef.current === abortController) {
          activeAbortControllerRef.current = null;
        }
        if (activeUserIdRef.current === session.user.id) {
          activeUserIdRef.current = null;
        }
        abortController.abort();
      }
    };

    promiseRef = run();

    loadingProfileRef.current = promiseRef;
    await promiseRef;
  }, [clearCachedSession, state.profile]);

  const restoreSessionFromCache = useCallback(async (): Promise<Session | null> => {
    const client = supabase;
    if (!client) {
      return null;
    }
    const cached = cachedStateRef.current;
    if (!cached?.session) {
      return null;
    }
    const { access_token: accessToken, refresh_token: refreshToken } = cached.session;
    if (!accessToken || !refreshToken) {
      return null;
    }

    try {
      const { data, error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) {
        if (isInvalidSessionError(error)) {
          console.warn('Cached Supabase session is no longer valid. Clearing cache.', error);
          await clearCachedSession();
          return null;
        }

        if (isNetworkError(error)) {
          console.warn('Network error while restoring Supabase session from cache. Falling back to cached data.', error);
          return cached.session;
        }

        console.warn('Unexpected error while restoring Supabase session from cache', error);
        return cached.session;
      }

      return data.session ?? cached.session;
    } catch (error) {
      if (isInvalidSessionError(error)) {
        console.warn('Cached Supabase session is invalid. Clearing cache.', error);
        await clearCachedSession();
        return null;
      }

      if (isNetworkError(error)) {
        console.warn('Network issue while restoring Supabase session from cache. Falling back to cached data.', error);
        return cached.session;
      }

      console.warn('Unexpected error while restoring Supabase session from cache', error);
      return cached.session;
    }
  }, [clearCachedSession]);

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

          if (isInvalidSessionError(error)) {
            await clearCachedSession();
            setState({ session: null, profile: null, loading: false, error: 'Your session expired. Please sign in again.' });
            return;
          }

          const networkIssue = isNetworkError(error);
          const errorMessage = networkIssue
            ? 'Network connection issue. Please check your internet connection and refresh the page.'
            : 'Unable to load authentication session. Please refresh and try again.';

          const cached = cachedStateRef.current;
          if (cached && networkIssue) {
            setState({ session: cached.session, profile: cached.profile, loading: false, error: errorMessage });
          } else {
            setState({ session: null, profile: null, loading: false, error: errorMessage });
          }
          return;
        }

        if (session) {
          await loadSessionProfile(session);
          return;
        }

        const restored = await restoreSessionFromCache();
        if (restored) {
          await loadSessionProfile(restored);
        } else {
          setState({ session: null, profile: null, loading: false, error: null });
        }
      } catch (err) {
        console.error('Failed to initialize authentication', err);

        if (isInvalidSessionError(err)) {
          await clearCachedSession();
          setState({ session: null, profile: null, loading: false, error: 'Your session expired. Please sign in again.' });
          return;
        }

        const networkIssue = isNetworkError(err);
        const errorMessage = networkIssue
          ? 'Network connection issue. Please check your internet connection and refresh the page.'
          : 'Failed to initialize authentication. Please refresh the page and try again.';

        const cached = cachedStateRef.current;
        if (cached && networkIssue) {
          setState({ session: cached.session, profile: cached.profile, loading: false, error: errorMessage });
        } else {
          setState({ session: null, profile: null, loading: false, error: errorMessage });
        }
      }
    };

    init();

    const { data: listener } = client.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      console.log('Auth state change:', event, session?.user?.id);
      if (event === 'INITIAL_SESSION') {
        if (session) {
          void loadSessionProfile(session);
        }
        return;
      }

      if (!session && cachedStateRef.current?.session && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')) {
        void loadSessionProfile(cachedStateRef.current.session);
        return;
      }

      void loadSessionProfile(session);
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
    
    try {
      const { error } = await client.auth.signOut();
      if (error) {
        // If sign out fails due to stale/missing session, clear local state anyway
        console.warn('Sign out failed on server, clearing local state anyway', error);
        if (error.message.includes('session') || error.message.includes('missing') || error.message.includes('403')) {
          // Session already invalid on server, just clear local state
          if (typeof window !== 'undefined') {
            localStorage.removeItem(CACHE_KEY);
          }
          cachedStateRef.current = null;
          setState({ session: null, profile: null, loading: false, error: null });
          return;
        }
        // For other errors, still throw
        throw error;
      }
    } catch (error) {
      // Even if sign out completely fails, clear local state so user isn't stuck
      console.error('Sign out error, clearing local state anyway', error);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(CACHE_KEY);
      }
      cachedStateRef.current = null;
      setState({ session: null, profile: null, loading: false, error: null });
      return;
    }
    
    // Successful sign out - clear cache
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CACHE_KEY);
    }
    cachedStateRef.current = null;
    setState({ session: null, profile: null, loading: false, error: null });
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
          console.warn('Profile load timed out. Cancelling current attempt.');
          activeRequestIdRef.current += 1;
          activeAbortControllerRef.current?.abort();
          activeAbortControllerRef.current = null;
          loadingProfileRef.current = null;
          return {
            session: prev.session,
            profile: prev.profile,
            loading: false,
            error: prev.session
              ? 'We were unable to finish loading your profile. Please try refreshing the page or sign in again.'
              : 'Unable to reach Supabase to verify your session. Please check your internet connection and try again.',
          };
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

export const __TESTING__ = {
  getErrorMessage,
  isNetworkError,
  isInvalidSessionError,
  isPostgrestUnauthorizedError,
  cacheAuthState,
  getCachedAuthState,
};
