/**
 * A gate on usernames: slurs and crude words don't get to be someone's public
 * handle. It is deliberately blunt — it matches inside longer strings and
 * tolerates the usual letter-swapping and padding ("n1gg4", "a__s__s") — so it
 * will occasionally catch an innocent string. For a 3–20 character handle that
 * every other member can see, that trade is the right way round.
 *
 * The real check runs on the server (the signup route); the client imports the
 * same function only to warn before the round-trip.
 */

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "2": "z",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  $: "s",
  "!": "i",
  "|": "i",
  "£": "l",
};

/** Lower-case, fold leetspeak to letters, drop everything else. */
function normalize(input: string): string {
  return input
    .toLowerCase()
    .split("")
    .map((char) => LEET[char] ?? char)
    .join("")
    .replace(/[^a-z]/g, "");
}

/**
 * Blocked stems. Kept as roots so "asshole" and "asses" both fall out of
 * "ass"; ordered by nothing in particular. Not exhaustive, and not meant to
 * be — it covers the slurs and the common swear words a reasonable person
 * would not want printed next to their watchlist.
 */
const BLOCKED = [
  "nigg",
  "nigr",
  "negro",
  "coon",
  "chink",
  "spic",
  "kike",
  "gook",
  "wetback",
  "beaner",
  "raghead",
  "sandnigger",
  "faggot",
  "fagot",
  "fag",
  "dyke",
  "tranny",
  "retard",
  "retarted",
  "spastic",
  "midget",
  "cripple",
  "fuck",
  "fuk",
  "fuc",
  "shit",
  "shyt",
  "bullshit",
  "asshole",
  "asshat",
  "ass",
  "arse",
  "bitch",
  "biatch",
  "bastard",
  "cunt",
  "kunt",
  "dick",
  "dik",
  "cock",
  "cok",
  "pussy",
  "pusy",
  "twat",
  "wank",
  "whore",
  "hoe",
  "slut",
  "skank",
  "prick",
  "bollock",
  "wanker",
  "jerkoff",
  "jackoff",
  "cum",
  "jizz",
  "boner",
  "dildo",
  "blowjob",
  "handjob",
  "rimjob",
  "penis",
  "vagina",
  "anus",
  "rape",
  "rapist",
  "molest",
  "pedo",
  "paedo",
  "nazi",
  "hitler",
  "kkk",
  "nonce",
];

/**
 * A stem matches if its letters appear consecutively in the normalized text,
 * each letter allowed to repeat — so "asss" and "fuuuck" still land, and the
 * padding tricks were already flattened by `normalize`.
 */
const PATTERNS = BLOCKED.map(
  (stem) => new RegExp(stem.split("").map((letter) => `${letter}+`).join(""), "i"),
);

export function containsProfanity(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = normalize(text);
  if (!normalized) return false;
  return PATTERNS.some((pattern) => pattern.test(normalized));
}
