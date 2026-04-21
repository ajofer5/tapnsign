import { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { registerPushToken } from './notifications';
import { supabase } from './supabase';

type Profile = {
  id: string;
  role: 'member' | 'verified' | 'admin';
  display_name: string;
  profile_avatar_autograph_id?: string | null;
  avatar_url?: string | null;
  avatar_storage_path?: string | null;
  profile_avatar?: {
    id: string;
    thumbnail_url: string | null;
    video_url: string | null;
    strokes_json: { id: string; points: { x: number; y: number; t: number }[] }[];
    capture_width: number;
    capture_height: number;
    stroke_color: string | null;
  } | null;
  verified: boolean;
  verification_status: 'none' | 'pending' | 'verified' | 'failed' | 'expired';
  birthday_month: number | null;
  birthday_day: number | null;
  instagram_handle?: string | null;
  instagram_status?: 'none' | 'connected' | 'verified';
  instagram_verified_at?: string | null;
  instagram_verification_method?: string | null;
  instagram_verification_code?: string | null;
  instagram_verification_requested_at?: string | null;
  instagram_verification_expires_at?: string | null;
  instagram_verification_checked_at?: string | null;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*, profile_avatar:profile_avatar_autograph_id ( id, thumbnail_url, video_url, strokes_json, capture_width, capture_height, stroke_color )')
      .eq('id', userId)
      .single();
    const hydrated = data
      ? {
          ...data,
          avatar_url: (data as any)?.profile_avatar?.thumbnail_url ?? data.avatar_url ?? null,
        }
      : null;
    setProfile(hydrated ?? null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
        registerPushToken(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
        registerPushToken(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        registerPushToken(session.user.id);
      }
    });

    return () => sub.remove();
  }, [session?.user?.id]);

  const refreshProfile = async () => {
    const userId = session?.user?.id;
    if (userId) await fetchProfile(userId);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
