import type {
  Category,
  Episode,
  EpisodeItem,
  EpgProgram,
  LiveStream,
  Series,
  SeriesInfo,
  UserInfo,
  VodStream,
} from "@/types/xtream";

export const isElectron = !!(window as any).electronApp?.isElectron;

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xtream-proxy`;
const PROXY_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

function directServer(server: string): string {
  let s = server.trim();
  if (!s.startsWith("http://") && !s.startsWith("https://")) {
    s = "http://" + s;
  }
  return s.replace(/\/+$/, "");
}

// In the browser, API/JSON calls (player_api.php) must go through the proxy
// so an https page can safely reach an http-only Xtream server without
// hitting mixed-content blocking on fetch/XHR requests. Electron disables
// web security instead, so it can hit the origin server directly.
function mediaUrl(directUrl: string): string {
  if (isElectron) return directUrl;
  return `${PROXY_URL}?target=${encodeURIComponent(directUrl)}`;
}

function decodeEpgText(text: string): string {
  if (!text) return "";
  try {
    const decoded = atob(text);
    if (/^[\x20-\x7E\xA0-\xFF\u0100-\uFFFF\s]+$/.test(decoded) && decoded.length > 0) {
      return decoded;
    }
  } catch {}
  try {
    if (text.includes("%")) {
      return decodeURIComponent(text);
    }
  } catch {}
  if (text.includes("&")) {
    const el = typeof document !== "undefined" ? document.createElement("textarea") : null;
    if (el) {
      el.innerHTML = text;
      return el.value;
    }
  }
  return text;
}

function parseEpgDate(dateStr: string): number {
  if (!dateStr) return 0;
  const normalized = dateStr.replace("T", " ").replace(/\.\d+$/, "").replace(/\//g, "-");
  const d = new Date(normalized);
  if (!isNaN(d.getTime())) {
    return Math.floor(d.getTime() / 1000);
  }
  return 0;
}

async function apiFetch(server: string, apiPath: string, params: Record<string, string>): Promise<any> {
  const search = new URLSearchParams(params).toString();
  const target = `${directServer(server)}/${apiPath}?${search}`;

  let lastErr: string | null = null;
  for (let i = 0; i < 3; i++) {
    try {
      let resp: Response;

      if (isElectron) {
        resp = await fetch(target, { signal: AbortSignal.timeout(20000) });
      } else {
        resp = await fetch(PROXY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${PROXY_KEY}`,
          },
          body: JSON.stringify({ url: target }),
          signal: AbortSignal.timeout(30000),
        });
      }

      const text = await resp.text();
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
      return JSON.parse(text);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (i < 2) await new Promise((r) => setTimeout(r, 1200));
    }
  }
  throw new Error(lastErr || "Request failed after retries");
}

// How often to re-warm the connection while the app sits idle (e.g. the
// user is just browsing the catalog without playing anything). Chosen well
// under typical NAT/firewall/keep-alive timeouts (usually 60-300s) so the
// connection to the provider never has a chance to go fully cold again.
const KEEPALIVE_INTERVAL_MS = 90_000;

export class XtreamClient {
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    public server: string,
    public username: string,
    public password: string,
  ) {}

  // Many Xtream panels are noticeably slower on the very first request from
  // a given client -- the TCP/TLS handshake has to complete, and some
  // panels do extra per-IP/session bookkeeping the first time they see a
  // connection, both of which get skipped on every request after. That's
  // exactly the "first movie took a minute, the next one took 2 seconds"
  // pattern: nothing was actually wrong with playback, the connection to
  // the provider itself just hadn't been established/warmed up yet. We fix
  // it by firing a harmless HEAD request against the provider as soon as
  // we're logged in (instead of waiting for the user's first play click to
  // pay that cost), and then periodically re-warming it so a long idle
  // browsing session doesn't let the connection go cold again before the
  // user actually presses play.
  private warmConnection() {
    if (!isElectron) return; // the proxy path doesn't benefit from this
    const target = directServer(this.server);
    fetch(target, { method: "HEAD", signal: AbortSignal.timeout(15000) }).catch(() => {});
  }

  private startKeepAlive() {
    this.warmConnection();
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = setInterval(() => this.warmConnection(), KEEPALIVE_INTERVAL_MS);
  }

  destroy() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  async login(): Promise<UserInfo> {
    const data = await apiFetch(this.server, "player_api.php", {
      username: this.username,
      password: this.password,
    });
    if (!data || !data.user_info) {
      throw new Error("Invalid response from server");
    }
    if (data.user_info.auth !== 1) {
      throw new Error(`Authentication failed: ${data.user_info.status || "Unknown status"}`);
    }
    this.startKeepAlive();
    return data.user_info as UserInfo;
  }

  async getLiveCategories(): Promise<Category[]> {
    const data = await apiFetch(this.server, "player_api.php", {
      username: this.username,
      password: this.password,
      action: "get_live_categories",
    });
    return Array.isArray(data) ? data : [];
  }

  async getLiveStreams(categoryId?: string): Promise<LiveStream[]> {
    const params: Record<string, string> = {
      username: this.username,
      password: this.password,
      action: "get_live_streams",
    };
    if (categoryId) params.category_id = categoryId;
    const data = await apiFetch(this.server, "player_api.php", params);
    return Array.isArray(data) ? data : [];
  }

  async getVodCategories(): Promise<Category[]> {
    const data = await apiFetch(this.server, "player_api.php", {
      username: this.username,
      password: this.password,
      action: "get_vod_categories",
    });
    return Array.isArray(data) ? data : [];
  }

  async getVodStreams(categoryId?: string): Promise<VodStream[]> {
    const params: Record<string, string> = {
      username: this.username,
      password: this.password,
      action: "get_vod_streams",
    };
    if (categoryId) params.category_id = categoryId;
    const data = await apiFetch(this.server, "player_api.php", params);
    return Array.isArray(data) ? data : [];
  }

  async getSeriesCategories(): Promise<Category[]> {
    const data = await apiFetch(this.server, "player_api.php", {
      username: this.username,
      password: this.password,
      action: "get_series_categories",
    });
    return Array.isArray(data) ? data : [];
  }

  async getSeries(categoryId?: string): Promise<Series[]> {
    const params: Record<string, string> = {
      username: this.username,
      password: this.password,
      action: "get_series",
    };
    if (categoryId) params.category_id = categoryId;
    const data = await apiFetch(this.server, "player_api.php", params);
    return Array.isArray(data) ? data : [];
  }

  async getSeriesInfo(seriesId: number): Promise<SeriesInfo> {
    const data = await apiFetch(this.server, "player_api.php", {
      username: this.username,
      password: this.password,
      action: "get_series_info",
      series_id: String(seriesId),
    });
    return data;
  }

  async getShortEpg(streamId: number, limit: number = 5): Promise<EpgProgram[]> {
    const data = await apiFetch(this.server, "player_api.php", {
      username: this.username,
      password: this.password,
      action: "get_short_epg",
      stream_id: String(streamId),
      limit: String(limit),
    });
    if (!data || !data.epg_listings) return [];
    return data.epg_listings.map((ep: any) => {
      let startTs = Number(ep.start_timestamp || 0);
      let stopTs = Number(ep.stop_timestamp || 0);
      if (!startTs && ep.start) startTs = parseEpgDate(ep.start);
      if (!stopTs && ep.end) stopTs = parseEpgDate(ep.end);
      return {
        id: String(ep.id || ""),
        title: decodeEpgText(String(ep.title || ep.name || "")) || "Unknown",
        description: decodeEpgText(String(ep.description || "")),
        start: String(ep.start || ""),
        end: String(ep.end || ""),
        start_timestamp: startTs,
        stop_timestamp: stopTs,
        category: String(ep.category || ""),
      };
    }) as EpgProgram[];
  }

  getLiveUrl(streamId: number): string {
    // Live streams are loaded directly by the <video> element (via mpegts.js),
    // bypassing the JSON proxy entirely. Browsers treat <video>/<audio> media
    // loads as "optionally blockable" mixed content, so an http:// stream URL
    // works fine even from an https:// page -- unlike fetch/XHR calls, which
    // ARE blocked and which is why the proxy is still used for player_api.php.
    // Routing the continuous live stream through the proxy caused 502 /
    // "Unexpected end of JSON input" errors because that proxy path expects
    // short-lived JSON responses, not a long-lived video stream.
    return `${directServer(this.server)}/live/${this.username}/${this.password}/${streamId}.ts`;
  }

  getVodUrl(streamId: number, containerExtension: string): string {
    const ext = containerExtension || "mp4";
    const direct = `${directServer(this.server)}/movie/${this.username}/${this.password}/${streamId}.${ext}`;
    return mediaUrl(direct);
  }

  getEpisodeUrl(episodeId: number, containerExtension: string): string {
    const ext = containerExtension || "mp4";
    const direct = `${directServer(this.server)}/series/${this.username}/${this.password}/${episodeId}.${ext}`;
    return mediaUrl(direct);
  }

  static flattenEpisodes(seriesInfo: SeriesInfo): EpisodeItem[] {
    const episodes: EpisodeItem[] = [];
    const keys = Object.keys(seriesInfo.episodes || {}).sort((a, b) => Number(a) - Number(b));
    for (const seasonKey of keys) {
      const seasonNum = Number(seasonKey);
      for (const ep of seriesInfo.episodes[seasonKey] || []) {
        episodes.push({
          episode_id: Number(ep.episode_id) || Number(ep.stream_id) || Number(ep.id) || 0,
          title: `S${seasonNum} - ${ep.title || `Episode ${ep.episode_num}`}`,
          season: seasonNum,
          container_extension: ep.container_extension || "mp4",
        });
      }
    }
    return episodes;
  }
}
