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

export function useSpeechRecognition({
  onResult,
  onError,
}: {
  onResult: (transcript: string) => void;
  onError?: (message: string) => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;

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
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
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
    recognition.onend = () => setIsListening(false);
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
