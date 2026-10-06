import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * A function whose identity never changes but which always calls the latest
 * `callback`. The shared Modal re-runs its focus effect whenever `onCancel`
 * changes, so passing it an inline arrow moves focus to the hidden Close
 * button on every keystroke; this keeps focus where the user is typing.
 */
export function useStableCallback<Args extends unknown[]>(callback: (...args: Args) => void) {
  const latest = useRef(callback);
  useLayoutEffect(() => {
    latest.current = callback;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
