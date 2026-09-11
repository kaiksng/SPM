import type { Session, User } from "@supabase/supabase-js";
import type { UserRole } from "@spm/shared";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/supabase-client";

type Profile = { full_name: string; role: UserRole };

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    loading: true,
  });

  useEffect(() => {
    let active = true;

    async function loadProfile(user: User | null): Promise<Profile | null> {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const profile = await loadProfile(session?.user ?? null);
      if (active) {
        setState({ session, user: session?.user ?? null, profile, loading: false });
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const profile = await loadProfile(session?.user ?? null);
        if (active) {
          setState({ session, user: session?.user ?? null, profile, loading: false });
        }
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
