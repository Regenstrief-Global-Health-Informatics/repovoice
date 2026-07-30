type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** iPhone / iPad — including iPadOS desktop UA */
export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  if (
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }
  return false;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isBrowserSpeechSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export type LiveTranscriptHandlers = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
  lang?: string;
};

/**
 * Live browser dictation (incl. iOS webkitSpeechRecognition).
 * On iOS this is a second capture path alongside MediaRecorder —
 * start/stop must always abort this session so the system mic clears.
 */
export class LiveSpeechSession {
  private recognition: SpeechRecognitionLike | null = null;
  private stopped = false;
  private finals: string[] = [];

  constructor(private handlers: LiveTranscriptHandlers) {}

  start() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.handlers.onError?.(
        "Live browser transcription is not supported in this browser. Use Grok or Whisper instead.",
      );
      return;
    }

    this.stopped = false;
    this.finals = [];
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = this.handlers.lang ?? "en-US";

    recognition.onresult = (event) => {
      if (this.stopped) return;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const piece = result[0]?.transcript ?? "";
        if (result.isFinal) {
          this.finals.push(piece.trim());
          this.handlers.onFinal?.(this.finals.filter(Boolean).join(" "));
        } else {
          interim += piece;
        }
      }
      const combined = [this.finals.filter(Boolean).join(" "), interim.trim()]
        .filter(Boolean)
        .join(" ");
      this.handlers.onPartial?.(combined);
    };

    recognition.onerror = (event) => {
      if (this.stopped) return;
      if (event.error === "aborted" || event.error === "no-speech") return;
      this.handlers.onError?.(
        event.error === "not-allowed"
          ? "Microphone permission denied for speech recognition."
          : `Speech recognition error: ${event.error}`,
      );
    };

    recognition.onend = () => {
      // Only auto-restart while still intentionally recording
      if (!this.stopped && this.recognition === recognition) {
        try {
          recognition.start();
          return;
        } catch {
          // ignore restart races
        }
      }
      this.handlers.onEnd?.();
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch (err) {
      this.handlers.onError?.(
        err instanceof Error
          ? err.message
          : "Could not start live dictation.",
      );
    }
  }

  /** Soft end — may still fire final results */
  stop() {
    this.shutdown("stop");
  }

  /** Hard end — no restart; releases system speech capture immediately */
  abort() {
    this.shutdown("abort");
  }

  private shutdown(mode: "stop" | "abort") {
    this.stopped = true;
    const rec = this.recognition;
    this.recognition = null;
    if (!rec) return;

    // Detach handlers first so onend cannot restart
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;

    try {
      if (mode === "abort") rec.abort();
      else rec.stop();
    } catch {
      try {
        rec.abort();
      } catch {
        // ignore
      }
    }

    // iOS sometimes needs a second tick to drop the dictation mic
    if (isIOSDevice()) {
      try {
        rec.abort();
      } catch {
        // ignore
      }
    }
  }

  getFinalText() {
    return this.finals.filter(Boolean).join(" ").trim();
  }
}
