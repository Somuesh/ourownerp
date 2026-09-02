import { useCallback, useEffect, useRef, useState } from "react";

// The Web Speech API isn't in TypeScript's standard DOM lib — minimal
// shape of just what this app uses. Supported in Chrome/Edge (and other
// Chromium browsers); not in Firefox, and only partially in Safari. The
// voice assistant UI falls back to a text input when unsupported.
interface SpeechRecognitionResultLike {
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

// Deliberately single-shot mode (continuous=false, interimResults=false) —
// this is what the browser's own end-of-speech detection handles fastest
// and most reliably. An earlier attempt to speed this up further with
// continuous+interimResults mode and a manual silence timer made things
// slower/less predictable instead, since continuous mode doesn't fire
// results/end events the same reliable way single-shot mode does — reverted.
export function useSpeechRecognition({
  lang,
  onResult,
  onError,
  onEnd,
}: {
  /** BCP-47 language tag, e.g. "en-US", "hi-IN". Recognition quality for
   * non-English languages — and for language mixing within one sentence —
   * depends entirely on what the browser/OS speech engine supports. */
  lang: string;
  onResult: (transcript: string) => void;
  onError?: (message: string) => void;
  /** Fires when recognition stops WITHOUT having produced a result (silence,
   * no speech detected, permission issue, etc.) — lets the caller reset its
   * own "listening" UI state, which otherwise stays stuck forever since
   * onresult never fires to do it for them. */
  onEnd?: () => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const onEndRef = useRef(onEnd);
  const gotResultRef = useRef(false);
  const langRef = useRef(lang);
  onResultRef.current = onResult;
  onErrorRef.current = onError;
  onEndRef.current = onEnd;
  langRef.current = lang;

  const Ctor =
    typeof window !== "undefined" ? (window.SpeechRecognition ?? window.webkitSpeechRecognition) : undefined;
  const isSupported = !!Ctor;

  const start = useCallback(() => {
    if (!Ctor) {
      onErrorRef.current?.(
        "Voice input isn't supported in this browser. Try Chrome or Edge, or type your command instead.",
      );
      return;
    }
    gotResultRef.current = false;
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = langRef.current;
    recognition.onresult = (event) => {
      gotResultRef.current = true;
      const parts: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        parts.push(event.results[i][0].transcript);
      }
      onResultRef.current(parts.join(" ").trim());
    };
    recognition.onerror = (event) => {
      onErrorRef.current?.(`Voice input error: ${event.error}`);
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
      if (!gotResultRef.current) onEndRef.current?.();
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [Ctor]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return { isSupported, isListening, start, stop };
}
