import { useState } from "react";
import { Loader2, Mail, Lock, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { t, type AppLanguage } from "@/lib/settings";

interface AuthScreenProps {
  lang?: AppLanguage;
  accentColor?: string;
  onSkip: () => void;
  onAuth: () => void;
}

export default function AuthScreen({
  lang = "en",
  accentColor = "#e91e63",
  onSkip,
  onAuth,
}: AuthScreenProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const trimEmail = email.trim();
    const trimPass = password.trim();

    if (!trimEmail || !trimPass) {
      setError("Please fill in all fields.");
      setLoading(false);
      return;
    }

    if (trimPass.length < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email: trimEmail,
          password: trimPass,
        });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: trimEmail,
          password: trimPass,
        });
        if (err) throw err;
      }
      onAuth();
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("User already registered")) {
        setError("This email is already registered. Please sign in.");
      } else if (msg.includes("Invalid login credentials")) {
        setError("Invalid email or password.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center px-4 relative overflow-hidden">
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full blur-[140px] pointer-events-none"
        style={{ backgroundColor: `${accentColor}14` }}
      />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">
            {mode === "signin" ? t(lang, "signIn") : t(lang, "signUp")}
          </h1>
          <p className="text-gray-500 text-sm mt-2">
            Sync your favorites and progress across devices
          </p>
        </div>

        <div className="bg-[#141822]/80 backdrop-blur-xl rounded-2xl border border-white/5 shadow-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                {t(lang, "email")}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-[#0d0f14] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none transition-all"
                  onFocus={(e) => { e.target.style.borderColor = accentColor; }}
                  onBlur={(e) => { e.target.style.borderColor = ""; }}
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                {t(lang, "password")}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full bg-[#0d0f14] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none transition-all"
                  onFocus={(e) => { e.target.style.borderColor = accentColor; }}
                  onBlur={(e) => { e.target.style.borderColor = ""; }}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white font-semibold rounded-xl px-4 py-3 text-sm transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`, boxShadow: `0 4px 14px ${accentColor}33` }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {mode === "signin" ? t(lang, "signingIn") : t(lang, "signingUp")}
                </>
              ) : (
                <>
                  <User className="w-4 h-4" />
                  {mode === "signin" ? t(lang, "signIn") : t(lang, "signUp")}
                </>
              )}
            </button>
          </form>


        </div>

        <div className="text-center mt-4 space-y-3">
          <button
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
            className="text-sm text-gray-500 hover:text-white transition-colors"
          >
            {mode === "signin" ? t(lang, "dontHaveAccount") : t(lang, "alreadyHaveAccount")}
          </button>

          <div>
            <button
              onClick={onSkip}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors underline underline-offset-2"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
