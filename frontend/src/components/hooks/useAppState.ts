/**
 * useAppState — exposes the current AppState and fires callbacks when the app
 * moves to the foreground/background (e.g. to refresh tokens or pause timers).
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

interface UseAppStateOptions {
  onForeground?: () => void;
  onBackground?: () => void;
}

export function useAppState(options: UseAppStateOptions = {}): AppStateStatus {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const previous = useRef<AppStateStatus>(AppState.currentState);

  // Keep the latest callbacks without re-subscribing on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = previous.current;
      if (prev.match(/inactive|background/) && next === 'active') {
        optionsRef.current.onForeground?.();
      } else if (prev === 'active' && next.match(/inactive|background/)) {
        optionsRef.current.onBackground?.();
      }
      previous.current = next;
      setAppState(next);
    });

    return () => sub.remove();
  }, []);

  return appState;
}
