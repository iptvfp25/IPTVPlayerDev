export interface UserInfo {
  username: string;
  password: string;
  message: string;
  auth: number;
  status: string;
  exp_date: string | null;
  is_trial: string;
  active_cons: string;
  created_at: string;
  max_connections: string;
  allowed_output_formats: string[];
}

export interface Category {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface LiveStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string | null;
  added: string;
  category_id: string;
  custom_sid: string;
  tv_archive: number;
  direct_source: string;
  tv_archive_duration: number;
}

export interface VodStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  rating: string;
  rating_5based: number;
  added: string;
  category_id: string;
  container_extension: string;
  custom_sid: string;
  direct_source: string;
  lid: string;
}

export interface Series {
  num: number;
  name: string;
  series_id: number;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  last_modified: string;
  rating: string;
  rating_5based: number;
  category_id: string;
}

export interface Episode {
  id: string;
  episode_num: number;
  title: string;
  container_extension: string;
  info: {
    movie_image?: string;
    plot?: string;
    duration?: string;
    rating?: string;
    season?: number;
  };
  season: number;
  episode_id: number;
}

export interface SeriesInfo {
  seasons: Array<{
    season_number: number;
    name: string;
    cover: string;
    plot: string;
  }>;
    info: {
    name: string;
    cover: string;
    plot: string;
    cast: string;
    director: string;
    genre: string;
    releaseDate: string;
    rating: string;
    rating_5based: number;
    category_id: string;
  };
  episodes: Record<string, Episode[]>;
}

export type ContentType = "live" | "vod" | "series";

export interface ContentItem {
  id: number;
  name: string;
  icon?: string;
  category_id: string;
  container_extension?: string;
  type: ContentType;
}

export interface PlayableItem {
  id: number;
  name: string;
  type: ContentType;
  container_extension?: string;
  series_id?: number;
}

export interface EpisodeItem {
  episode_id: number;
  title: string;
  season: number;
  container_extension: string;
}

export interface EpgProgram {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  start_timestamp: number;
  stop_timestamp: number;
  category: string;
}

export interface ShortEpg {
  epg_listings: EpgProgram[];
}
