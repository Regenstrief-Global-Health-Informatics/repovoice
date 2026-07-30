import type { SessionKind } from "@/lib/session-kind";
import { sessionKindMeta } from "@/lib/session-kind";

export type GithubUploadInput = {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  contentBase64: string;
  message: string;
  token: string;
};

export type GithubUploadResult = {
  path: string;
  htmlUrl: string;
  sha: string;
};

export type GithubContentItem = {
  name: string;
  path: string;
  type: "file" | "dir" | string;
  sha?: string;
  size?: number;
  download_url?: string | null;
  html_url?: string | null;
};

export type PersonSlug = {
  slug: string;
  name: string;
  profilePath: string;
  kind: "file" | "dir";
  htmlUrl?: string;
};

async function githubRequest(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
}

function encodeRepoPath(path: string): string {
  return path
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

export async function getFileSha(params: {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  token: string;
}): Promise<string | undefined> {
  const { owner, repo, path, branch, token } = params;
  const res = await githubRequest(
    `/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`,
    token,
  );
  if (res.status === 404) return undefined;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub read failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { sha?: string };
  return json.sha;
}

export async function uploadFileToGithub(
  input: GithubUploadInput,
): Promise<GithubUploadResult> {
  const { owner, repo, branch, path, contentBase64, message, token } = input;
  const existingSha = await getFileSha({ owner, repo, path, branch, token });

  const res = await githubRequest(
    `/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}`,
    token,
    {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: contentBase64,
        branch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub upload failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as {
    content?: { path?: string; html_url?: string; sha?: string };
  };

  return {
    path: json.content?.path ?? path,
    htmlUrl: json.content?.html_url ?? "",
    sha: json.content?.sha ?? "",
  };
}

export async function listRepoContents(params: {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  token: string;
}): Promise<GithubContentItem[]> {
  const { owner, repo, path, branch, token } = params;
  const clean = path.replace(/^\/+|\/+$/g, "");
  const url = clean
    ? `/repos/${owner}/${repo}/contents/${encodeRepoPath(clean)}?ref=${encodeURIComponent(branch)}`
    : `/repos/${owner}/${repo}/contents?ref=${encodeURIComponent(branch)}`;
  const res = await githubRequest(url, token);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub list failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }
  const json = await res.json();
  if (!Array.isArray(json)) {
    throw new Error("Expected a directory listing from GitHub");
  }
  return json as GithubContentItem[];
}

export async function listRepoFolders(params: {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  maxDepth?: number;
}): Promise<string[]> {
  const { owner, repo, branch, token, maxDepth = 5 } = params;
  const res = await githubRequest(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    token,
  );
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 404) {
      throw new Error(
        `Could not read branch "${branch}" (${res.status}). Check the branch name and that the token can access this repo.`,
      );
    }
    throw new Error(
      `GitHub tree failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as {
    tree?: Array<{ path?: string; type?: string }>;
    truncated?: boolean;
  };
  const folders = new Set<string>();
  for (const node of json.tree ?? []) {
    if (node.type !== "tree" || !node.path) continue;
    const depth = node.path.split("/").length;
    if (depth <= maxDepth) folders.add(node.path);
  }
  return Array.from(folders).sort((a, b) => a.localeCompare(b));
}

export async function verifyGithubAccess(params: {
  owner: string;
  repo: string;
  token: string;
}): Promise<
  | {
      ok: true;
      fullName: string;
      private: boolean;
      defaultBranch: string;
    }
  | { ok: false; error: string }
> {
  const { owner, repo, token } = params;
  if (!owner.trim() || !repo.trim() || !token.trim()) {
    return { ok: false, error: "Owner, repo, and token are required." };
  }
  const res = await githubRequest(
    `/repos/${encodeURIComponent(owner.trim())}/${encodeURIComponent(repo.trim())}`,
    token.trim(),
  );
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 404) {
      return {
        ok: false,
        error:
          "Repo not found (404). For private repos this often means the token cannot see it (scopes or org SSO).",
      };
    }
    return {
      ok: false,
      error: `GitHub error (${res.status}): ${body.slice(0, 200)}`,
    };
  }
  const json = (await res.json()) as {
    full_name?: string;
    private?: boolean;
    default_branch?: string;
  };
  return {
    ok: true,
    fullName: json.full_name ?? `${owner}/${repo}`,
    private: Boolean(json.private),
    defaultBranch: json.default_branch ?? "main",
  };
}

export function titleFromSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function nameFromMarkdown(text: string, fallbackSlug: string): string {
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const block = fm[1] ?? "";
    const title =
      block.match(/^name:\s*["']?(.+?)["']?\s*$/m) ||
      block.match(/^title:\s*["']?(.+?)["']?\s*$/m);
    if (title?.[1]) return title[1].trim();
  }
  const h1 = text.match(/^#\s+(.+)$/m);
  if (h1?.[1]) return h1[1].trim();
  return titleFromSlug(fallbackSlug);
}

export async function listPeopleFromRepo(params: {
  owner: string;
  repo: string;
  peoplePath: string;
  branch: string;
  token: string;
}): Promise<PersonSlug[]> {
  const { owner, repo, peoplePath, branch, token } = params;
  const root = peoplePath.replace(/^\/+|\/+$/g, "") || "people";
  const items = await listRepoContents({
    owner,
    repo,
    path: root,
    branch,
    token,
  });

  const people: PersonSlug[] = [];

  for (const item of items) {
    if (item.type === "dir") {
      const slug = item.name;
      people.push({
        slug,
        name: titleFromSlug(slug),
        profilePath: `${root}/${slug}`,
        kind: "dir",
        htmlUrl: item.html_url ?? undefined,
      });
      continue;
    }
    if (item.type === "file" && /\.md$/i.test(item.name)) {
      const slug = item.name.replace(/\.md$/i, "");
      people.push({
        slug,
        name: titleFromSlug(slug),
        profilePath: item.path,
        kind: "file",
        htmlUrl: item.html_url ?? undefined,
      });
    }
  }

  return people.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadPersonProfile(params: {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  person: PersonSlug;
}): Promise<{ name: string; path: string; text: string; htmlUrl?: string }> {
  const { owner, repo, branch, token, person } = params;
  let path = person.profilePath;

  if (person.kind === "dir") {
    const listing = await listRepoContents({
      owner,
      repo,
      path: person.profilePath,
      branch,
      token,
    });
    const preferred =
      listing.find((f) => f.type === "file" && /^readme\.md$/i.test(f.name)) ||
      listing.find((f) => f.type === "file" && f.name === `${person.slug}.md`) ||
      listing.find((f) => f.type === "file" && /\.md$/i.test(f.name));
    if (!preferred) {
      throw new Error(
        `No markdown profile found in ${person.profilePath}/`,
      );
    }
    path = preferred.path;
  }

  const res = await githubRequest(
    `/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`,
    token,
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to load profile (${res.status}): ${body.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as {
    content?: string;
    encoding?: string;
    path?: string;
    html_url?: string;
  };
  if (!json.content) throw new Error("Empty profile file");
  const text =
    json.encoding === "base64"
      ? decodeURIComponent(
          Array.prototype.map
            .call(
              atob(json.content.replace(/\n/g, "")),
              (c: string) =>
                "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2),
            )
            .join(""),
        )
      : json.content;

  return {
    name: nameFromMarkdown(text, person.slug),
    path: json.path ?? path,
    text,
    htmlUrl: json.html_url,
  };
}

function relativePathFromInterviews(
  interviewsPath: string,
  personProfilePath: string,
): string {
  const fromParts = interviewsPath
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
  const up = fromParts.length > 0 ? "../".repeat(fromParts.length) : "./";
  const target = personProfilePath.replace(/^\/+/, "");
  return `${up}${target}`.replace(/\/{2,}/g, "/");
}

export function buildNoteMarkdown(params: {
  title: string;
  createdAt: Date;
  durationMs: number;
  audioPath: string;
  transcript: string;
  language?: string;
  source?: string;
  personSlug?: string;
  personName?: string;
  personProfilePath?: string;
  interviewsPath?: string;
  sessionKind?: SessionKind;
}): string {
  const {
    title,
    createdAt,
    durationMs,
    audioPath,
    transcript,
    language,
    source,
    personSlug,
    personName,
    personProfilePath,
    interviewsPath = "interviews",
    sessionKind = "interview",
  } = params;
  const kind = sessionKindMeta(sessionKind);
  const mins = Math.floor(durationMs / 60000);
  const secs = Math.floor((durationMs % 60000) / 1000);
  const duration = `${mins}m ${secs.toString().padStart(2, "0")}s`;
  const audioFile = audioPath.split("/").pop() ?? audioPath;

  let personLink: string | null = null;
  if (personProfilePath) {
    personLink = relativePathFromInterviews(interviewsPath, personProfilePath);
  }

  const blurb =
    sessionKind === "reflection"
      ? personName
        ? `> Reflection / debrief related to **${personName}** (\`${personSlug}\`) · ${createdAt.toLocaleString()} · ${duration}`
        : `> Reflection recorded ${createdAt.toLocaleString()} · ${duration}`
      : personName
        ? `> Interview with **${personName}** (\`${personSlug}\`) · ${createdAt.toLocaleString()} · ${duration}`
        : `> Interview recorded ${createdAt.toLocaleString()} · ${duration}`;

  const sectionHeading =
    sessionKind === "reflection" ? "## Reflection notes" : "## Transcript";

  return [
    `---`,
    `title: ${JSON.stringify(title)}`,
    `kind: ${JSON.stringify(sessionKind)}`,
    `date: ${createdAt.toISOString()}`,
    `duration: ${duration}`,
    `audio: ${JSON.stringify(audioPath)}`,
    personSlug ? `person: ${JSON.stringify(personSlug)}` : null,
    personName ? `person_name: ${JSON.stringify(personName)}` : null,
    personProfilePath
      ? `person_profile: ${JSON.stringify(personProfilePath)}`
      : null,
    language ? `language: ${JSON.stringify(language)}` : null,
    source ? `transcription: ${JSON.stringify(source)}` : null,
    // Both interview and reflection can be multi-speaker
    `diarize: true`,
    `---`,
    ``,
    `# ${title}`,
    ``,
    blurb,
    ``,
    personLink
      ? `Person profile: [\`${personProfilePath}\`](${personLink})`
      : null,
    `Type: **${kind.label}**`,
    `Audio: [\`${audioFile}\`](./${audioFile})`,
    ``,
    sectionHeading,
    ``,
    transcript.trim() ||
      (sessionKind === "reflection"
        ? "_No reflection notes yet._"
        : "_No transcript yet._"),
    ``,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function interviewsFolder(interviewsPath: string): string {
  return (interviewsPath || "interviews").replace(/^\/+|\/+$/g, "");
}

export function interviewFileBase(params: {
  personSlug?: string;
  title: string;
  createdAt: Date;
  sessionKind?: SessionKind;
}): string {
  const stamp = params.createdAt
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const person = (params.personSlug || "unassigned")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const kindTag = sessionKindMeta(params.sessionKind).fileTag;
  const titlePart =
    params.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || kindTag;
  return `${person}_${kindTag}_${stamp}_${titlePart}`.slice(0, 120);
}
