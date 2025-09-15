// types/hakunekotypedefs.d.ts

interface HakunekoParameters {
  db: Low;
  settings: HakunekoSettings;
};

declare interface HakunekoClass {
  db: Low<any>;
  settings: HakunekoSettings;

  rebuildHakuneko(): Promise<void>;
  rebuildHakunekoImages(): Promise<void>;
  sortHakunekoBookmarks(): Promise<void>;
}

declare interface HakunekoConstructor {
  new (args: HakunekoParameters): HakunekoClass;

  init(settings: SettingsClass): Promise<HakunekoClass>;
  getHakunekoBookmarks(bookmarksPathName: string): Promise<Bookmark[]>;
  getHakunekoChaptermarks(chapterMarksPathName: string): Promise<ChapterMark[]>;
}

interface HakunekoSettings {
  mangalist: SettingsMangaList;
  redis: SettingsRedis;
  hakuneko: SettingsHakuneko;
  mangaupdates: SettingsMangaUpdates;
}

interface HakunekoEntry extends objectBase {
  hkey: string;
  hmanga: string;
  hconnector: string;
  hconnectorDescription: string;
  hfolder: string;
  himageAvailable: boolean;
  hlastchapter: number;
  hchapter: number;
  hlastModified: string;
};

interface Bookmark {
  key: {
    manga: string;
    connector: string;
  };
  title: {
    manga: string;
    connector: string;
  };
};

interface ChapterMark {
  mangaID: string;
  connectorID: string;
  chapterID: string;
  chapterTitle: string;
};

interface MangaImage {
  name: string;
}

interface HakunekoDBDefaults extends DBDefaultData {
  hakuneko: HakunekoEntry[];
  bookmarks: Bookmark[];
  chaptermarks: ChapterMark[];
  mangaimages: MangaImage[];
}