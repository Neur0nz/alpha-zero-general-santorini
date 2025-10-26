const adjectives = [
  'Agile',
  'Brave',
  'Clever',
  'Daring',
  'Epic',
  'Fearless',
  'Gallant',
  'Heroic',
  'Luminous',
  'Mighty',
  'Nimble',
  'Radiant',
  'Swift',
  'Valiant',
  'Whimsical',
];

const nouns = [
  'Architect',
  'Builder',
  'Champion',
  'Strategist',
  'Voyager',
  'Guardian',
  'Harbinger',
  'Navigator',
  'Pioneer',
  'Sentinel',
  'Tactician',
  'Trailblazer',
  'Warden',
  'Wayfarer',
  'Wright',
];

function sanitizeSeed(seed: string): string {
  return seed
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 12);
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function generateDisplayName(seed?: string): string {
  const randomNumber = Math.floor(100 + Math.random() * 900);
  if (seed) {
    const sanitized = sanitizeSeed(seed);
    if (sanitized.length >= 3) {
      return `${capitalize(sanitized)}${randomNumber}`;
    }
  }

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective}${noun}${randomNumber}`;
}

export function validateDisplayName(value: string): string | null {
  const normalized = value.trim();
  if (normalized.length < 3) {
    return 'Display name must be at least 3 characters long.';
  }
  if (normalized.length > 24) {
    return 'Display name must be 24 characters or fewer.';
  }
  if (!/^[A-Za-z0-9 _-]+$/.test(normalized)) {
    return 'Display name may only contain letters, numbers, spaces, hyphens, and underscores.';
  }
  return null;
}
