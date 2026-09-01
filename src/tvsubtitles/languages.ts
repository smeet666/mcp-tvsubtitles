/**
 * The site's own two-letter language codes, and what each one means.
 *
 * The site draws a flag per language and addresses each by a code it chose for
 * itself. Six of the twenty-four differ from ISO 639-1, and one of those is the
 * reason this table is written by hand rather than derived: the site writes `br`
 * for Brazilian Portuguese, which ISO assigns to Breton. Deriving a code would
 * rename the language, and a caller filtering on it would be handed a different
 * one than the one they asked for.
 *
 * `code` holds the BCP 47 tag where it is certain, and null where it is not.
 * The site's own code always travels beside it under its own name, so nothing
 * is lost when the mapping declines to guess.
 */

export interface Language {
  /** The code the site addresses this language by, used to build an address. */
  siteCode: string;
  /** The name the site prints. */
  name: string;
  /** BCP 47, where the mapping is certain. */
  code: string | null;
}

export const LANGUAGES: readonly Language[] = [
  { siteCode: "en", name: "english", code: "en" },
  { siteCode: "es", name: "spanish", code: "es" },
  { siteCode: "fr", name: "french", code: "fr" },
  { siteCode: "de", name: "german", code: "de" },
  { siteCode: "br", name: "portuguese(br)", code: "pt-BR" },
  { siteCode: "ru", name: "russian", code: "ru" },
  { siteCode: "ua", name: "ukrainian", code: "uk" },
  { siteCode: "it", name: "italian", code: "it" },
  { siteCode: "gr", name: "greek", code: "el" },
  { siteCode: "ar", name: "arabic", code: "ar" },
  { siteCode: "hu", name: "hungarian", code: "hu" },
  { siteCode: "pl", name: "polish", code: "pl" },
  { siteCode: "tr", name: "turkish", code: "tr" },
  { siteCode: "nl", name: "dutch", code: "nl" },
  { siteCode: "pt", name: "portuguese", code: "pt" },
  { siteCode: "sv", name: "swedish", code: "sv" },
  { siteCode: "da", name: "danish", code: "da" },
  { siteCode: "fi", name: "finnish", code: "fi" },
  { siteCode: "ko", name: "korean", code: "ko" },
  // The site draws one Chinese flag and names the language without saying which
  // script the file uses, so the tag stops at the language.
  { siteCode: "cn", name: "chinese", code: "zh" },
  { siteCode: "jp", name: "japanese", code: "ja" },
  { siteCode: "bg", name: "bulgarian", code: "bg" },
  { siteCode: "cz", name: "czech", code: "cs" },
  { siteCode: "ro", name: "romanian", code: "ro" },
];

const BY_SITE_CODE = new Map(LANGUAGES.map((language) => [language.siteCode, language]));
const BY_NAME = new Map(LANGUAGES.map((language) => [language.name, language]));

/** The language a site code addresses, or undefined for a code it never draws. */
export const languageBySiteCode = (siteCode: string): Language | undefined =>
  BY_SITE_CODE.get(siteCode.toLowerCase());

/**
 * The language a caller named, read three ways.
 *
 * The site's own name, the site's own code, and the BCP 47 tag, because a
 * caller holding a tag from somewhere else should not have to learn this site's
 * spelling to ask a question. Anything else is left unresolved, so the tool
 * that called this refuses rather than searching for a language nobody named.
 */
export function resolveLanguage(named: string): Language | undefined {
  const wanted = named.trim().toLowerCase();
  if (wanted === "") {
    return undefined;
  }
  return (
    BY_NAME.get(wanted) ??
    BY_SITE_CODE.get(wanted) ??
    LANGUAGES.find((language) => language.code?.toLowerCase() === wanted)
  );
}

/** Every name a caller may pass, for the message a refusal carries. */
export const languageNames = (): string[] => LANGUAGES.map((language) => language.name);
