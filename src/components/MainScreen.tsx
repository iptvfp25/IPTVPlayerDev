import { useEffect, useRef, useState } from "react";
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
  Minus,
  Square,
} from "lucide-react";
import { X } from "lucide-react";
import { XtreamClient, isElectron } from "@/lib/xtream";
import { useFavorites, type FavoriteEntry } from "@/lib/favorites";
import { loadSettings, saveSettings, ACCENT_COLORS, t, type AppSettings } from "@/lib/settings";
import { debouncedPushSettings } from "@/lib/sync";
import { recordWatched, getRecentlyWatched, subscribeRecentlyWatched } from "@/lib/recentlyWatched";
import type { Session } from "@supabase/supabase-js";
import type { Category, ContentType, EpisodeItem, UserInfo } from "@/types/xtream";
import VideoPlayer from "@/components/VideoPlayer";
import Sidebar, { type SidebarLevel, type SidebarItem } from "@/components/Sidebar";
import TVGuide from "@/components/TVGuide";
import SeriesDetailModal from "@/components/SeriesDetailModal";
import NetflixBrowse, { type BrowseItem, pauseBackgroundLoading, resumeBackgroundLoading } from "@/components/NetflixBrowse";
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

const liveCache: { categories: Category[] | null; allStreams: SidebarItem[] | null } = {
  categories: null,
  allStreams: null,
};

// Order of tabs in the nav, used to place each pane's resting position
// (left or right of the active tab) so the crossfade always slides in the
// direction that matches where the destination tab sits in the menu.
const TAB_ORDER: AppTab[] = ["live", "vod", "series", "search", "favorites", "downloads"];

function mapRecentLiveToSidebarItems(): SidebarItem[] {
  return getRecentlyWatched("live").map((e) => ({
    id: e.id,
    name: e.name,
    categoryId: e.categoryId || "",
    icon: e.icon,
  }));
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

  const [level, setLevel] = useState<SidebarLevel>("categories");
  const [categories, setCategories] = useState<Category[]>(liveCache.categories || []);
  const [items, setItems] = useState<SidebarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  const [playback, setPlayback] = useState<PlaybackInfo | null>(null);

  const [overlayPlayback, setOverlayPlayback] = useState<PlaybackInfo | null>(null);

  const [seriesDetail, setSeriesDetail] = useState<{
    seriesId: number;
    name: string;
    poster?: string;
    rating?: string;
    plot?: string;
    genre?: string;
  } | null>(null);

  const [allLiveStreams, setAllLiveStreams] = useState<SidebarItem[]>(liveCache.allStreams || []);
  const { favKeys, toggle: toggleFav, entries: favEntries } = useFavorites();
  const [recentLive, setRecentLive] = useState<SidebarItem[]>(() => mapRecentLiveToSidebarItems());

  useEffect(() => {
    return subscribeRecentlyWatched(() => setRecentLive(mapRecentLiveToSidebarItems()));
  }, []);

  const vodPausedRef = useRef(false);
  const livePausedRef = useRef(false);

  // Live channel playback is the app's core experience, so while a live
  // channel is on screen it gets every bit of bandwidth/CPU the app can
  // give it -- background image preloading and category prefetching for
  // Movies/Series are paused for as long as the user is actually watching
  // live TV, not just for a brief warm-up window. This is what keeps live
  // playback smooth instead of competing with unrelated background
  // fetches for the same connection.
  const prioritizeLivePlayback = () => {
    if (!livePausedRef.current) {
      livePausedRef.current = true;
      pauseBackgroundLoading();
    }
  };

  const releaseLivePause = () => {
    if (livePausedRef.current) {
      livePausedRef.current = false;
      resumeBackgroundLoading();
    }
  };

  const prioritizeVodPlayback = () => {
    releaseLivePause();
    if (!vodPausedRef.current) {
      vodPausedRef.current = true;
      pauseBackgroundLoading();
    }
  };

  const releaseVodPause = () => {
    if (vodPausedRef.current) {
      vodPausedRef.current = false;
      resumeBackgroundLoading();
    }
  };

  const stopLivePlayback = () => {
  releaseLivePause();
  releaseVodPause();
  setPlayback(null);
};

  useEffect(() => {
    return () => {
      resumeBackgroundLoading();
    };
  }, []);

  useEffect(() => {
    setError("");

    if (liveCache.categories) {
      setCategories(liveCache.categories);
      setLoading(false);
    } else {
      setLoading(true);
      setCategories([]);
      client
        .getLiveCategories()
        .then((cats) => {
          liveCache.categories = cats;
          setCategories(cats);
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false));
    }

    if (liveCache.allStreams) {
      setAllLiveStreams(liveCache.allStreams);
    } else if (allLiveStreams.length === 0) {
      client
        .getLiveStreams()
        .then((streams) => {
          const mapped = streams.map((s) => ({
            id: String(s.stream_id),
            name: s.name,
            categoryId: s.category_id,
            icon: s.stream_icon,
          }));
          liveCache.allStreams = mapped;
          setAllLiveStreams(mapped);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const handleTabSwitch = (tab: AppTab) => {
    if (tab === activeTab) return;
    if (activeTab === "live" && playback) {
      setPlayback(null);
      releaseLivePause();
    }
    setActiveTab(tab);
    setOverlayPlayback(null);
    releaseVodPause();
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
          icon: s.stream_icon,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleLiveItemClick = (item: SidebarItem) => {
    prioritizeLivePlayback();
    setSelectedItem(item.id);
    const streamId = Number(item.id);
    const url = client.getLiveUrl(streamId);
    setPlayback({ url, title: item.name, isLive: true, streamId });
    recordWatched({ id: item.id, name: item.name, type: "live", categoryId: item.categoryId, icon: item.icon });
  };

  const playLive = (streamId: number, name: string) => {
    releaseVodPause();
    prioritizeLivePlayback();
    const url = client.getLiveUrl(streamId);
    setPlayback({ url, title: name, isLive: true, streamId });
    setOverlayPlayback(null);
    setActiveTab("live");
    recordWatched({ id: String(streamId), name, type: "live" });
  };

  const playVod = (streamId: number, ext: string, name: string, poster?: string, rating?: string) => {
    stopLivePlayback();
    prioritizeVodPlayback();
    // Closing the series detail popup (if it happened to still be open --
    // e.g. playing from Favorites/Search while a series modal was open in
    // another tab) matters here too: it and the overlay player share the
    // same z-index, and the modal renders later in the DOM, so it would
    // otherwise visually sit on top of the video that's actually loading
    // underneath -- looking exactly like playback being stuck.
    setSeriesDetail(null);
    const url = client.getVodUrl(streamId, ext);
    setOverlayPlayback({ url, title: name, isLive: false });
    recordWatched({
      id: String(streamId),
      name,
      type: "vod",
      containerExtension: ext,
      poster,
      rating,
    });
  };

  const handleVodItemClick = (item: BrowseItem) => {
    playVod(Number(item.id), item.containerExtension || "mp4", item.name, item.poster, item.rating);
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
    stopLivePlayback();
    prioritizeVodPlayback();
    if (seriesDetail) {
      recordWatched({
        id: String(seriesDetail.seriesId),
        name: seriesDetail.name,
        type: "series",
        seriesId: seriesDetail.seriesId,
        poster: seriesDetail.poster,
        rating: seriesDetail.rating,
        plot: seriesDetail.plot,
        genre: seriesDetail.genre,
      });
    }
    // The series detail popup MUST close here -- it and the overlay player
    // below share the same z-index (z-50), and since the modal is mounted
    // later in the DOM tree it paints on top of the video that starts
    // loading underneath. Without this, the episode was actually
    // buffering/playing the whole time, just invisibly, behind what looked
    // like a stuck loading state.
    setSeriesDetail(null);
    const url = client.getEpisodeUrl(episode.episode_id, episode.container_extension);
    setOverlayPlayback({ url, title: `${seriesName} - ${episode.title}`, isLive: false });
  };

  const handleBackToCategories = () => {
    setLevel("categories");
    setSelectedCategory(null);
    setItems([]);
    setError("");
  };

  const handleShowFavorites = () => {
    setLevel("favorites");
    setSelectedCategory(null);
    setError("");
  };

  const handleShowRecentlyWatched = () => {
    setLevel("recent");
    setSelectedCategory(null);
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
      playVod(Number(entry.id), entry.containerExtension || "mp4", entry.name, entry.poster, entry.rating);
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

  const renderTabContent = (tab: AppTab) => {
    switch (tab) {
      case "live":
        return (
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
              onShowFavorites={handleShowFavorites}
              recentlyWatched={recentLive}
              onShowRecentlyWatched={handleShowRecentlyWatched}
            />
          </>
        );

      case "vod":
        return (
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
        );

      case "series":
        return (
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
        );

      case "search":
        return (
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
        );

      case "favorites":
        return (
          <FavoritesTab
            entries={favEntries}
            onPlay={handleFavPlay}
            onRemove={handleFavRemove}
            accentColor={accent.primary}
            lang={lang}
          />
        );

      case "downloads":
        return <DownloadsTab accentColor={accent.primary} lang={lang} />;
    }
  };

  return (
    <div className="h-screen bg-[#0d0f14] flex flex-col overflow-hidden">
      <header
        className="flex-shrink-0 h-14 flex items-center justify-between px-6 z-30"
        style={isElectron ? ({ WebkitAppRegion: "drag" } as React.CSSProperties) : undefined}
      >
        <nav
          className="flex items-center gap-1"
          style={isElectron ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties) : undefined}
        >
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

        <div
          className="flex items-center gap-1"
          style={isElectron ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties) : undefined}
        >
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
          {isElectron && (
            <div className="flex items-center gap-0.5 ml-3 pl-3 border-l border-white/10">
              <button
                onClick={() => (window as any).electronApp?.minimizeWindow?.()}
                className="flex items-center justify-center w-7 h-7 text-gray-500 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                title="Minimize"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => (window as any).electronApp?.maximizeWindow?.()}
                className="flex items-center justify-center w-7 h-7 text-gray-500 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                title="Maximize"
              >
                <Square className="w-3 h-3" />
              </button>
              <button
                onClick={() => (window as any).electronApp?.closeWindow?.()}
                className="flex items-center justify-center w-7 h-7 text-gray-500 hover:text-white hover:bg-red-600 rounded-md transition-colors"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        {tabConfig.map(({ key }) => {
          const activeIdx = TAB_ORDER.indexOf(activeTab);
          const idx = TAB_ORDER.indexOf(key);
          const isActive = key === activeTab;
          const dir = idx === activeIdx ? 0 : idx < activeIdx ? -1 : 1;
          const x = dir * 56;
          return (
            <div
              key={key}
              className="absolute inset-0 flex"
              style={{
                opacity: isActive ? 1 : 0,
                transform: `translateX(${x}px)`,
                transition: "opacity 380ms cubic-bezier(0.22, 1, 0.36, 1), transform 380ms cubic-bezier(0.22, 1, 0.36, 1)",
                pointerEvents: isActive ? "auto" : "none",
                zIndex: isActive ? 10 : 0,
              }}
            >
              {renderTabContent(key)}
            </div>
          );
        })}
      </div>

      {overlayPlayback && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4"
          style={{
            animation: "overlayFadeIn 380ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <style>{`
            @keyframes overlayFadeIn {
              from { opacity: 0; transform: scale(0.97); }
              to { opacity: 1; transform: scale(1); }
            }
          `}</style>
          <div className="w-full max-w-5xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-lg truncate pr-4">
                {overlayPlayback.title}
              </h3>
              <button
                onClick={() => {
                  setOverlayPlayback(null);
                  releaseVodPause();
                }}
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
