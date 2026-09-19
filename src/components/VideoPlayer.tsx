import { useEffect, useRef, useState, useCallback } from "react";
import {
  Play,
  Pause,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  AlertTriangle,
  Loader2,
  SkipBack,
  SkipForward,
  Languages,
  Check,
} from "lucide-react";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { isElectron } from "@/lib/xtream";

interface VideoPlayerProps {
  url: string;
  title: string;
  isLive: boolean;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  resumeTime?: number;
  accentColor?: string;
}

function detectStreamType(url: string): "hls" | "mpegts" | "native" {
  const lower = url.toLowerCase();
  if (lower.includes(".m3u8")) return "hls";
  if (lower.includes(".ts")) return "mpegts";
  if (
    lower.includes(".mp4") ||
    lower.includes(".mkv") ||
    lower.includes(".avi") ||
    lower.includes(".mov") ||
    lower.includes(".webm")
  )
    return "native";
  return isElectron ? "mpegts" : "hls";
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// VOD/episodes are one-shot: if playback genuinely can't recover, showing an
// error quickly is the right call. Live channels are a different story --
// brief network blips, provider-side hiccups, and momentary segment drops
// are normal and self-heal within a few seconds. Killing playback on the
// same 5-strikes threshold used for VOD was making live channels far more
// fragile than they needed to be, so live gets a much more generous budget
// before giving up.
const MAX_CONSECUTIVE_ERRORS_VOD = 5;
const MAX_CONSECUTIVE_ERRORS_LIVE = 25;

// Some Xtream panels serve VOD/episode files that are actually raw MPEG-TS
// even though the URL ends in .mp4/.mkv (or are genuinely .mkv, which
// browsers can't decode natively at all). A native <video> element can't
// demux either case, so it never reaches HAVE_METADATA (readyState stays at
// 0) no matter how long you wait. A genuine mp4 typically reaches
// HAVE_METADATA within a second or two even on a slow connection, because
// only the small moov/header atom needs to download before metadata is
// known -- the rest can keep buffering slowly afterwards. So we fall back
// to the mpegts.js demuxer if metadata has genuinely never loaded by this
// deadline; a real-but-slow file that already has metadata is left alone.
const NATIVE_STARTUP_TIMEOUT_MS = 9000;

interface AudioTrackOption {
  id: number;
  label: string;
}

export default function VideoPlayer({
  url,
  title,
  isLive,
  onTimeUpdate,
  resumeTime,
  accentColor = "#e91e63",
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<mpegts.Player | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const clickTimer = useRef<ReturnType<typeof setTimeout>>();
  const errorCountRef = useRef(0);
  const nativeFallbackTimer = useRef<ReturnType<typeof setTimeout>>();
  const metadataLoadedRef = useRef(false);
  // True while we're in the "native <video src>, but might secretly be
  // MPEG-TS" branch and haven't yet tried the mpegts.js fallback. Lets the
  // shared 'error' listener react to an immediate native decode failure
  // (e.g. genuine .mkv, which browsers reject right away instead of just
  // sitting at readyState 0) by switching engines instead of just showing
  // an error the fallback never gets a chance to clear.
  const nativeFallbackPendingRef = useRef(false);
  const nativeFallbackUsedRef = useRef(false);
  const currentUrlRef = useRef(url);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState("");
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [audioTracks, setAudioTracks] = useState<AudioTrackOption[]>([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState<number | null>(null);
  const [showAudioMenu, setShowAudioMenu] = useState(false);

  const maxConsecutiveErrors = isLive ? MAX_CONSECUTIVE_ERRORS_LIVE : MAX_CONSECUTIVE_ERRORS_VOD;

  const destroyPlayers = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      try {
        mpegtsRef.current.pause();
        mpegtsRef.current.unload();
        mpegtsRef.current.detachMediaElement();
        mpegtsRef.current.destroy();
      } catch {}
      mpegtsRef.current = null;
    }
    if (nativeFallbackTimer.current) {
      clearTimeout(nativeFallbackTimer.current);
      nativeFallbackTimer.current = undefined;
    }
  }, []);

  // Starts (or restarts) playback via the mpegts.js demuxer, used both for
  // genuine .ts URLs and as the fallback when a "native" URL turns out to
  // actually be MPEG-TS (or MKV) in disguise.
  //
  // Live channels get extra buffering/latency tuning for smoothness (see
  // below) -- but that tuning must NOT apply to VOD/episodes. mpegts.js's
  // `lazyLoad` option (which the live tuning disables) is what throttles
  // downloads to roughly playback speed; disabling it for a movie/episode
  // makes the player try to download the *entire remaining file* as fast
  // as possible with no cap, which is exactly what was causing movies and
  // episodes to take forever (or never) to start. So the extra buffer/
  // cleanup/lazyLoad settings are scoped to isLive only, and VOD keeps the
  // original, plain configuration that was already working.
  const startMpegts = useCallback((video: HTMLVideoElement, targetUrl: string) => {
    if (!mpegts.isSupported()) {
      setError("MPEG-TS playback is not supported.");
      return;
    }
    // Clear any stale error left over from the native attempt that's being
    // replaced -- otherwise the error overlay stays on screen forever even
    // though this fallback attempt might play back just fine.
    setError("");
    setBuffering(true);
    nativeFallbackPendingRef.current = false;
    nativeFallbackUsedRef.current = true;
    if (nativeFallbackTimer.current) {
      clearTimeout(nativeFallbackTimer.current);
      nativeFallbackTimer.current = undefined;
    }
    video.removeAttribute("src");
    video.load();
    const player = mpegts.createPlayer(
      {
        type: "mpegts",
        isLive,
        url: targetUrl,
      },
      isLive
        ? {
            enableWorker: true,
            enableStashBuffer: true,
            stashInitialSize: 384,
            liveBufferLatencyChasing: false,
            liveBufferLatencyMaxLatency: 10,
            liveBufferLatencyMinRemain: 3,
            autoCleanupSourceBuffer: true,
            autoCleanupMaxBackwardDuration: 30,
            autoCleanupMinBackwardDuration: 20,
            lazyLoad: false,
          }
        : {
            enableWorker: true,
            liveBufferLatencyChasing: false,
            liveBufferLatencyMaxLatency: 5,
            liveBufferLatencyMinRemain: 1,
          }
    );
    player.attachMediaElement(video);
    player.load();
    player.play();
    player.on(mpegts.Events.ERROR, () => {
      errorCountRef.current += 1;
      if (errorCountRef.current >= maxConsecutiveErrors) {
        setError("Stream playback error. The stream may be offline.");
      }
    });
    player.on(mpegts.Events.LOADING_COMPLETE, () => {
      errorCountRef.current = 0;
    });
    mpegtsRef.current = player;
  }, [isLive, maxConsecutiveErrors]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    destroyPlayers();
    setError("");
    setBuffering(true);
    setPlaying(false);
    errorCountRef.current = 0;
    metadataLoadedRef.current = false;
    nativeFallbackPendingRef.current = false;
    nativeFallbackUsedRef.current = false;
    currentUrlRef.current = url;
    setAudioTracks([]);
    setActiveAudioTrack(null);
    video.removeAttribute("src");
    video.load();

    const type = detectStreamType(url);

    try {
      if (type === "hls") {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            // Smooth, uninterrupted live playback matters far more here
            // than shaving latency -- low-latency mode and a thin buffer
            // both make the player much more sensitive to normal network
            // jitter, which is what shows up to the user as stutter/
            // rebuffering. A deeper buffer and looser live-sync tolerance
            // trade a couple of extra seconds of latency for a stream that
            // doesn't hiccup. These settings are harmless for VOD (a
            // finite, non-live HLS playlist) since hls.js only applies the
            // live-sync ones when it detects a live playlist.
            lowLatencyMode: false,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            backBufferLength: 90,
            liveSyncDurationCount: 5,
            liveMaxLatencyDurationCount: 15,
            xhrSetup: (xhr) => {
              xhr.withCredentials = false;
            },
          });
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            errorCountRef.current = 0;
            video.play().catch(() => {});
          });
          hls.on(Hls.Events.FRAG_LOADED, () => {
            errorCountRef.current = 0;
          });
          hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
            const tracks = hls.audioTracks.map((t, idx) => ({
              id: idx,
              label: t.name || t.lang || `Audio ${idx + 1}`,
            }));
            setAudioTracks(tracks);
            setActiveAudioTrack(hls.audioTrack);
          });
          hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_e, data) => {
            setActiveAudioTrack(data.id);
          });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal) return;

            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              errorCountRef.current += 1;
              if (errorCountRef.current >= maxConsecutiveErrors) {
                setError(
                  "Impossibile raggiungere il server IPTV. Il flusso potrebbe essere bloccato dal provider o temporaneamente non disponibile."
                );
                return;
              }
              setTimeout(() => hls.startLoad(), 2000);
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              errorCountRef.current += 1;
              if (errorCountRef.current >= maxConsecutiveErrors) {
                setError("Errore di decodifica del flusso video.");
                return;
              }
              hls.recoverMediaError();
            } else {
              setError("Playback error. The stream may be unavailable.");
            }
          });
          hlsRef.current = hls;
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = url;
          video.play().catch(() => {});
        } else {
          setError("HLS playback is not supported in this environment.");
        }
      } else if (type === "mpegts") {
        startMpegts(video, url);
      } else {
        // "native" -- but if this turns out to actually be MPEG-TS or MKV
        // wearing a friendlier extension, the video element will either
        // never reach HAVE_METADATA, or fail immediately with an 'error'
        // event (common for genuine .mkv, which Chromium rejects outright
        // instead of stalling). Both cases are handled: a timer catches the
        // "never loads" case, and the shared error listener below catches
        // the "fails immediately" case and switches engines right away
        // instead of waiting out the full timeout.
        nativeFallbackPendingRef.current = true;
        video.src = url;
        video.play().catch(() => {});

        nativeFallbackTimer.current = setTimeout(() => {
          if (!metadataLoadedRef.current && videoRef.current && videoRef.current.readyState === 0) {
            startMpegts(videoRef.current, url);
          }
        }, NATIVE_STARTUP_TIMEOUT_MS);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to initialize player");
    }

    return () => {
      destroyPlayers();
    };
  }, [url, isLive, destroyPlayers, startMpegts, maxConsecutiveErrors]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resumeTime || resumeTime <= 0) return;
    const onLoaded = () => {
      if (video.duration > 0 && resumeTime < video.duration - 5) {
        video.currentTime = resumeTime;
      }
    };
    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    return () => video.removeEventListener("loadedmetadata", onLoaded);
  }, [resumeTime, url]);

  // Detects native (Chromium) multi-audio-track support for the current
  // media element -- used for live channels whose multiple audio streams
  // are demuxed directly onto the <video> element rather than through
  // hls.js's own audio-track API (which only applies to HLS renditions).
  // Note: mpegts.js (used for most live Electron playback) only exposes a
  // single audio track to the browser today, so this will usually report
  // one track even on multi-language broadcasts -- that's a limitation of
  // the demuxing library itself, not this detection code.
  useEffect(() => {
    const video = videoRef.current as (HTMLVideoElement & { audioTracks?: any }) | null;
    if (!video || !video.audioTracks) return;

    const syncTracks = () => {
      const list = video.audioTracks;
      if (!list || list.length === 0) return;
      const tracks: AudioTrackOption[] = [];
      let active = 0;
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        tracks.push({ id: i, label: t.label || t.language || `Audio ${i + 1}` });
        if (t.enabled) active = i;
      }
      setAudioTracks((prev) => (hlsRef.current && prev.length > 0 ? prev : tracks));
      setActiveAudioTrack((prev) => (hlsRef.current && prev !== null ? prev : active));
    };

    syncTracks();
    video.audioTracks.addEventListener?.("addtrack", syncTracks);
    video.audioTracks.addEventListener?.("removetrack", syncTracks);
    video.audioTracks.addEventListener?.("change", syncTracks);
    return () => {
      video.audioTracks?.removeEventListener?.("addtrack", syncTracks);
      video.audioTracks?.removeEventListener?.("removetrack", syncTracks);
      video.audioTracks?.removeEventListener?.("change", syncTracks);
    };
  }, [url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onLoadedMetadata = () => {
      // Metadata loading proves the browser can actually parse this
      // container -- cancel the MPEG-TS-in-disguise fallback timer even
      // if the file is still slowly buffering and hasn't started playing.
      metadataLoadedRef.current = true;
      nativeFallbackPendingRef.current = false;
      if (nativeFallbackTimer.current) {
        clearTimeout(nativeFallbackTimer.current);
        nativeFallbackTimer.current = undefined;
      }
    };
    const onTime = () => {
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
      onTimeUpdate?.(video.currentTime, video.duration || 0);
    };
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onCanPlay = () => setBuffering(false);
    const onError = () => {
      if (!video.error) return;

      // The native <video> element failed outright (typical for a genuine
      // .mkv, or a disguised MPEG-TS that Chromium rejects immediately
      // instead of silently stalling). If we haven't tried the mpegts.js
      // fallback yet for this URL, switch engines right now instead of
      // showing a dead-end error -- this is exactly the scenario that
      // previously left users staring at a stuck error message while a
      // perfectly playable fallback path was never attempted.
      if (nativeFallbackPendingRef.current && !nativeFallbackUsedRef.current) {
        if (nativeFallbackTimer.current) {
          clearTimeout(nativeFallbackTimer.current);
          nativeFallbackTimer.current = undefined;
        }
        startMpegts(video, currentUrlRef.current);
        return;
      }

      setError("Playback failed. The stream may be unavailable.");
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onError);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error", onError);
    };
  }, [onTimeUpdate, startMpegts]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playing) {
        setShowControls(false);
        setShowAudioMenu(false);
      }
    }, 3000);
  }, [playing]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const handleVolumeChange = (val: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = val;
    setVolume(val);
    if (val > 0 && video.muted) {
      video.muted = false;
      setMuted(false);
    }
  };

  const seek = (time: number) => {
    const video = videoRef.current;
    if (!video || !isFinite(time)) return;
    video.currentTime = Math.max(0, Math.min(time, video.duration || 0));
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  };

  const selectAudioTrack = (id: number) => {
    if (hlsRef.current) {
      hlsRef.current.audioTrack = id;
    } else {
      const video = videoRef.current as (HTMLVideoElement & { audioTracks?: any }) | null;
      const list = video?.audioTracks;
      if (list) {
        for (let i = 0; i < list.length; i++) {
          list[i].enabled = i === id;
        }
      }
    }
    setActiveAudioTrack(id);
    setShowAudioMenu(false);
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input")) return;
    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      togglePlay();
    }, 250);
  };

  const handleContainerDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input")) return;
    clearTimeout(clickTimer.current);
    toggleFullscreen();
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? "relative bg-black overflow-hidden group cursor-default select-none fixed inset-0 z-[999] w-screen h-screen"
          : "relative aspect-video bg-black rounded-xl overflow-hidden group cursor-default select-none"
      }
      onMouseMove={resetHideTimer}
      onMouseLeave={() => { if (playing) { setShowControls(false); setShowAudioMenu(false); } }}
      onClick={handleContainerClick}
      onDoubleClick={handleContainerDoubleClick}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
      />

      {isLive && playing && (
        <div className="absolute top-3 left-3 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider z-10">
          LIVE
        </div>
      )}

      {/* Audio track selector -- live channels only, top-right, fades in/out
          with the rest of the controls. Always visible for live so it's
          discoverable even before any alternate track has been detected;
          if the current stream only has one audio track, the menu says so
          instead of showing an empty list. */}
      {isLive && (
        <div
          className={`absolute top-3 right-3 z-20 transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setShowAudioMenu((s) => !s); }}
            className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
            title="Audio track"
          >
            <Languages className="w-4 h-4" />
          </button>
          {showAudioMenu && (
            <div
              className="absolute right-0 mt-2 w-56 bg-[#141822] border border-white/10 rounded-lg shadow-2xl overflow-hidden py-1"
              onClick={(e) => e.stopPropagation()}
            >
              {audioTracks.length > 1 ? (
                audioTracks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectAudioTrack(t.id)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors text-left"
                  >
                    <span className="truncate">{t.label}</span>
                    {activeAudioTrack === t.id && (
                      <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: accentColor }} />
                    )}
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-xs text-gray-500">
                  No additional audio tracks detected
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {buffering && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-center px-6 max-w-sm">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        </div>
      )}

      {!playing && !buffering && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center transition-transform hover:scale-110"
            style={{ backgroundColor: accentColor }}
          >
            <Play className="w-7 h-7 text-white ml-1 fill-white" />
          </div>
        </div>
      )}

      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-12 pb-3 px-4 z-20 transition-opacity duration-300 ${
          showControls || !playing ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {!isLive && duration > 0 && (
          <div className="mb-3 group/progress">
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={currentTime}
              onChange={(e) => seek(Number(e.target.value))}
              className="w-full h-1 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${accentColor} ${progress}%, rgba(255,255,255,0.2) ${progress}%)`,
              }}
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            className="text-white hover:text-gray-200 transition-colors"
          >
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white" />}
          </button>

          {!isLive && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); seek(currentTime - 10); }}
                className="text-white/70 hover:text-white transition-colors"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); seek(currentTime + 30); }}
                className="text-white/70 hover:text-white transition-colors"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </>
          )}

          <span className="text-white text-xs font-medium truncate flex-1 ml-1">
            {title}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
              className="text-white/70 hover:text-white transition-colors"
            >
              {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => { e.stopPropagation(); handleVolumeChange(Number(e.target.value)); }}
              onClick={(e) => e.stopPropagation()}
              className="w-16 h-1 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, white ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) ${(muted ? 0 : volume) * 100}%)`,
              }}
            />
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
            className="text-white/70 hover:text-white transition-colors"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
