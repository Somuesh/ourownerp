import { useCallback } from "react";

/** Thin wrapper around the browser's built-in text-to-speech — no API
 * or dependency needed. Supported in essentially all modern browsers. */
export function useSpeechSynthesis() {
  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !text) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
    },
    [isSupported],
  );

  const stop = useCallback(() => {
    if (isSupported) window.speechSynthesis.cancel();
  }, [isSupported]);

  return { isSupported, speak, stop };
}
