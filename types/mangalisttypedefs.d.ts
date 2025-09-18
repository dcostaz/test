// types/mangalisttypedefs.d.ts

// Placeholder interfaces for referenced types

interface MangaList {
  [key: string]: any;
}

interface MangaListParameters {
  db: Low<MangaListDBDefaults>;
  settings: Settings;
  mangaupdates?: MangaUpdatesClass;
}

interface MangaListClass {
  db: Low<MangaListDBDefaults>;
  settings: Settings;
  mangaupdates?: MangaUpdatesClass;

  getReadingList(refresh?: boolean): Promise<void>;
}

// Static side of the class
interface MangaListConstructor {
  new(args: MangaListParameters): MangaListClass;

  init(settings: SettingsClass, mangaupdates: MangaUpdatesClass): Promise<MangaListClass>;
}

/**
 * MangaUpdates settings if inferred from existing Settings interfaces
 * Merge of SettingdMangaUpdates, SettingsRedis and SettingsMangaList.database
 */
interface MangaListDBDefaults extends DBDefaultData {
  readinglist: MangaUpdatesReadingListSearchResultsEntry[];
}

