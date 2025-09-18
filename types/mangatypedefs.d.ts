// types/mangatypedefs.d.ts

interface MangaParameters {
  db: Low<MangaDBDefaults>;
  settings: SettingsClass;
  mangaupdates?: MangaUpdatesClass;
  mangalist?: MangaListClass;
  hakuneko?: Hakuneko;
}

interface MangaClass {
  db: Low;
  settings: SettingsClass;
  path: string;
  mangaupdates: MangaUpdatesClass;
  mangalist: MangaListClass;
  hakuneko: Hakuneko;

  updateDirectories: (modifiedDirectories: mangaListDirectoryEntry[], options: object = { doSortByDate: boolean, doStripTimestamp: boolean }) => Promise<void>;
  mangaDirectories: (slug?: string) => Promise<mangaListDirectoryEntry[]>;
  getModifiedDirectories: () => Promise<mangaListDirectoryEntry[]>;
  addNewSeries: () => Promise<void>;
  getReadingListSerieDetail: (readingItems: mangaReadingItems) => Promise<GetReadingListSerieDetailResult>;
  buildMangaHakuneko: () => Promise<void>;
  updateDirectoriesWithOutMangaUpdatesReadingList: () => Promise<void>;
  addSerieToMangaUpdatesReadingList: (series: mangaReadingList[]) => Promise<void>;
  updateMangaChapter: (key: string, newChapter: number) => Promise<void>;

  getMangaSettings: () => SettingsClass;
  getMangaImage: () => Promise<string|null>;
  reloadMangaUpdatesReadingList: () => Promise<boolean>;
  reloadMangaReadingList: () => Promise<boolean>;
  reloadHakunekoList: () => Promise<boolean>;
  syncReadingList: () => Promise<boolean>;
  getHakunekoReadingList: () => Promise<mangaHakuneko[]>;
  getUnmatchedFromReadingList: () => Promise<getMangaReviewList[]>;
  searchMangaUpdatesSerieByID: (id: number, useCache?: boolean) => Promise<MangaUpdatesSeriesResultEntry>;
  searchMangaUpdatesSerieByName: (seriesTitle: string, useCache?: boolean) => Promise<MangaUpdatesSearchSeriesResultEntry[]>;

  resolveUnmatchedEntry: (id: number, selectedEntry: mangaReviewItemObj) => Promise<boolean>;
  removeUnmatchedEntry: (id: number) => Promise<boolean>;
}

/**
 * Manga method names
 */
type MangaMethodName = keyof MangaClass;

/**
 * Manga method names that resolve to a specific implementation.
 */
type MangaResolveMethodName = Partial<MangaMethodName>;

// Static side of the class
interface MangaConstructor {
  new(args: MangaParameters): MangaClass;

  init(settings?: Settings): Promise<MangaClass>;
  serieDetailObj<T extends { [key: string]: unknown }>(serialDetail: T): mangaSerieDetail;
  serieDetailFromReadingList(readingItem: MangaUpdatesReadingListSearchResultsEntry, other: SerieDetailExtras): mangaSerieDetail;
  buildReadingItemObj(readingItem: MangaUpdatesReadingListSearchResultsEntry): mangaReadingItemObj;
  buildReviewItemObj(reviewItem: mangaReviewItemObj): mangaReviewItemObj;
  createLogMessage<T extends { [key: string]: unknown }>(template: string, value: T): string;
}

declare const Manga: MangaConstructor;

interface mangaListDirectoryEntry {
  key: string,
  name: string,
  mtime: string, // ISO 8601 date string (e.g., from `mtime.toISOString()`).
  lastChapter: number
};

interface MangaHakunekoToMangaUpdatesList {
  id: number;
  title: string;
  availableSeries: MangaUpdatesSearchSeriesResultEntry[];
}

/**
 * Types used for fs.readdir
 */
interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
}
interface FileEntry {
  name: string;
  isFile(): boolean;
}

interface objectBase {
  [key: string]: unknown;
}

/**
 * Used in getAdditionalProperties
 */
type additionalPropertiesFields = string[];

type MangaHakunekoMatching = { key: string, id?: number };
type MangaHakunekoList = { [key: string]: mangaHakuneko };

interface MangaDBDefaults extends DBDefaultData {
  directories: mangaListDirectoryEntry[];
  readinglist: mangaReadingList[];
  hakuneko: MangaHakunekoList;
  mangahakunekomatching: MangaHakunekoMatching[];
  mangahakunekonotmatching: MangaHakunekoMatching[];
  unmatchedfromreadinglist: mangaSerieReviewitemObj[];
  hakunekotomangaupdateslist: MangaHakunekoToMangaUpdatesList[];
}

/**
 * Series detail
 * Short list of fields, derived from MangaUpdatesReadingListSearchResultsEntry
 */
interface mangaSerieDetail extends objectBase {
  key: string;
  id: number;
  title: string;
  url: string;
  chapter: number;
  volume: number;
  userRating: number;
  lastChapter: number;
  associatedTitles: string[];
  directory: string;
  alias: string;
  mangaupdatesTitleMatch: MANGAUPDATES_TITLE_MATCH;
  year: string;
  completed: boolean;
  type: string;
  status: string;
}

type SerieDetailExtras = Pick<mangaSerieDetail, 'key' | 'directory' | 'alias' | 'mangaupdatesTitleMatch' | 'year' | 'completed' | 'type' | 'status'>;

/**
 * Manga reading list (Extends mangaSerieDetail)
 */
interface mangaReadingList extends mangaSerieDetail {
};

/**
 * Manga reading list from MangaUpdates (Extends MangaUpdatesReadingListSearchResultsEntry)
 */
interface mangaupdatesReadingList extends MangaUpdatesReadingListSearchResultsEntry {
};

/**
 * Manga Hakuneko
 * Derived from mangaSerieDetail & HakunekoEntry
 */
interface mangaHakuneko extends mangaSerieDetail, HakunekoEntry {
};

/**
 * Manga ReadingItems
 */
interface mangaReadingItems {
  readingItem: mangaupdatesReadingList;
  reviewItem: mangaReviewItemObj;
  directories: mangaListDirectoryEntry[];
  directoryLookUp?: Set<string>;
  readingList: mangaReadingList[];
  reviewList: mangaSerieReviewitemObj[];
};

interface GetReadingListSerieDetailResult {
  status: GetReadinglistSeriedetailStatus;
  serieDetail?: mangaSerieDetail;
  serieReview?: mangaSerieReviewitemObj;
};

/**
 * Manga ReadingItemObj
 */
interface mangaReadingItemObj {
  record: {
    series: {
      id: number;
      url: string;
      title: string;
    };
    list_id: number;
    status: {
      volume: number;
      chapter: number;
    };
  };
  metadata: {
    series: {
      latest_chapter: number;
    };
    user_rating: number;
  };
};

/**
 * Manga ReviewItemObj
 */
interface mangaReviewItemObj {
  titleMatch: ENUM_MANGAUPDATES_TITLE_MATCH_VALUES;
  title: string;
  normalized: string;
  directory: string;
  key: string;
};

/**
 * Manga  serieReviewItem
 */
interface mangaSerieReviewitemObj {
  id: number;
  title: string;
  normalizedTitle: string;
  associatedTitles: associatedTitleItem[],
  possibleDirectories: mangaReviewItemObj[];
  matchedSerie: mangaSerieDetail;
  readingItem: mangaupdatesReadingList;
  timestamp: string;
};

interface associatedTitleItem {
  title: string,
  key?: string
}

