/**
 * Cloud STT HTTP calls. Shared by:
 * - TanStack `createServerFn` handlers (hosted web / Nitro)
 * - The Capacitor iOS shell, where there is no Start server
 *
 * API keys are already on the device (Settings). Native fetch uses
 * CapacitorHttp so WKWebView is not blocked by browser CORS.
 */

export const STT_TIMEOUT_MS = 90_000;

export type CloudSttInput = {
  audioBase64: string;
  mimeType: string;
  filename: string;
  apiKey: string;
  language?: string;
  diarize?: boolean;
};

export type CloudSttResult = {
  text: string;
  language?: string;
  duration?: number;
  source: "grok" | "whisper";
};

function audioBlobFromBase64(audioBase64: string, mimeType: string): Blob {
  const binary =
    typeof Buffer !== "undefined"
      ? Buffer.from(audioBase64, "base64")
      : Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
  const ab = new ArrayBuffer(binary.byteLength);
  new Uint8Array(ab).set(binary);
  return new Blob([ab], { type: mimeType });
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms = STT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Transcription timed out after ${Math.round(ms / 1000)}s. Try again or use a shorter clip.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function formatDiarizedText(json: {
  text?: string;
  transcript?: string;
  utterances?: Array<{ speaker?: string | number; text?: string }>;
  words?: Array<{ text?: string; speaker?: string | number }>;
}): string {
  if (json.utterances?.length) {
    return json.utterances
      .map((u) => {
        const sp =
          u.speaker !== undefined && u.speaker !== null
            ? `**Speaker ${u.speaker}:** `
            : "";
        return `${sp}${(u.text ?? "").trim()}`.trim();
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return (json.text ?? json.transcript ?? "").trim();
}

/** OpenAI Whisper — post-recording transcription */
export async function transcribeWithWhisperHttp(
  input: CloudSttInput,
): Promise<CloudSttResult> {
  const { audioBase64, mimeType, filename, apiKey, language } = input;

  const form = new FormData();
  form.append(
    "file",
    audioBlobFromBase64(audioBase64, mimeType),
    filename || "recording.webm",
  );
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  if (language?.trim()) {
    form.append("language", language.trim());
  }

  const res = await fetchWithTimeout(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Whisper API failed (${res.status}): ${errText.slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as {
    text?: string;
    language?: string;
    duration?: number;
  };

  return {
    text: (json.text ?? "").trim(),
    language: json.language,
    duration: json.duration,
    source: "whisper",
  };
}

/**
 * Grok Speech-to-Text (xAI)
 * POST https://api.x.ai/v1/stt
 * Note: when format=true, language is required by the API.
 */
export async function transcribeWithGrokHttp(
  input: CloudSttInput,
): Promise<CloudSttResult> {
  const { audioBase64, mimeType, filename, apiKey, language, diarize } = input;

  // Default en — required whenever we enable formatted / diarized output
  const lang = (language?.trim() || "en").slice(0, 16);

  const form = new FormData();
  form.append("model", "grok-stt");
  form.append("language", lang);

  if (diarize) {
    form.append("diarize", "true");
    // format=true needs language (above) — API 400 without it
    form.append("format", "true");
  }

  // file must be last in multipart per xAI guidance
  form.append(
    "file",
    audioBlobFromBase64(audioBase64, mimeType),
    filename || "recording.webm",
  );

  const res = await fetchWithTimeout("https://api.x.ai/v1/stt", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Grok STT failed (${res.status}): ${errText.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    text?: string;
    transcript?: string;
    language?: string;
    duration?: number;
    utterances?: Array<{ speaker?: string | number; text?: string }>;
  };

  return {
    text: formatDiarizedText(json),
    language: json.language ?? lang,
    duration: json.duration,
    source: "grok",
  };
}
