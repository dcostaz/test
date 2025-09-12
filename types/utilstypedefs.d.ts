// Static side of the class
interface UtilsConstructor {
  CHAPTERREGEX: RegExp;
  kebabToCamel: (str: string, capitalizeFirst?: boolean) => string;
  cloneShallow<T extends Record<string, unknown>>(obj: T): T;
  cloneDeep<T extends Record<string, unknown>>(obj: T): T;
  folderNameToSlug: (title: string) => string;
  normalizeText: (title: string) => string;
  sanitizedFolderName: (title: string) => string;
  getAdditionalProperties<T extends Record<string, unknown>, U extends Record<string, unknown>>(fields: string[], fromObj: T, toObj?: U, options?: { clone?: 'shallow' | 'deep' }): Record<string, unknown>;
  serieDetailObj<T extends Record<string, unknown>>(obj: T): mangaSerieDetail;
  wait: (ms: number) => Promise<void>;
  getClassMethodNames: (obj: Object) => string[];
  normalizeError: (error: unknown) => Error;
  parseBoolean: (value: unknown) => boolean;
  safeJsonParse: (input: string, field: string) => Record<string, unknown>;
}