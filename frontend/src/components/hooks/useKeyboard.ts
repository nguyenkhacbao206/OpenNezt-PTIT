/**
 * useKeyboard — tracks keyboard visibility and height so screens can adjust
 * their layout (e.g. lift a submit button above the keyboard).
 */

import { useEffect, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';

interface KeyboardState {
  isVisible: boolean;
  height: number;
}

export function useKeyboard(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({ isVisible: false, height: 0 });

  useEffect(() => {
    // iOS fires the "Will" events; Android only reliably fires the "Did" ones.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: KeyboardEvent) =>
      setState({ isVisible: true, height: e.endCoordinates.height });
    const onHide = () => setState({ isVisible: false, height: 0 });

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return state;
}
