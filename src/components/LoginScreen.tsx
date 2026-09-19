import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Link, Loader2, LogIn, Server, Tv } from "lucide-react";
import { XtreamClient } from "@/lib/xtream";
import { preloadBrowseData } from "@/components/NetflixBrowse";
import type { UserInfo } from "@/types/xtream";

interface LoginScreenProps {
  onLogin: (client: XtreamClient, userInfo: UserInfo) => void;
}

const STORAGE_KEY = "xtream-credentials";
const PRELOAD_ITEMS_PER_TYPE = 40;
// Safety cap only -- normal completion happens as soon as every image has
// actually loaded (or failed) and the warm-up stream has received its first
// bytes. This just guarantees a handful of slow/broken items or an
// unreachable provider can never leave the user stuck on the login screen.
const PRELOAD_SAFETY_TIMEOUT_MS = 20000;

type LoginMode = "credentials" | "url";
type LoginStage = "idle" | "connecting" | "preloading";

interface SavedCredentials {
  server: string;
  username: string;
  password: string;
}

function loadSaved(): SavedCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseFullUrl(raw: string): SavedCredentials | null {
  try {
    const trimmed = raw.trim();
    const url = new URL(trimmed);
    const username = url.searchParams.get("username");
    const password = url.searchParams.get("password");
    if (username && password) {
      const server = `${url.protocol}//${url.host}`;
      return { server, username, password };
    }
    const pathParts = url.pathname.split("/").filter(Boolean);
    // Format: /live/username/password/... or /get/username/password/...
    if (pathParts.length >= 3) {
      const server = `${url.protocol}//${url.host}`;
      return { server, username: pathParts[1], password: pathParts[2] };
    }
  } catch {}

  // Try: http://server:port/username/password
  try {
    const trimmed = raw.trim();
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 2) {
      const server = `${url.protocol}//${url.host}`;
      return { server, username: parts[0], password: parts[1] };
    }
  } catch {}

  return null;
}

// Extracts a usable image URL from an Xtream API item, trying the several
// field names different providers use for poster/icon artwork.
function extractImageUrl(item: any): string | null {
  const candidate =
    item?.stream_icon || item?.cover || item?.cover_big || item?.movie_image || item?.icon;
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate.trim();
  }
  return null;
}

// Downloads every given URL and only resolves once each one has actually
// finished loading (or definitively failed) -- no artificial race against a
// short timeout here. This is what guarantees posters are genuinely decoded
// and sitting in the browser's image cache, in their correct place, by the
// time the main screen appears, instead of popping in visibly afterwards.
function preloadImages(urls: string[]): Promise<void> {
  if (urls.length === 0) return Promise.resolve();
  const loadPromises = urls.map(
    (url) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = url;
      })
  );
  return Promise.all(loadPromises).then(() => undefined);
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [mode, setMode] = useState<LoginMode>("credentials");
  const [server, setServer] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullUrl, setFullUrl] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState<LoginStage>("idle");
  const serverRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  const loading = stage !== "idle";

  useEffect(() => {
    const saved = loadSaved();
    if (saved) {
      setServer(saved.server);
      setUsername(saved.username);
      setPassword(saved.password);
      setRemember(true);
    }
    if (mode === "credentials") serverRef.current?.focus();
    else urlRef.current?.focus();
  }, []);

  const doLogin = useCallback(
    async (creds: SavedCredentials) => {
      setError("");
      setStage("connecting");
      try {
        const client = new XtreamClient(creds.server, creds.username, creds.password);
        const userInfo = await client.login();
        if (remember) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }

        setStage("preloading");
        try {
          // Populate the category list cache for Movies/Series in the
          // background (NetflixBrowse lazy-loads each category's items only
          // once its row is scrolled into view, so this alone is cheap and
          // fast -- it does not fetch the whole catalog).
          const vodPreload = preloadBrowseData(client, "vod").catch(() => {});
          const seriesPreload = preloadBrowseData(client, "series").catch(() => {});

          // Fetch a representative sample of live/movies/series items
          // directly so we have real poster URLs to preload -- this is
          // what actually guarantees artwork is loaded and in place before
          // the user sees the main screen, for whichever tab they land on
          // first.
          const [liveStreams, vodStreams, seriesList] = await Promise.all([
            client.getLiveStreams().catch(() => []),
            client.getVodStreams().catch(() => []),
            client.getSeries().catch(() => []),
          ]);

          const imageUrls = [
            ...liveStreams.slice(0, PRELOAD_ITEMS_PER_TYPE).map(extractImageUrl),
            ...vodStreams.slice(0, PRELOAD_ITEMS_PER_TYPE).map(extractImageUrl),
            ...seriesList.slice(0, PRELOAD_ITEMS_PER_TYPE).map(extractImageUrl),
          ].filter((u): u is string => !!u);

          const imagesReady = preloadImages(imageUrls);

          // While the artwork finishes loading, also open a real connection
          // to the provider's streaming endpoint (not just the JSON API) by
          // silently starting a random episode from a random series in a
          // hidden, muted <video> element. Xtream/CDN backends are often
          // much slower on the very first stream request from a client --
          // establishing that connection now means the first channel/movie/
          // episode the user actually clicks on starts immediately instead
          // of paying that "cold start" cost live.
          const warmup = warmUpPlayback(client, seriesList).catch(() => {});

          await Promise.race([
            Promise.all([imagesReady, vodPreload, seriesPreload, warmup]),
            new Promise<void>((resolve) => setTimeout(resolve, PRELOAD_SAFETY_TIMEOUT_MS)),
          ]);
        } catch {
          // Preloading is a nice-to-have; never block login on it failing.
        }

        onLogin(client, userInfo);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStage("idle");
      }
    },
    [remember, onLogin]
  );

  const handleCredentialsSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedServer = server.trim();
      const trimmedUser = username.trim();
      const trimmedPass = password.trim();
      if (!trimmedServer || !trimmedUser || !trimmedPass) {
        setError("Please fill in all fields.");
        return;
      }
      doLogin({ server: trimmedServer, username: trimmedUser, password: trimmedPass });
    },
    [server, username, password, doLogin]
  );

  const handleUrlSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const parsed = parseFullUrl(fullUrl);
      if (!parsed) {
        setError(
          "Could not parse the URL. Paste a link that contains username and password, e.g.:\nhttp://server.com:8080/get.php?username=X&password=Y"
        );
        return;
      }
      setServer(parsed.server);
      setUsername(parsed.username);
      setPassword(parsed.password);
      doLogin(parsed);
    },
    [fullUrl, doLogin]
  );

  const inputClass =
    "w-full bg-[#0d0f14] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#e91e63] focus:ring-2 focus:ring-[#e91e63]/20 transition-all";

  const buttonLabel =
    stage === "connecting" ? "Connecting..." : stage === "preloading" ? "Loading previews..." : "Connect";

  return (
    <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-[#e91e63]/8 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#e91e63]/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-[#e91e63] to-[#d81b60] mb-5 shadow-2xl shadow-[#e91e63]/30">
            <Tv className="w-10 h-10 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            IPTV<span className="text-[#e91e63]">.</span>
          </h1>
          <p className="text-gray-500 text-sm mt-2">Powered by Xtream Codes</p>
        </div>

        {/* Card */}
        <div className="bg-[#141822]/80 backdrop-blur-xl rounded-2xl border border-white/5 shadow-2xl p-8">
          {/* Mode toggle */}
          <div className="flex rounded-xl bg-[#0d0f14] p-1 mb-6">
            <button
              type="button"
              onClick={() => { setMode("credentials"); setError(""); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === "credentials"
                  ? "bg-[#e91e63] text-white shadow-lg"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              Credentials
            </button>
            <button
              type="button"
              onClick={() => { setMode("url"); setError(""); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === "url"
                  ? "bg-[#e91e63] text-white shadow-lg"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <Link className="w-3.5 h-3.5" />
              Full URL
            </button>
          </div>

          {mode === "credentials" ? (
            <form onSubmit={handleCredentialsSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                  Server
                </label>
                <input
                  ref={serverRef}
                  type="text"
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  placeholder="http://example.com:8080"
                  className={inputClass}
                  autoComplete="url"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className={inputClass}
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className={`${inputClass} pr-12`}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-[#0d0f14] text-[#e91e63] focus:ring-[#e91e63] focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
                  Remember credentials on this computer
                </span>
              </label>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm whitespace-pre-line">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#e91e63] to-[#d81b60] hover:from-[#d81b60] hover:to-[#c2185b] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-4 py-3 text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#e91e63]/30"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {buttonLabel}
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Connect
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleUrlSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                  Paste your full IPTV URL
                </label>
                <input
                  ref={urlRef}
                  type="text"
                  value={fullUrl}
                  onChange={(e) => setFullUrl(e.target.value)}
                  placeholder="http://server.com:8080/get.php?username=X&password=Y"
                  className={inputClass}
                  autoComplete="url"
                  autoFocus
                />
                <p className="text-gray-600 text-xs mt-2 leading-relaxed">
                  Paste the link your IPTV provider gave you. The server address, username, and password will be extracted automatically.
                </p>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-[#0d0f14] text-[#e91e63] focus:ring-[#e91e63] focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
                  Remember credentials on this computer
                </span>
              </label>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm whitespace-pre-line">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#e91e63] to-[#d81b60] hover:from-[#d81b60] hover:to-[#c2185b] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-4 py-3 text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#e91e63]/30"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {buttonLabel}
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Connect
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          Your credentials are sent directly to your IPTV provider.
        </p>
      </div>
    </div>
  );
}

// Silently plays a few seconds of a random episode from a random series in
// an off-screen, muted <video> element right after login. This forces the
// browser to open a real connection to the provider's streaming endpoint
// (TCP/TLS handshake, provider-side session bookkeeping, etc.) ahead of
// time, so the first channel/movie/episode the user actually clicks on
// starts immediately instead of paying that "cold start" cost live.
async function warmUpPlayback(client: XtreamClient, seriesList: any[]): Promise<void> {
  if (!seriesList || seriesList.length === 0) return;

  const randomSeries = seriesList[Math.floor(Math.random() * seriesList.length)];
  const seriesId = randomSeries?.series_id;
  if (!seriesId) return;

  const info = await client.getSeriesInfo(seriesId).catch(() => null);
  if (!info) return;

  const seasonKeys = Object.keys(info.episodes || {});
  if (seasonKeys.length === 0) return;
  const randomSeason = seasonKeys[Math.floor(Math.random() * seasonKeys.length)];
  const episodesInSeason = info.episodes[randomSeason] || [];
  if (episodesInSeason.length === 0) return;
  const randomEpisode = episodesInSeason[Math.floor(Math.random() * episodesInSeason.length)];

  const episodeId = Number(randomEpisode?.id) || Number(randomEpisode?.episode_id) || 0;
  if (!episodeId) return;
  const ext = randomEpisode?.container_extension || "mp4";
  const url = client.getEpisodeUrl(episodeId, ext);

  await new Promise<void>((resolve) => {
    const video = document.createElement("video");
    video.style.position = "fixed";
    video.style.left = "-9999px";
    video.style.width = "1px";
    video.style.height = "1px";
    video.muted = true;
    video.preload = "auto";
    video.src = url;
    document.body.appendChild(video);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {}
      video.remove();
      resolve();
    };

    // As soon as we've started actually receiving data, the connection is
    // warm -- no need to keep buffering/playing further.
    video.addEventListener("loadeddata", finish, { once: true });
    video.addEventListener("error", finish, { once: true });
    video.play().catch(() => {});

    // Safety cap in case the stream never fires an event.
    setTimeout(finish, 8000);
  });
}
