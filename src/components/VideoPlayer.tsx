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

const MAX_CONSECUTIVE_ERRORS = 5;

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
  const errorCountRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState("");
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    destroyPlayers();
    setError("");
    setBuffering(true);
    setPlaying(false);
    errorCountRef.current = 0;
    video.removeAttribute("src");
    video.load();

    const type = detectStreamType(url);

    try {
      if (type === "hls") {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: isLive,
            maxBufferLength: isLive ? 10 : 30,
            maxMaxBufferLength: isLive ? 20 : 60,
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
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal) return;

            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              errorCountRef.current += 1;
              if (errorCountRef.current >= MAX_CONSECUTIVE_ERRORS) {
                setError(
                  "Impossibile raggiungere il server IPTV. Il flusso potrebbe essere bloccato dal provider o temporaneamente non disponibile."
                );
                return;
              }
              setTimeout(() => hls.startLoad(), 2000);
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              errorCountRef.current += 1;
              if (errorCountRef.current >= MAX_CONSECUTIVE_ERRORS) {
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
        if (mpegts.isSupported()) {
          const player = mpegts.createPlayer(
            {
              type: "mpegts",
              isLive,
              url,
            },
            {
              enableWorker: true,
              liveBufferLatencyChasing: isLive,
              liveBufferLatencyMaxLatency: 5,
              liveBufferLatencyMinRemain: 1,
            }
          );
          player.attachMediaElement(video);
          player.load();
          player.play();
          player.on(mpegts.Events.ERROR, () => {
            errorCountRef.current += 1;
            if (errorCountRef.current >= MAX_CONSECUTIVE_ERRORS) {
              setError("Stream playback error. The stream may be offline.");
            }
          });
          player.on(mpegts.Events.LOADING_COMPLETE, () => {
            errorCountRef.current = 0;
          });
          mpegtsRef.current = player;
        } else {
          setError("MPEG-TS playback is not supported.");
        }
      } else {
        video.src = url;
        video.play().catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to initialize player");
    }

    return () => {
      destroyPlayers();
    };
  }, [url, isLive, destroyPlayers]);

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => {
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
      onTimeUpdate?.(video.currentTime, video.duration || 0);
    };
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onCanPlay = () => setBuffering(false);
    const onError = () => {
      if (video.error) setError("Playback failed. The stream may be unavailable.");
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onError);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error", onError);
    };
  }, [onTimeUpdate]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playing) setShowControls(false);
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

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative aspect-video bg-black rounded-xl overflow-hidden group cursor-pointer select-none"
      onMouseMove={resetHideTimer}
      onMouseLeave={() => playing && setShowControls(false)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, input")) return;
        togglePlay();
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("button, input")) return;
        toggleFullscreen();
      }}
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
