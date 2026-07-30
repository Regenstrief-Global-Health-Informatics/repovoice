export type RecorderSnapshot = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  extension: string;
};

function isLikelyIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return (
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  );
}

function pickMimeType(): string {
  const candidates = isLikelyIOS()
    ? [
        "audio/mp4",
        "audio/aac",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ]
    : [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
  for (const type of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(type)
    ) {
      return type;
    }
  }
  return "";
}

export function extensionForMime(mimeType: string): string {
  if (
    mimeType.includes("mp4") ||
    mimeType.includes("m4a") ||
    mimeType.includes("aac")
  ) {
    return "m4a";
  }
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  return "webm";
}

function hardStopTracks(stream: MediaStream | null | undefined) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.enabled = false;
      track.stop();
    } catch {
      // ignore
    }
  }
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private mimeType = "";
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private rafId = 0;

  async start(onLevel?: (level: number) => void) {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      throw new Error("Microphone access is not available in this environment.");
    }

    // Always release anything left over before opening the mic again
    this.cleanup();

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    this.mimeType = pickMimeType();
    this.chunks = [];
    this.mediaRecorder = this.mimeType
      ? new MediaRecorder(this.stream, { mimeType: this.mimeType })
      : new MediaRecorder(this.stream);
    this.mimeType = this.mediaRecorder.mimeType || this.mimeType || "audio/webm";

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };

    this.startedAt = performance.now();
    this.mediaRecorder.start(250);

    if (onLevel) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctx) {
        this.audioContext = new Ctx();
        if (this.audioContext.state === "suspended") {
          void this.audioContext.resume();
        }
        this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.sourceNode.connect(this.analyser);
        const data = new Uint8Array(this.analyser.frequencyBinCount);

        const tick = () => {
          if (!this.analyser) return;
          this.analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i]! - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          onLevel(Math.min(1, rms * 3.2));
          this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
      }
    }
  }

  async stop(): Promise<RecorderSnapshot> {
    const recorder = this.mediaRecorder;
    if (!recorder) {
      this.cleanup();
      throw new Error("Recorder is not running.");
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      const finish = () => {
        resolve(new Blob(this.chunks, { type: this.mimeType || "audio/webm" }));
      };
      recorder.onstop = () => finish();
      recorder.onerror = () => reject(new Error("Recording failed."));
      try {
        if (recorder.state !== "inactive") {
          // Request final chunk, then stop
          try {
            recorder.requestData();
          } catch {
            // not all browsers support requestData mid-record
          }
          recorder.stop();
        } else {
          finish();
        }
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Recording failed."));
      }
    });

    const durationMs = Math.max(0, performance.now() - this.startedAt);
    // Hard-release mic tracks so iOS status bar indicator turns off with stop
    this.cleanup();

    return {
      blob,
      mimeType: blob.type || this.mimeType || "audio/webm",
      durationMs,
      extension: extensionForMime(blob.type || this.mimeType),
    };
  }

  /** Immediate teardown without producing a blob (cancel / unmount) */
  cancel() {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.onstop = null;
        this.mediaRecorder.onerror = null;
        this.mediaRecorder.stop();
      }
    } catch {
      // ignore
    }
    this.cleanup();
  }

  /** True if a stream or MediaRecorder is still held */
  isActive() {
    return Boolean(
      this.mediaRecorder && this.mediaRecorder.state !== "inactive",
    ) || Boolean(this.stream?.getTracks().some((t) => t.readyState === "live"));
  }

  private cleanup() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;

    try {
      this.sourceNode?.disconnect();
    } catch {
      // ignore
    }
    this.sourceNode = null;
    this.analyser = null;

    if (this.audioContext) {
      try {
        void this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = null;
    }

    // Stop MediaRecorder first (if still going), then kill tracks hard
    if (this.mediaRecorder) {
      try {
        this.mediaRecorder.ondataavailable = null;
        this.mediaRecorder.onstop = null;
        this.mediaRecorder.onerror = null;
        if (this.mediaRecorder.state !== "inactive") {
          this.mediaRecorder.stop();
        }
      } catch {
        // ignore
      }
      this.mediaRecorder = null;
    }

    hardStopTracks(this.stream);
    this.stream = null;
    this.chunks = [];
  }
}
