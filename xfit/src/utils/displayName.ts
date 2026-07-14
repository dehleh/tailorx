const KNOWN_FIRST_NAME_PREFIXES = [
  'bamidele',
  'oluwaseun',
  'oluwatobi',
  'olamide',
  'temitope',
  'adeola',
  'chinedu',
  'fatima',
  'aisha',
];

const toTitleCase = (value: string): string =>
  value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : '';

export function deriveDisplayNameFromEmail(email?: string | null): string {
  if (!email) return '';

  const localPart = email.split('@')[0]?.trim().toLowerCase() || '';
  const withoutDigits = localPart.replace(/\d+/g, ' ');
  const firstSegment = withoutDigits.split(/[._\-\s]+/).find(Boolean) || '';

  const knownPrefix = KNOWN_FIRST_NAME_PREFIXES.find(
    (prefix) => firstSegment === prefix || firstSegment.startsWith(prefix)
  );

  return toTitleCase(knownPrefix || firstSegment);
}

export function getDisplayName(
  displayName?: string | null,
  email?: string | null,
  fallback = 'User'
): string {
  const cleaned = displayName?.trim() || '';
  const isGeneric = ['user', 'set up profile'].includes(cleaned.toLowerCase());
  return !isGeneric && cleaned ? cleaned : deriveDisplayNameFromEmail(email) || fallback;
}
