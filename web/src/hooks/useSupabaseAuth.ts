import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { PlayerProfile } from '@/types/match';

interface AuthState {
  profile: PlayerProfile | null;
  loading: boolean;
  error: string | null;
}

const DEFAULT_STATE: AuthState = {
  profile: null,
  loading: true,
  error: null,
};

async function fetchOrCreateProfile(userId: string, email: string | null): Promise<PlayerProfile | null> {
  const client = supabase;
  if (!client) return null;

  const { data, error } = await client
    .from('players')
    .select('*')
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load player profile', error);
    throw error;
  }

  if (data) {
    return data as PlayerProfile;
  }

  const displayName = email?.split('@')[0] ?? 'Player';
  const { data: insertData, error: insertError } = await client
    .from('players')
    .insert({ auth_user_id: userId, display_name: displayName })
    .select('*')
    .single();

  if (insertError) {
    console.error('Failed to create player profile', insertError);
    throw insertError;
  }

  return insertData as PlayerProfile;
}

export function useSupabaseAuth() {
  const [state, setState] = useState<AuthState>(DEFAULT_STATE);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setState({ profile: null, loading: false, error: 'Supabase is not configured.' });
      return;
    }

    const init = async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const {
        data: { session },
        error,
      } = await client.auth.getSession();

      if (error) {
        console.error('Failed to load Supabase session', error);
        setState({ profile: null, loading: false, error: 'Unable to load authentication session.' });
        return;
      }

      if (!session) {
        setState({ profile: null, loading: false, error: null });
        return;
      }

      try {
        const profile = await fetchOrCreateProfile(session.user.id, session.user.email ?? null);
        setState({ profile, loading: false, error: null });
      } catch (profileError) {
        setState({ profile: null, loading: false, error: 'Failed to load player profile.' });
      }
    };

    init();

    const { data: listener } = client.auth.onAuthStateChange(async (_event: AuthChangeEvent, session: Session | null) => {
      if (!session) {
        setState({ profile: null, loading: false, error: null });
        return;
      }
      try {
        const profile = await fetchOrCreateProfile(session.user.id, session.user.email ?? null);
        setState({ profile, loading: false, error: null });
      } catch (profileError) {
        setState({ profile: null, loading: false, error: 'Failed to load player profile.' });
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const requestMagicLink = useCallback(async (email: string) => {
    const client = supabase;
    if (!client) {
      throw new Error('Supabase is not configured.');
    }
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) {
      console.error('Failed to request magic link', error);
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

  return {
    profile: state.profile,
    loading: state.loading,
    error: state.error,
    requestMagicLink,
    signOut,
  };
}
