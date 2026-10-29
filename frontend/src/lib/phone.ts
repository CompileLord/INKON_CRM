const GROUPS_BY_COUNTRY_CODE: Readonly<Record<string, readonly number[]>> = {
  "992": [2, 3, 4],
  "998": [2, 3, 2, 2],
  "7": [3, 3, 2, 2],
  "1": [3, 3, 4],
};

const CANONICAL_PHONE_PATTERN: RegExp = /^\+([1-9][0-9]{1,14})$/;

export function formatPhoneDisplay(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  const digits: string | undefined = CANONICAL_PHONE_PATTERN.exec(value)?.[1] ?? (/^[1-9][0-9]{1,14}$/.test(value) ? value : undefined);
  if (digits === undefined) return value;
  const countryCode: string | undefined = Object.keys(GROUPS_BY_COUNTRY_CODE)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => digits.startsWith(candidate));
  if (countryCode === undefined) return `+${digits}`;
  const groups: readonly number[] = GROUPS_BY_COUNTRY_CODE[countryCode];
  const subscriber: string = digits.slice(countryCode.length);
  if (subscriber.length !== groups.reduce((sum, size) => sum + size, 0)) return `+${digits}`;
  const parts: string[] = [];
  let offset: number = 0;
  for (const size of groups) {
    parts.push(subscriber.slice(offset, offset + size));
    offset += size;
  }
  return `+${countryCode} ${parts.join(" ")}`;
}

export const DEFAULT_PHONE_PREFIX: string = "+992";

const LOCAL_TAJIK_NUMBER_PATTERN: RegExp = /^[0-9]{9}$/;

export function withDefaultCountryCode(value: string): string {
  const compact: string = value.trim().replace(/[\s()-]/g, "");
  return LOCAL_TAJIK_NUMBER_PATTERN.test(compact) ? `${DEFAULT_PHONE_PREFIX}${compact}` : value.trim();
}
