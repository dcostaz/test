// enums.d.ts

// Enum for settings type
type SettingType = 'manga-list' | 'mangaupdates';

// List identifiers for MangaUpdates lists
type MangaupdatesReadinglistType = 0 | 1 | 2 | 3 | 4;

// Enum for mangaupdatesTitleMatch values
type MangaupdatesTitleMatch =
  | 'tn'
  | 'tm'
  | 'ts'
  | 'ta'
  | 'tz'
  | 'tr';

// Enum for getReadingListSerieDetail status
type GetReadinglistSeriedetailStatus =
  | 'success'
  | 'skipped'
  | 'in_review'
  | 'for_review'
  | 'no_details'
  | 'failed_get'
  | 'error';

interface ENUM_SETTINGS_TYPE {
  MANGALIST: 'manga-list';
  MANGAUPDATES: 'mangaupdates';
}

interface ENUM_MANGAUPDATES_READINGLIST_TYPE {
  READINGLIST: 0;
  WISHLIST: 1;
  COMPLETELIST: 2;
  UNFINISHEDLIST: 3;
  ONHOLDLIST: 4;
}

interface ENUM_MANGAUPDATES_TITLE_MATCH {
  TITLE_NO_MATCH: 'tn';
  TITLE_MATCH: 'tm';
  TITLE_SIMILAR: 'ts';
  ASSOCIATED_TITLE: 'ta';
  ASSOCIATED_TITLE_SIMILAR: 'tz';
  TITLE_MATCH_REVIEW: 'tr';
}

interface ENUM_GET_READINGLIST_SERIEDETAIL_STATUS {
  SUCCESS: 'success';
  SKIPPED: 'skipped';
  IN_REVIEW: 'in_review';
  FOR_REVIEW: 'for_review';
  NO_DETAILS: 'no_details';
  FAILED_GET: 'failed_get';
  ERROR: 'error';
}

interface EnumsConstructor {
  new(): EnumsInstance;
  SETTINGS_TYPE: Readonly<ENUM_SETTINGS_TYPE>;
  MANGAUPDATES_READINGLIST_TYPE: Readonly<ENUM_MANGAUPDATES_READINGLIST_TYPE>;
  MANGAUPDATES_TITLE_MATCH: Readonly<ENUM_MANGAUPDATES_TITLE_MATCH>;
  GET_READINGLIST_SERIEDETAIL_STATUS: Readonly<ENUM_GET_READINGLIST_SERIEDETAIL_STATUS>;
  MANGALIST_CHANNEL: Readonly<ENUM_MANGA_LIST_CHANNEL>;
}

interface EnumsInstance { } // Empty since the class has no instance members

declare const Enums: EnumsConstructor;
