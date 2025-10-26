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
    return data as PlayerProfile;
  }

  const seed = getDisplayNameSeed(user);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateDisplayName(seed);
    const { data: insertData, error: insertError } = await client
      .from('players')
      .insert({ auth_user_id: user.id, display_name: candidate })
      .select('*')
      .single();

    if (!insertError && insertData) {
      return insertData as PlayerProfile;
    }

    if ((insertError as PostgrestError | null)?.code !== '23505') {
      console.error('Failed to create player profile', insertError);
      throw insertError;
    }
  }

  throw new Error('Unable to generate a unique display name. Please try again.');
}

export function useSupabaseAuth() {
  const [state, setState] = useState<AuthState>(DEFAULT_STATE);
  const isConfigured = Boolean(supabase);

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

    setState((prev) => ({
      ...prev,
      session,
      loading: prev.profile?.auth_user_id !== session.user.id,
      error: null,
    }));

    try {
      const profile = await ensureProfile(client, session.user);
      setState({ session, profile, loading: false, error: null });
    } catch (profileError) {
      console.error('Failed to load player profile', profileError);
      setState({ session, profile: null, loading: false, error: 'Failed to load player profile. Please try again.' });
    }
  }, []);

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
          setState({ session: null, profile: null, loading: false, error: 'Unable to load authentication session. Please refresh and try again.' });
          return;
        }

        await loadSessionProfile(session);
      } catch (err) {
        console.error('Failed to initialize authentication', err);
        setState({ session: null, profile: null, loading: false, error: 'Failed to initialize authentication.' });
      }
    };

    init();

    const { data: listener } = client.auth.onAuthStateChange(async (_event: AuthChangeEvent, session: Session | null) => {
      await loadSessionProfile(session);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []); // Remove loadSessionProfile from dependencies to prevent re-initialization

  const refreshProfile = useCallback(async () => {
    const client = supabase;
    if (!client) {
      throw new Error('Supabase is not configured.');
    }
    const {
      data: { session },
      error,
    } = await client.auth.getSession();
    if (error) {
      console.error('Failed to refresh Supabase session', error);
      throw error;
    }
    await loadSessionProfile(session);
  }, [loadSessionProfile]);

  const signInWithGoogle = useCallback(async () => {
    const client = supabase;
    if (!client) {
      throw new Error('Supabase is not configured.');
    }
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
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
