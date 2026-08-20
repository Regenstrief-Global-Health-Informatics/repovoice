import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  transcribeWithGrokHttp,
  transcribeWithWhisperHttp,
} from "@/lib/transcribe-http";

const cloudInput = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().default("audio/webm"),
  filename: z.string().default("recording.webm"),
  apiKey: z.string().min(1),
  language: z.string().optional(),
  /** Speaker labels for multi-party interviews / reflections */
  diarize: z.boolean().optional(),
});

/** OpenAI Whisper — post-recording transcription (hosted web / Nitro) */
export const transcribeWithWhisper = createServerFn({ method: "POST" })
  .validator(cloudInput)
  .handler(async ({ data }) => transcribeWithWhisperHttp(data));

/**
 * Grok Speech-to-Text (xAI) via TanStack server function.
 * The iOS shell calls `transcribeWithGrokHttp` instead — no Start server there.
 */
export const transcribeWithGrok = createServerFn({ method: "POST" })
  .validator(cloudInput)
  .handler(async ({ data }) => transcribeWithGrokHttp(data));
