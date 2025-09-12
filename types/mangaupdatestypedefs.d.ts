// types/mangaupdatestypedefs.d.ts

/**
 * MangaUpdates constructor parameters
 */
interface MangaUpdatesParameters {
  settings: MangaUpdatesSettings;
  redisclient: RedisClientType;
  bearerToken?: string;
};

/**
 * MangaUpdates class
 */
interface MangaUpdatesClass {
  settings: MangaUpdatesSettings;
  redisclient: RedisClientType;
  bearerToken: string | null;

  // Instance methods
  refresh(value?: boolean): Promise<boolean>;
  getToken(refresh?: boolean): Promise<string>;

  getRedisValue(key: string): Promise<string | null>;
  setRedisValue(key: string, value: string, ttl?: number): Promise<void>;

  getRedisJSONValue(key: string): Promise<unknown>;
  setRedisJSONValue(key: string, value: unknown): Promise<void>;

  getListSeries(id: number): Promise<MangaUpdatesReadingListSearchResultsEntry[]>;
  getListSeriesItem(id: number): Promise<MangaUpdatesReadingListSearchResultsEntry>;
  getSerieDetail(id: number): Promise<MangaUpdatesSeriesResultEntry>;
  serieSearch(payload: Partial<MangaUpdatesSearchSeriesRequest>): Promise<MangaUpdatesSearchSeriesResultEntry[]>;
  updateListSeries(payload: unknown): Promise<unknown>;
  addListSeries(payload: unknown): Promise<unknown>;
}

/**
 * Static side of the MangaUpdates class
 */
interface MangaUpdatesConstructor {
  new (args: MangaUpdatesParameters): MangaUpdatesClass;

  init(settings: Settings): Promise<MangaUpdatesClass>;
  formatAxiosError(error: unknown, context: string): Error;
}

/**
 * MangaUpdates settings if inferred from existing Settings interfaces
 * Merge of SettingdMangaUpdates, SettingsRedis and SettingsMangaList.database
 */
type MangaUpdatesSettings = SettingdMangaUpdates & {
  redis: SettingsRedis;
};

type MangaUpdatesReadingList = Record<string, Entry[]>;

/**
 * Manga Updates API reading list search
 * "${baseUrl}/lists/${list_id}/search"
 * 
 */

/**
 * Represents Manga Updates reading list search request body.
 */
interface MangaUpdatesReadingListSearchRequest {
  page: number,
  perpage: number
}

/**
 * Represents a single entry in the Manga Updates reading list search results.
 */
interface MangaUpdatesReadingListSearchResultsEntry {
  record: {
    series: {
      id: number;
      url: string;
      title: string;
    };
    list_id: number;
    list_type: string;
    list_icon: string;
    status: {
      volume: number;
      chapter: number;
    };
    priority: number;
    time_added: TimestampInfo;
  };
  metadata: {
    series?: {
      series_id?: number;
      title?: string;
      url?: string;
      description?: string;
      image?: ImageBlock;
      type?: string;
      year?: string;
      bayesian_rating?: number;
      rating_votes?: number;
      genres?: {
        genre: string;
      }[];
      latest_chapter?: number;
      rank?: RankInfo;
      last_updated?: TimestampInfo;
      admin?: {
        added_by: AddedBy;
        approved: boolean;
      };
    };
    user_rating: number;
  };
}

/**
 * Manga Updates API series get details results
 * "${baseUrl}/series/${series_id}"
 * 
 */

/** 
* Represents detailed information about a series in the Manga Updates database.
*/
interface MangaUpdatesSeriesAssociatedTitles {
    title: string;
}

interface MangaUpdatesSeriesResultEntry extends objectBase {
  series_id: number;
  title: string;
  url: string;
  associated: MangaUpdatesSeriesAssociatedTitles[];
  description: string;
  image: Image;
  type: string;
  year: string;
  bayesian_rating: number;
  rating_votes: number;
  genres: {
    genre: string;
  }[];
  categories: Category[];
  latest_chapter: number;
  forum_id: number;
  status: string;
  licensed: boolean;
  completed: boolean;
  anime: Anime;
  related_series: RelatedSeries[];
  authors: Author[];
  publishers: Publisher[];
  publications: Publication[];
  recommendations: Recommendation[];
  category_recommendations: Recommendation[];
  rank: Rank;
  last_updated: TimestampInfo;
  admin: {
    added_by: AddedBy;
    approved: boolean;
  };
}


/**
 * Manga Updates API series search results
 * "${baseUrl}/series/search"
 * 
 */

/** 
* Represents Manga Updates search series request body.
*/
interface MangaUpdatesSearchSeriesRequest {
  search: string;
  added_by: number;
  stype: string; // e.g., "title"
  licensed: string; // e.g., "yes" | "no"
  type: string[]; // e.g., ["Artbook", "Doujinshi"]
  year: string;
  filter_types: string[];
  category: string[];
  pubname: string;
  filter: string; // e.g., "scanlated"
  filters: string[]; // e.g., ["scanlated"]
  list: string;
  page: number;
  perpage: number;
  letter: string;
  genre: string[];
  exclude_genre: string[];
  orderby: string; // e.g., "score", "title", etc.
  pending: boolean;
  include_rank_metadata: boolean;
  exclude_filtered_genres: boolean;
}

/** 
* Represents series search results in the Manga Updates database.
*/
interface MangaUpdatesSearchSeriesResultEntry {
  hit_title: string;
  record: {
    series_id: number;
    title: string;
    url: string;
    description: string;
    image: ImageBlock;
    type: string;
    year: string;
    bayesian_rating: number;
    rating_votes: number;
    genres: {
      genre: string;
    }[];
    latest_chapter: number;
    rank: RankInfo;
    last_updated: TimestampInfo;
    admin: {
      added_by: AddedBy;
      approved: boolean;
    };
  };
  metadata: {
    user_list: {
      series: {
        id: number;
        url: string;
        title: string;
      };
      list_id: number;
      list_type: string;
      list_icon: string;
      status: {
        volume: number;
        chapter: number;
      };
      priority: number;
      time_added: TimestampInfo;
    };
    user_genre_highlights: {
      genre: string;
      color: string;
    }[];
  };
}

/**
 * Manga Updates Shared Interfaces
 * These interfaces are shared across different parts of the Manga Updates API.
 */
// timestamp format
interface TimestampInfo {
  timestamp: number;
  as_rfc3339: string;
  as_string: string;
}

// Image structure
interface ImageBlock {
  url: {
    original: string;
    thumb: string;
  };
  height: number;
  width: number;
}

// Ranking details
interface RankInfo {
  position: {
    week: number;
    month: number;
    three_months: number;
    six_months: number;
    year: number;
  };
  old_position: {
    week: number;
    month: number;
    three_months: number;
    six_months: number;
    year: number;
  };
  lists: {
    reading: number;
    wish: number;
    complete: number;
    unfinished: number;
    custom: number;
  };
}

// Added_by information
interface AddedBy {
  user_id: number;
  username: string;
  url: string;
  avatar: {
    id: number;
    url: string;
    height: number;
    width: number;
  };
  time_joined: TimestampInfo;
  signature: string;
  forum_title: string;
  folding_at_home: boolean;
  profile: {
    upgrade: {
      requested: boolean;
      reason: string;
    };
  };
  stats: {
    forum_posts: number;
    added_authors: number;
    added_groups: number;
    added_publishers: number;
    added_releases: number;
    added_series: number;
  };
  user_group: string;
  user_group_name: string;
}

interface Image {
  url: {
    original: string;
    thumb: string;
  };
  height: number;
  width: number;
}

interface Category {
  series_id: number;
  category: string;
  votes: number;
  votes_plus: number;
  votes_minus: number;
  added_by: number;
}

interface Anime {
  start: string;
  end: string;
}

interface RelatedSeries {
  relation_id: number;
  relation_type: string;
  related_series_id: number;
  related_series_name: string;
  related_series_url: string;
  triggered_by_relation_id: number;
}

interface Author {
  name: string;
  author_id: number;
  url: string;
  type: string;
}

interface Publisher {
  publisher_name: string;
  publisher_id: number;
  url: string;
  type: string;
  notes: string;
}

interface Publication {
  publication_name: string;
  publisher_name: string;
  publisher_id: string;
}

interface Recommendation {
  series_name: string;
  series_url: string;
  series_id: number;
  series_image: Image;
  weight: number;
}
