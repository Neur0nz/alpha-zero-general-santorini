import { useCallback, useMemo, useRef, useState } from 'react';

type NotificationPermissionState = NotificationPermission | 'unsupported';

export interface BrowserNotificationOptions extends NotificationOptions {
  id?: string;
}

export interface UseBrowserNotificationsResult {
  permission: NotificationPermissionState;
  isSupported: boolean;
  requestPermission: () => Promise<NotificationPermissionState>;
  showNotification: (title: string, options?: BrowserNotificationOptions) => void;
}

const hasNotificationSupport = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

export function useBrowserNotifications(): UseBrowserNotificationsResult {
  const isSupported = useMemo(() => hasNotificationSupport(), []);
  const [permission, setPermission] = useState<NotificationPermissionState>(() => {
    if (!isSupported) {
      return 'unsupported';
    }
    return Notification.permission;
  });
  const lastNotificationIdRef = useRef<string | null>(null);

  const requestPermission = useCallback(async (): Promise<NotificationPermissionState> => {
    if (!isSupported) {
      return 'unsupported';
    }
    if (permission !== 'default') {
      return permission;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch (error) {
      console.warn('Notification permission request failed', error);
      setPermission('denied');
      return 'denied';
    }
  }, [isSupported, permission]);

  const showNotification = useCallback(
    (title: string, options?: BrowserNotificationOptions) => {
      if (!isSupported) {
        return;
      }
      if (permission !== 'granted') {
        return;
      }
      try {
        const tag = options?.id;
        const idChanged = Boolean(tag && lastNotificationIdRef.current !== tag);
        if (!tag || idChanged) {
          lastNotificationIdRef.current = tag ?? null;
          const notification = new Notification(title, options);
          notification.onclick = () => {
            try {
              window.focus();
            } catch (focusError) {
              console.warn('Unable to focus window from notification click', focusError);
            }
            notification.close();
          };
        }
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.(50);
        }
      } catch (error) {
        console.error('Failed to show notification', error);
      }
    },
    [isSupported, permission],
  );

  return {
    permission,
    isSupported,
    requestPermission,
    showNotification,
  };
}

