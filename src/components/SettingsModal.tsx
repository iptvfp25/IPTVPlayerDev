import { X, Globe, Palette, User, Cloud, LogOut } from "lucide-react";
import type { UserInfo } from "@/types/xtream";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  type AppSettings,
  type AppLanguage,
  type AccentColor,
  ACCENT_COLORS,
  LANGUAGES,
  t,
} from "@/lib/settings";

interface SettingsModalProps {
  settings: AppSettings;
  userInfo: UserInfo;
  session: Session | null;
  onClose: () => void;
  onChange: (settings: AppSettings) => void;
}

export default function SettingsModal({ settings, userInfo, session, onClose, onChange }: SettingsModalProps) {
  const accent = ACCENT_COLORS[settings.accentColor];
  const lang = settings.language;

  const setLang = (l: AppLanguage) => onChange({ ...settings, language: l });
  const setColor = (color: AccentColor) => onChange({ ...settings, accentColor: color });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#141822] rounded-2xl border border-white/10 max-w-md w-full max-h-[85vh] overflow-y-auto sidebar-scroll shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 pb-4 border-b border-white/5">
          <h2 className="text-white font-bold text-lg">{t(lang, "settings")}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Cloud Sync */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Cloud className="w-4 h-4" style={{ color: accent.primary }} />
              <h3 className="text-white text-sm font-semibold">Cloud Sync</h3>
            </div>
            {session ? (
              <div className="bg-[#0d0f14] rounded-lg border border-white/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-emerald-400 text-xs font-medium">{t(lang, "syncEnabled")}</span>
                </div>
                <p className="text-gray-400 text-xs mb-3">
                  {t(lang, "signedInAs")} <span className="text-white">{session.user.email}</span>
                </p>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                  {t(lang, "signOutAccount")}
                </button>
              </div>
            ) : (
              <div className="bg-[#0d0f14] rounded-lg border border-white/5 p-4">
                <p className="text-gray-500 text-xs">
                  Sign in to sync your favorites, watch progress, and settings across devices.
                </p>
              </div>
            )}
          </div>

          {/* Language */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4" style={{ color: accent.primary }} />
              <h3 className="text-white text-sm font-semibold">{t(lang, "language")}</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(LANGUAGES) as [AppLanguage, string][]).map(([code, name]) => (
                <button
                  key={code}
                  onClick={() => setLang(code)}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                    settings.language === code
                      ? "text-white border-transparent"
                      : "text-gray-400 border-white/5 hover:border-white/10 hover:text-white bg-[#0d0f14]"
                  }`}
                  style={settings.language === code ? { backgroundColor: accent.primary } : undefined}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Accent Color */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Palette className="w-4 h-4" style={{ color: accent.primary }} />
              <h3 className="text-white text-sm font-semibold">{t(lang, "accentColor")}</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(ACCENT_COLORS) as [AccentColor, typeof accent][]).map(([key, colors]) => (
                <button
                  key={key}
                  onClick={() => setColor(key)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all border ${
                    settings.accentColor === key
                      ? "border-white/20 bg-white/5 text-white font-medium"
                      : "border-white/5 text-gray-500 hover:text-white hover:border-white/10 bg-[#0d0f14]"
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-offset-1 ring-offset-[#141822]"
                    style={{
                      backgroundColor: colors.primary,
                      ringColor: settings.accentColor === key ? colors.primary : "transparent",
                    }}
                  />
                  {colors.label}
                </button>
              ))}
            </div>
          </div>

          {/* Account */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4" style={{ color: accent.primary }} />
              <h3 className="text-white text-sm font-semibold">{t(lang, "account")}</h3>
            </div>
            <div className="bg-[#0d0f14] rounded-lg border border-white/5 divide-y divide-white/5">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-gray-500 text-xs">{t(lang, "username")}</span>
                <span className="text-white text-sm font-medium">{userInfo.username}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-gray-500 text-xs">{t(lang, "status")}</span>
                <span className="text-emerald-400 text-sm font-medium">{t(lang, "active")}</span>
              </div>
              {userInfo.exp_date && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-gray-500 text-xs">{t(lang, "expires")}</span>
                  <span className="text-white text-sm">
                    {new Date(Number(userInfo.exp_date) * 1000).toLocaleDateString()}
                  </span>
                </div>
              )}
              {userInfo.max_connections && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-gray-500 text-xs">{t(lang, "maxConnections")}</span>
                  <span className="text-white text-sm">{userInfo.max_connections}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
