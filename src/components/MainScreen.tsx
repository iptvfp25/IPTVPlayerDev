import { useEffect, useState } from "react";
import {
  Clapperboard,
  Download,
  Film,
  LogOut,
  Tv,
  Radio,
  Search,
  Heart,
  Settings,
  X,
} from "lucide-react";
import { XtreamClient } from "@/lib/xtream";
import { useFavorites, type FavoriteEntry } from "@/lib/favorites";
import { loadSettings, saveSettings, ACCENT_COLORS, t, type AppSettings } from "@/lib/settings";
import { debouncedPushSettings } from "@/lib/sync";
import type { Session } from "@supabase/supabase-js";
import type { Category, ContentType, EpisodeItem, UserInfo } from "@/types/xtream";
import VideoPlayer from "@/components/VideoPlayer";
import Sidebar, { type SidebarLevel, type SidebarItem } from "@/components/Sidebar";
import TVGuide from "@/components/TVGuide";
import SeriesDetailModal from "@/components/SeriesDetailModal";
import NetflixBrowse, { type BrowseItem } from "@/components/NetflixBrowse";
import SearchTab from "@/components/SearchTab";
import FavoritesTab from "@/components/FavoritesTab";
import DownloadsTab from "@/components/DownloadsTab";
import SettingsModal from "@/components/SettingsModal";

type AppTab = "live" | "vod" | "series" | "search" | "favorites" | "downloads";

interface MainScreenProps {
  client: XtreamClient;
  userInfo: UserInfo;
  session: Session | null;
  onLogout: () => void;
}

interface PlaybackInfo {
  url: string;
  title: string;
  isLive: boolean;
  streamId?: number;
}

export default function MainScreen({ client, userInfo, session, onLogout }: MainScreenProps) {
  const [activeTab, setActiveTab] = useState<AppTab>("live");
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);

  const lang = appSettings.language;
  const accent = ACCENT_COLORS[appSettings.accentColor];

  const handleSettingsChange = (s: AppSettings) => {
    setAppSettings(s);
    saveSettings(s);
    debouncedPushSettings(s);
  };

  // Live tab state
  const [level, setLevel] = useState<SidebarLevel>("categories");
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<SidebarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  // Current playback
  const [playback, setPlayback] = useState<PlaybackInfo | null>(null);

  // Overlay player for VOD/episodes (shown on top of browse views)
  const [overlayPlayback, setOverlayPlayback] = useState<PlaybackInfo | null>(null);

  // Series detail modal
  const [seriesDetail, setSeriesDetail] = useState<{
    seriesId: number;
    name: string;
    poster?: string;
    rating?: string;
    plot?: string;
    genre?: string;
  } | null>(null);

  const [allLiveStreams, setAllLiveStreams] = useState<SidebarItem[]>([]);
  const { favKeys, toggle: toggleFav, entries: favEntries } = useFavorites();

  useEffect(() => {
    if (activeTab !== "live") return;
    setLoading(true);
    setError("");
    setCategories([]);
    (async () => {
      try {
        const cats = await client.getLiveCategories();
        setCategories(cats);
        if (allLiveStreams.length === 0) {
          client.getLiveStreams().then((streams) => {
            setAllLiveStreams(
              streams.map((s) => ({
                id: String(s.stream_id),
                name: s.name,
                categoryId: s.category_id,
              }))
            );
          }).catch(() => {});
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [client, activeTab]);

  const handleTabSwitch = (tab: AppTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setOverlayPlayback(null);
    if (tab === "live") {
      setLevel("categories");
      setItems([]);
      setSelectedCategory(null);
      setSelectedItem(null);
    }
  };

  const handleCategoryClick = async (categoryId: string) => {
    setSelectedCategory(categoryId);
    setLevel("items");
    setLoading(true);
    setError("");
    setItems([]);
    try {
      const streams = await client.getLiveStreams(categoryId);
      setItems(
        streams.map((s) => ({
          id: String(s.stream_id),
          name: s.name,
          categoryId: s.category_id,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleLiveItemClick = (item: SidebarItem) => {
    setSelectedItem(item.id);
    const streamId = Number(item.id);
    const url = client.getLiveUrl(streamId);
    setPlayback({ url, title: item.name, isLive: true, streamId });
  };

  const playLive = (streamId: number, name: string) => {
    const url = client.getLiveUrl(streamId);
    setPlayback({ url, title: name, isLive: true, streamId });
    setOverlayPlayback(null);
    setActiveTab("live");
  };

  const playVod = (streamId: number, ext: string, name: string) => {
    const url = client.getVodUrl(streamId, ext);
    setOverlayPlayback({ url, title: name, isLive: false });
  };

  const handleVodItemClick = (item: BrowseItem) => {
    playVod(Number(item.id), item.containerExtension || "mp4", item.name);
  };

  const handleSeriesItemClick = (item: BrowseItem) => {
    setSeriesDetail({
      seriesId: item.seriesId!,
      name: item.name,
      poster: item.poster,
      rating: item.rating,
      plot: item.plot,
      genre: item.genre,
    });
  };

  const handleEpisodeClick = (episode: EpisodeItem, seriesName: string) => {
    if (!episode.episode_id) {
      alert("Could not determine episode ID. Please try another episode.");
      return;
    }
    const url = client.getEpisodeUrl(episode.episode_id, episode.container_extension);
    setOverlayPlayback({ url, title: `${seriesName} - ${episode.title}`, isLive: false });
  };

  const handleBackToCategories = () => {
    setLevel("categories");
    setSelectedCategory(null);
    setItems([]);
    setError("");
  };

  const handleBrowseFavToggle = (item: BrowseItem, type?: ContentType) => {
    const ct = type || (activeTab === "vod" ? "vod" : activeTab === "series" ? "series" : "live");
    toggleFav(item, ct as ContentType);
  };

  const handleLiveFavToggle = (item: SidebarItem) => {
    toggleFav(
      {
        id: item.id,
        name: item.name,
        categoryId: item.categoryId,
      },
      "live"
    );
  };

  const handleFavPlay = (entry: FavoriteEntry) => {
    if (entry.type === "live") {
      playLive(Number(entry.id), entry.name);
    } else if (entry.type === "vod") {
      playVod(Number(entry.id), entry.containerExtension || "mp4", entry.name);
    } else {
      setSeriesDetail({
        seriesId: entry.seriesId!,
        name: entry.name,
        poster: entry.poster,
        rating: entry.rating,
        plot: entry.plot,
        genre: entry.genre,
      });
    }
  };

  const handleFavRemove = (entry: FavoriteEntry) => {
    toggleFav(
      {
        id: entry.id, name: entry.name, categoryId: "",
        poster: entry.poster, rating: entry.rating, plot: entry.plot,
        genre: entry.genre, containerExtension: entry.containerExtension,
        seriesId: entry.seriesId,
      },
      entry.type
    );
  };

  const tabConfig: { key: AppTab; label: string; icon: typeof Radio }[] = [
    { key: "live", label: t(lang, "live"), icon: Radio },
    { key: "vod", label: t(lang, "movies"), icon: Film },
    { key: "series", label: t(lang, "series"), icon: Clapperboard },
    { key: "search", label: t(lang, "search"), icon: Search },
    { key: "favorites", label: t(lang, "favorites"), icon: Heart },
    { key: "downloads", label: t(lang, "downloads"), icon: Download },
  ];

  return (
    <div className="h-screen bg-[#0d0f14] flex flex-col overflow-hidden">
      <header className="flex-shrink-0 h-14 bg-[#141822] border-b border-white/5 flex items-center justify-between px-6 z-30">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg"
            style={{ background: `linear-gradient(135deg, ${accent.primary}, ${accent.dark})`, boxShadow: `0 4px 14px ${accent.shadow}33` }}
          >
            <Tv className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-white font-bold text-sm tracking-tight">
            IPTV<span style={{ color: accent.primary }}>.</span>
          </span>
        </div>

        <nav className="flex items-center gap-1">
          {tabConfig.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => handleTabSwitch(key)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === key
                  ? "text-white shadow-lg"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              }`}
              style={activeTab === key ? { backgroundColor: accent.primary, boxShadow: `0 4px 14px ${accent.shadow}33` } : undefined}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 text-gray-500 hover:text-white text-xs transition-colors px-2 py-1.5 rounded-lg hover:bg-white/5"
            title={t(lang, "settings")}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-gray-500 hover:text-white text-xs transition-colors px-2 py-1.5 rounded-lg hover:bg-white/5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t(lang, "logout")}</span>
          </button>
          {session && (
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-1" title={t(lang, "syncEnabled")} />
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {activeTab === "live" && (
          <>
            <div className="flex-1 flex flex-col p-6 overflow-y-auto sidebar-scroll min-w-0">
              <div className="mb-4">
                <h2 className="text-white font-bold text-xl mb-1 truncate">
                  {playback?.title || t(lang, "selectChannel")}
                </h2>
                {playback?.isLive && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    {t(lang, "liveChannel")}
                  </div>
                )}
              </div>

              <div className="w-full">
                {playback ? (
                  <VideoPlayer
                    url={playback.url}
                    title={playback.title}
                    isLive={playback.isLive}
                    accentColor={accent.primary}
                  />
                ) : (
                  <div className="aspect-video bg-gradient-to-br from-[#141822] to-[#0d0f14] rounded-xl border border-white/5 flex items-center justify-center">
                    <div className="text-center">
                      <Tv className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                      <p className="text-gray-600 text-sm">{t(lang, "noChannel")}</p>
                    </div>
                  </div>
                )}
              </div>

              {playback?.isLive && playback.streamId != null && (
                <div className="mt-6">
                  <TVGuide client={client} streamId={playback.streamId} channelName={playback.title} />
                </div>
              )}
            </div>

            <Sidebar
              activeTab="live"
              level={level}
              categories={categories}
              items={items}
              episodes={[]}
              loading={loading}
              error={error}
              selectedCategory={selectedCategory}
              selectedItem={selectedItem}
              onCategoryClick={handleCategoryClick}
              onItemClick={handleLiveItemClick}
              onEpisodeClick={() => {}}
              onBackToCategories={handleBackToCategories}
              onBackToItems={() => {}}
              currentSeriesName=""
              accentColor={accent.primary}
              allStreams={allLiveStreams}
              favorites={favKeys}
              onToggleFavorite={handleLiveFavToggle}
            />
          </>
        )}

        {activeTab === "vod" && (
          <div className="flex-1 overflow-y-auto sidebar-scroll">
            <NetflixBrowse
              client={client}
              contentType="vod"
              onItemClick={handleVodItemClick}
              favorites={favKeys}
              onToggleFavorite={(item) => handleBrowseFavToggle(item, "vod")}
              accentColor={accent.primary}
            />
          </div>
        )}

        {activeTab === "series" && (
          <div className="flex-1 overflow-y-auto sidebar-scroll">
            <NetflixBrowse
              client={client}
              contentType="series"
              onItemClick={handleSeriesItemClick}
              favorites={favKeys}
              onToggleFavorite={(item) => handleBrowseFavToggle(item, "series")}
              accentColor={accent.primary}
            />
          </div>
        )}

        {activeTab === "search" && (
          <SearchTab
            client={client}
            onPlayLive={playLive}
            onPlayVod={playVod}
            onOpenSeries={handleSeriesItemClick}
            favorites={favKeys}
            onToggleFavorite={(item, type) => handleBrowseFavToggle(item, type)}
            accentColor={accent.primary}
            lang={lang}
          />
        )}

        {activeTab === "favorites" && (
          <FavoritesTab
            entries={favEntries}
            onPlay={handleFavPlay}
            onRemove={handleFavRemove}
            accentColor={accent.primary}
            lang={lang}
          />
        )}

        {activeTab === "downloads" && (
          <DownloadsTab
            accentColor={accent.primary}
            lang={lang}
          />
        )}
      </div>

      {/* Overlay player for VOD / Episodes */}
      {overlayPlayback && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-5xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-lg truncate pr-4">
                {overlayPlayback.title}
              </h3>
              <button
                onClick={() => setOverlayPlayback(null)}
                className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <VideoPlayer
              url={overlayPlayback.url}
              title={overlayPlayback.title}
              isLive={false}
              accentColor={accent.primary}
            />
          </div>
        </div>
      )}

      {seriesDetail && (
        <SeriesDetailModal
          client={client}
          seriesId={seriesDetail.seriesId}
          seriesName={seriesDetail.name}
          poster={seriesDetail.poster}
          rating={seriesDetail.rating}
          plot={seriesDetail.plot}
          genre={seriesDetail.genre}
          onClose={() => setSeriesDetail(null)}
          onPlayEpisode={handleEpisodeClick}
          accentColor={accent.primary}
          lang={lang}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={appSettings}
          userInfo={userInfo}
          session={session}
          onClose={() => setShowSettings(false)}
          onChange={handleSettingsChange}
        />
      )}
    </div>
  );
}
