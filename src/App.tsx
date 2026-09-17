import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { setSyncUserId, syncOnLogin } from "@/lib/sync";
import LoginScreen from "@/components/LoginScreen";
import AuthScreen from "@/components/AuthScreen";
import MainScreen from "@/components/MainScreen";
import { XtreamClient } from "@/lib/xtream";
import type { UserInfo } from "@/types/xtream";
import type { Session } from "@supabase/supabase-js";

type AppPhase = "auth" | "iptv-login" | "main";

export default function App() {
  const [phase, setPhase] = useState<AppPhase>("auth");
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [client, setClient] = useState<XtreamClient | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      setSession(s);
      if (s?.user) {
        setSyncUserId(s.user.id);
        setPhase("iptv-login");
        // Sync in background
        (async () => { await syncOnLogin(); })();
      }
      setAuthChecked(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setSyncUserId(s.user.id);
      } else {
        setSyncUserId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (phase === "auth" && !session) {
    return (
      <AuthScreen
        onSkip={() => setPhase("iptv-login")}
        onAuth={async () => {
          const { data } = await supabase.auth.getSession();
          if (data.session?.user) {
            setSyncUserId(data.session.user.id);
            await syncOnLogin();
          }
          setPhase("iptv-login");
        }}
      />
    );
  }

  if (phase !== "main" || !client || !userInfo) {
    return (
      <LoginScreen
        onLogin={(c: XtreamClient, info: UserInfo) => {
          setClient(c);
          setUserInfo(info);
          setPhase("main");
        }}
      />
    );
  }

  return (
    <MainScreen
      client={client}
      userInfo={userInfo}
      session={session}
      onLogout={() => {
        setClient(null);
        setUserInfo(null);
        setPhase("iptv-login");
      }}
    />
  );
}
