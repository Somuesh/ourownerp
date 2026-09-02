import { useCallback, useEffect, useState } from "react";

/** Prefer voices that sound less like the flat default TTS voice most
 * browsers ship. Not every OS/browser exposes these, but when it does
 * (Chrome on most platforms, for instance) it's a meaningfully better
 * "natural" voice, especially outside English where the plain default
 * voice is often the most robotic-sounding option available. */
const QUALITY_HINTS = ["neural", "natural", "online", "google", "premium"];

function scoreVoice(voice: SpeechSynthesisVoice, langPrefix: string): number {
  let score = 0;
  if (voice.lang.toLowerCase().startsWith(langPrefix)) score += 10;
  const name = voice.name.toLowerCase();
  if (QUALITY_HINTS.some((hint) => name.includes(hint))) score += 5;
  if (voice.localService === false) score += 1; // network voices are usually higher quality
  return score;
}

/** Thin wrapper around the browser's built-in text-to-speech — no API or
 * dependency needed, but quality depends entirely on which voices the
 * OS/browser has installed. Exposes the installed voice list so the UI can
 * offer a manual picker, since auto-selection can't always find a good
 * match (especially for languages with few installed voices). */
export function useSpeechSynthesis() {
  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!isSupported) return;
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    // Voice lists load asynchronously in most browsers — this fires once
    // they're actually available, which is often after the first call.
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [isSupported]);

  const speak = useCallback(
    (text: string, options?: { lang?: string; voiceURI?: string }) => {
      if (!isSupported || !text) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;

      const manualVoice = options?.voiceURI
        ? voices.find((v) => v.voiceURI === options.voiceURI)
        : undefined;
      const langPrefix = (options?.lang ?? "en").split("-")[0].toLowerCase();
      const bestAutoVoice = voices.length
        ? [...voices].sort((a, b) => scoreVoice(b, langPrefix) - scoreVoice(a, langPrefix))[0]
        : undefined;
      const chosenVoice = manualVoice ?? bestAutoVoice;

      if (chosenVoice) utterance.voice = chosenVoice;
      utterance.lang = chosenVoice?.lang ?? options?.lang ?? "en-US";
      window.speechSynthesis.speak(utterance);
    },
    [isSupported, voices],
  );

  const stop = useCallback(() => {
    if (isSupported) window.speechSynthesis.cancel();
  }, [isSupported]);

  return { isSupported, voices, speak, stop };
}
