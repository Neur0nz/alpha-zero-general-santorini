export function buildMatchJoinLink(joinKey: string, options: { baseUrl?: string; tab?: string } = {}): string {
  if (!joinKey) {
    return '';
  }

  const tab = options.tab ?? 'lobby';
  const baseUrl = options.baseUrl ?? (typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}`
    : '');

  if (!baseUrl) {
    return `?join=${encodeURIComponent(joinKey)}#${tab}`;
  }

  try {
    const url = new URL(baseUrl);
    url.search = '';
    url.searchParams.set('join', joinKey);
    url.hash = tab;
    return url.toString();
  } catch (error) {
    console.error('Failed to build join link', error);
    return `${baseUrl}?join=${encodeURIComponent(joinKey)}#${tab}`;
  }
}
