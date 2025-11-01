const SESSION_STORAGE_ERROR_MESSAGE = 'Session storage is not available.';

export const PENDING_JOIN_STORAGE_KEY = 'santorini:pendingJoin';
export const AUTO_OPEN_CREATE_STORAGE_KEY = 'santorini:autoOpenCreate';

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch (error) {
    console.error(SESSION_STORAGE_ERROR_MESSAGE, error);
    return null;
  }
}

export function scheduleAutoOpenCreate(): void {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.setItem(AUTO_OPEN_CREATE_STORAGE_KEY, 'true');
}

export function consumeAutoOpenCreateFlag(): boolean {
  const storage = getSessionStorage();
  if (!storage) return false;
  const value = storage.getItem(AUTO_OPEN_CREATE_STORAGE_KEY);
  if (value) {
    storage.removeItem(AUTO_OPEN_CREATE_STORAGE_KEY);
    return true;
  }
  return false;
}
