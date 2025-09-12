// types/settingstypedefs.d.ts

interface SettingsParameters {
  db: Low;
  mangalist: SettingsMangaList;
  mangaupdates: SettingdMangaUpdates;
  hakuneko: SettingsHakuneko;
  redis: SettingsRedis;
  all?: SettingsAll;
}

interface SettingsClass {
  db: Low;
  mangalist: SettingsMangaList;
  mangaupdates: SettingdMangaUpdates;
  hakuneko: SettingsHakuneko;
  redis: SettingsRedis;
  all?: SettingsAll;

  refresh(): Promise<void>;
  stringify(): string;
}

// Static side of the class
interface SettingsConstructor {
  new(args: SettingsParameters): SettingsClass;

  init(settings?: SettingsClass): Promise<SettingsClass>;
}

// ─────────────────────────────
// All Settings Section
// ─────────────────────────────
interface SettingsAll {
  mangalist: SettingsMangaList;
  mangaupdates: SettingdMangaUpdates;
  hakuneko: SettingsHakuneko;
  redis: SettingsRedis;
}

// ─────────────────────────────
// MangaList Section
// ─────────────────────────────
interface SettingsMangaList {
  manga: {
    directoryPathName: string;
  };
  database: Record<DatabaseKey, string>;
}

// Strongly typed keys for mangalist database entries
type DatabaseKey =
  | 'directoryPathName'
  | 'manga'
  | 'mangalist'
  | 'hakuneko'
  | 'mangaupdates';

// ─────────────────────────────
// MangaUpdates Section
// ─────────────────────────────
interface SettingdMangaUpdates {
  credentials: Record<CredentialsKey, string>;
  api: {
    baseUrl: string;
    endPoints: Record<EndpointKey, SettingdMangaUpdatesEndpoints>;
  };
}

interface SettingdMangaUpdatesEndpoints {
  template: string;
  optional?: {
    per_page?: number;
    throttle?: number; // You can refine this too if needed
  };
}

// Strongly typed keys for known endpoints
type EndpointKey =
  | 'login'
  | 'listSearch'
  | 'listGetSeriesItem'
  | 'listUpdateSeries'
  | 'listAddSeries'
  | 'series'
  | 'seriesSearch';

type CredentialsKey =
  | 'username'
  | 'password';

// ─────────────────────────────
// HakuNeko Section
// ─────────────────────────────
interface SettingsHakuneko {
  paths: Record<HakunekoPathssKey, string>;
}

type HakunekoPathssKey =
  | 'bookmarks'
  | 'chaptermarks';

// ─────────────────────────────
// Redis Section
// ─────────────────────────────
interface SettingsRedis {
  default: RedisHostKey;
  environment: Record<RedisHostKey, RedisConfig>;
}

// Strongly typed keys for Redis hosts
type RedisHostKey = 'local' | 'ds1515' | 'wizard';

// Redis config structure
interface RedisConfig {
  host: string;
  port: number;
}

interface DBDefaultData {
  [key: string]: unknown[];
}

interface SettingsDBDefaults extends DBDefaultData {
  mangalist: SettingsMangaList[];
  redis: SettingsRedis[];
  hakuneko: SettingsHakuneko[];
  mangaupdates: SettingdMangaUpdates[];
}