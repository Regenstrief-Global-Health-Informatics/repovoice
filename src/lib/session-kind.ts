/** What kind of take is being recorded in Studio */
export type SessionKind = "interview" | "reflection";

export const SESSION_KINDS: {
  id: SessionKind;
  label: string;
  shortLabel: string;
  description: string;
  /** Shown under the transcript field */
  transcriptHint: string;
  /** Filename segment after person slug */
  fileTag: string;
  /**
   * Prefer speaker diarization in cloud STT.
   * Both kinds can be multi-party (interviewee dialogue, or two interviewers debriefing).
   */
  diarize: boolean;
}[] = [
  {
    id: "interview",
    label: "Interview",
    shortLabel: "Interview",
    description: "Talking with the person — questions & answers",
    transcriptHint:
      "Dialogue with the person. Grok STT uses speaker diarization when available.",
    fileTag: "interview",
    diarize: true,
  },
  {
    id: "reflection",
    label: "Reflection",
    shortLabel: "Reflection",
    description: "Debrief after — solo or between interviewers",
    transcriptHint:
      "Debrief notes. Diarization stays on so two interviewers are labeled when Grok can separate them.",
    fileTag: "reflection",
    diarize: true,
  },
];

export function sessionKindMeta(kind: SessionKind | undefined) {
  return SESSION_KINDS.find((k) => k.id === kind) ?? SESSION_KINDS[0]!;
}

export function defaultTitleForKind(
  kind: SessionKind,
  personName: string | undefined,
  date = new Date(),
) {
  const when = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const who = personName?.trim();
  if (kind === "reflection") {
    return who ? `${who} · reflection · ${when}` : `Reflection · ${when}`;
  }
  return who ? `${who} · interview · ${when}` : `Interview · ${when}`;
}
