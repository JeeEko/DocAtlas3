export type CheckState = "green" | "red" | "pending";

export type RunCheck = {
  name: "DocAtlas";
  state: CheckState;
  summary: string;
};

export type RunCommit = {
  message: string;
  files: readonly { path: string; content: string }[];
};

export type RunComment = {
  body: string;
};

export type RunOutcome = {
  invokeModel: boolean;
  check: RunCheck;
  commit?: RunCommit;
  comment?: RunComment;
};

export type Citation =
  | { kind: "path"; path: string }
  | { kind: "lesson"; heading: string };

export type SectionChange = {
  path: string;
  heading: string;
  citation: Citation;
};

export type LessonContradiction = {
  lessonHeading: string;
  file: string;
};

export type ModelProposal = {
  files: Readonly<Record<string, string>>;
  sections: readonly SectionChange[];
  contradictions: readonly LessonContradiction[];
};

export type SnapshotCommit = {
  message: string;
  paths: readonly string[];
};

export type PullRequestSnapshot = {
  draft: boolean;
  headInSameRepository: boolean;
  baseBranch: string;
  changedPaths: readonly string[];
  /**
   * Commits new for this run. When every one of them is DocAtlas's doc commit,
   * the run does not ask for the model again, even if changedPaths still lists
   * the rest of the pull request.
   */
  commits: readonly SnapshotCommit[];
  publishedDocs: {
    overview: string | null;
    architecture: string | null;
    glossary: string | null;
  };
  lessons: string | null;
  overrideFile: string | null;
  files: Readonly<Record<string, string>>;
  diff: string;
  proposal: ModelProposal | null;
  modelFailed: boolean;
};

function skippedOutcome(): RunOutcome {
  return {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "green",
      summary: "No doc update was required.",
    },
  };
}

function invokeModelOutcome(): RunOutcome {
  return {
    invokeModel: true,
    check: {
      name: "DocAtlas",
      state: "pending",
      summary: "Invoke the model.",
    },
  };
}

const OWN_DOC_COMMIT_MESSAGE = "docs: update for this pull request";

const DEFAULT_OVERVIEW = "docs/overview.md";
const DEFAULT_ARCHITECTURE = "docs/architecture.md";
const DEFAULT_GLOSSARY = "docs/glossary.md";
const DEFAULT_LESSONS = "docs/lessons.md";
const OVERRIDE_PATH = ".docatlas.yml";

const DENYLIST_GLOBS = [
  "**/test/**",
  "**/tests/**",
  "**/__tests__/**",
  "**/*_test.*",
  "**/*.test.*",
  "**/*.spec.*",
  ".github/**",
  ".cursor/**",
  "vendor/**",
  "**/node_modules/**",
  "dist/**",
  "build/**",
  "out/**",
];

const BINARY_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "tif",
  "tiff",
  "ico",
  "avif",
  "heic",
  "heif",
  "svg",
  "ttf",
  "otf",
  "woff",
  "woff2",
  "eot",
  "zip",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "jar",
  "zst",
];

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function globToRegExp(pattern: string): RegExp {
  let source = "";
  let index = 0;
  while (index < pattern.length) {
    if (pattern.startsWith("**/", index)) {
      source += "(?:.*/)?";
      index += 3;
      continue;
    }
    if (pattern.startsWith("**", index)) {
      source += ".*";
      index += 2;
      continue;
    }
    const char = pattern[index];
    if (char === "*") {
      source += "[^/]*";
      index += 1;
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      index += 1;
      continue;
    }
    source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    index += 1;
  }
  return new RegExp(`^${source}$`);
}

function pathMatches(pattern: string, filePath: string): boolean {
  return globToRegExp(pattern).test(normalizePath(filePath));
}

function isLockfile(filePath: string): boolean {
  const base = normalizePath(filePath).split("/").pop()?.toLowerCase() ?? "";
  if (
    base.endsWith(".lock") ||
    base.endsWith(".lockb") ||
    base.endsWith(".lockfile")
  ) {
    return true;
  }
  return (
    base === "package-lock.json" ||
    base === "npm-shrinkwrap.json" ||
    base === "pnpm-lock.yaml" ||
    base === "pnpm-lock.yml" ||
    base === "go.sum" ||
    base === "package.resolved" ||
    base === "packages.lock.json"
  );
}

function isBinaryAsset(filePath: string): boolean {
  const lower = normalizePath(filePath).toLowerCase();
  return BINARY_EXTENSIONS.some((extension) =>
    pathMatches(`**/*.${extension}`, lower),
  );
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readScalar(
  overrideFile: string | null,
  keyName: string,
): string | null {
  if (overrideFile === null || overrideFile === "") {
    return null;
  }
  for (const rawLine of overrideFile.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const key = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(trimmed);
    if (!key || key[1] !== keyName || key[2] === "") {
      continue;
    }
    return unquote(key[2]);
  }
  return null;
}

function readPatterns(
  overrideFile: string | null,
  keyName: string,
): readonly string[] {
  if (overrideFile === null || overrideFile === "") {
    return [];
  }
  const patterns: string[] = [];
  let reading = false;
  for (const rawLine of overrideFile.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const key = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(trimmed);
    if (key) {
      reading = key[1] === keyName;
      if (reading && key[2] !== "") {
        patterns.push(unquote(key[2]));
      }
      continue;
    }
    if (!reading) {
      continue;
    }
    const item = /^-\s+(.*)$/.exec(trimmed);
    if (item) {
      patterns.push(unquote(item[1]));
    }
  }
  return patterns;
}

function publishedDocPaths(overrideFile: string | null): readonly string[] {
  return [
    normalizePath(readScalar(overrideFile, "overview") ?? DEFAULT_OVERVIEW),
    normalizePath(
      readScalar(overrideFile, "architecture") ?? DEFAULT_ARCHITECTURE,
    ),
    normalizePath(readScalar(overrideFile, "glossary") ?? DEFAULT_GLOSSARY),
  ];
}

function isDenylisted(
  filePath: string,
  ignore: readonly string[],
  publishedDocs: readonly string[],
): boolean {
  const path = normalizePath(filePath);
  if (publishedDocs.includes(path)) {
    return true;
  }
  if (isLockfile(path)) {
    return true;
  }
  if (DENYLIST_GLOBS.some((pattern) => pathMatches(pattern, path))) {
    return true;
  }
  if (isBinaryAsset(path)) {
    return true;
  }
  return ignore.some((pattern) => pathMatches(pattern, path));
}

function rejectUnusableProposal(
  _snapshot: PullRequestSnapshot,
): RunOutcome | undefined {
  return undefined;
}

type HeadingLine = {
  level: number;
  heading: string;
  start: number;
};

function headingLines(markdown: string): HeadingLine[] {
  const headings: HeadingLine[] = [];
  let offset = 0;
  const lines = markdown.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})[ \t]+(.*?)[ \t]*$/.exec(lines[index]);
    if (match) {
      headings.push({
        level: match[1].length,
        heading: match[2],
        start: offset,
      });
    }
    offset += lines[index].length;
    if (index < lines.length - 1) {
      offset += 1;
    }
  }
  return headings;
}

function headingAt(markdown: string, heading: string): HeadingLine | null {
  return headingLines(markdown).find((item) => item.heading === heading) ?? null;
}

function directBodySpan(
  markdown: string,
  heading: string,
): { start: number; end: number } | null {
  const headings = headingLines(markdown);
  const found = headings.find((item) => item.heading === heading);
  if (!found) {
    return null;
  }
  const lineEnd = markdown.indexOf("\n", found.start);
  const bodyStart = lineEnd === -1 ? markdown.length : lineEnd + 1;
  const sectionEnd =
    headings.find((item) => item.start > found.start && item.level <= found.level)
      ?.start ?? markdown.length;
  const child = headings.find(
    (item) => item.start > found.start && item.start < sectionEnd && item.level > found.level,
  );
  return { start: bodyStart, end: child?.start ?? sectionEnd };
}

function replaceDirectBody(
  content: string,
  heading: string,
  proposed: string,
): string | null {
  const currentBody = directBodySpan(content, heading);
  const proposedBody = directBodySpan(proposed, heading);
  if (!currentBody || !proposedBody) {
    return null;
  }
  let body = proposed.slice(proposedBody.start, proposedBody.end);
  const after = content.slice(currentBody.end);
  if (after !== "") {
    if (!body.endsWith("\n")) {
      body += "\n";
    }
    if (!body.endsWith("\n\n")) {
      body += "\n";
    }
  }
  const next = content.slice(0, currentBody.start) + body + after;
  return fillEmptyTopLevel(next.endsWith("\n") ? next : `${next}\n`);
}

function parentHeading(markdown: string, heading: string): string | null {
  const headings = headingLines(markdown);
  const found = headings.find((item) => item.heading === heading);
  if (!found) {
    return null;
  }
  const parent = [...headings]
    .reverse()
    .find((item) => item.start < found.start && item.level < found.level);
  return parent?.heading ?? null;
}

function appendGlossaryTerm(
  content: string,
  proposed: string,
  heading: string,
): string | null {
  const span = sectionSpan(proposed, heading);
  if (!span) {
    return null;
  }
  let middle = proposed.slice(span.start, span.end);
  if (!middle.endsWith("\n")) {
    middle += "\n";
  }
  if (content.trim() === "" || content.trim() === "none is shown") {
    return middle;
  }
  const base = content.endsWith("\n\n")
    ? content
    : content.endsWith("\n")
      ? `${content}\n`
      : `${content}\n\n`;
  return base + middle;
}

function removeSection(content: string, heading: string): string | null {
  const span = sectionSpan(content, heading);
  if (!span) {
    return null;
  }
  const next = content.slice(0, span.start) + content.slice(span.end);
  return next.endsWith("\n") || next === "" ? next : `${next}\n`;
}

function insertSubsection(
  content: string,
  parent: string,
  proposed: string,
  heading: string,
): string | null {
  const parentSpan = sectionSpan(content, parent);
  const proposedSpan = sectionSpan(proposed, heading);
  if (!parentSpan || !proposedSpan) {
    return null;
  }
  let middle = proposed.slice(proposedSpan.start, proposedSpan.end);
  if (!middle.endsWith("\n")) {
    middle += "\n";
  }
  if (parentSpan.end < content.length && !middle.endsWith("\n\n")) {
    middle += "\n";
  }
  const next =
    content.slice(0, parentSpan.end) + middle + content.slice(parentSpan.end);
  return next.endsWith("\n") ? next : `${next}\n`;
}

function sectionSpan(
  markdown: string,
  heading: string,
): { start: number; end: number } | null {
  const headings = headingLines(markdown);
  const found = headings.find((item) => item.heading === heading);
  if (!found) {
    return null;
  }
  const next = headings.find(
    (item) => item.start > found.start && item.level <= found.level,
  );
  return { start: found.start, end: next?.start ?? markdown.length };
}

function publishedSlot(
  filePath: string,
  overrideFile: string | null,
): "overview" | "architecture" | "glossary" | null {
  const path = normalizePath(filePath);
  const [overview, architecture, glossary] = publishedDocPaths(overrideFile);
  if (path === overview) {
    return "overview";
  }
  if (path === architecture) {
    return "architecture";
  }
  if (path === glossary) {
    return "glossary";
  }
  return null;
}

const PUBLISHED_OUTLINE = {
  overview: "# What it does\n\nnone is shown\n\n# Entry points\n\nnone is shown\n",
  architecture:
    "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
  glossary: "none is shown\n",
} as const;

const REQUIRED_HEADINGS = {
  overview: ["What it does", "Entry points"],
  architecture: ["Parts", "Relationships", "Data"],
  glossary: [],
} as const;

function ensureRequiredHeadings(
  content: string,
  slot: keyof typeof REQUIRED_HEADINGS,
): string {
  const required = REQUIRED_HEADINGS[slot];
  let next = content;
  for (let index = 0; index < required.length; index += 1) {
    const heading = required[index];
    if (headingAt(next, heading)) {
      continue;
    }
    let block = `# ${heading}\n\nnone is shown\n`;
    const earlier = required
      .slice(0, index)
      .reverse()
      .find((item) => headingAt(next, item));
    if (!earlier) {
      if (next.trim() === "" || next.trim() === "none is shown") {
        next = block;
      } else {
        if (!block.endsWith("\n\n")) {
          block += "\n";
        }
        next = block + next;
      }
      continue;
    }
    const span = sectionSpan(next, earlier);
    if (!span) {
      continue;
    }
    if (span.end === next.length) {
      if (!next.endsWith("\n")) {
        next += "\n";
      }
      if (!next.endsWith("\n\n")) {
        next += "\n";
      }
      next += block;
      continue;
    }
    if (!block.endsWith("\n\n")) {
      block += "\n";
    }
    next = next.slice(0, span.end) + block + next.slice(span.end);
  }
  return next.endsWith("\n") ? next : `${next}\n`;
}

function fillEmptyTopLevel(markdown: string): string {
  const headings = headingLines(markdown).filter((item) => item.level === 1);
  if (headings.length === 0) {
    return markdown;
  }
  let filled = "";
  let cursor = 0;
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const lineEnd = markdown.indexOf("\n", heading.start);
    const bodyStart = lineEnd === -1 ? markdown.length : lineEnd + 1;
    const bodyEnd = headings[index + 1]?.start ?? markdown.length;
    filled += markdown.slice(cursor, bodyStart);
    const body = markdown.slice(bodyStart, bodyEnd);
    if (body.trim() === "") {
      filled += headings[index + 1]
        ? "\nnone is shown\n\n"
        : "\nnone is shown\n";
    } else {
      filled += body;
    }
    cursor = bodyEnd;
  }
  return filled + markdown.slice(cursor);
}

function proposalFile(
  proposal: ModelProposal,
  filePath: string,
): string | undefined {
  const path = normalizePath(filePath);
  for (const [key, content] of Object.entries(proposal.files)) {
    if (normalizePath(key) === path) {
      return content;
    }
  }
  return undefined;
}

function citationSource(
  snapshot: PullRequestSnapshot,
  citation: Citation,
): string | undefined {
  if (citation.kind === "path") {
    const path = normalizePath(citation.path);
    const exists = Object.keys(snapshot.files).some(
      (key) => normalizePath(key) === path,
    );
    return exists ? path : undefined;
  }
  if (snapshot.lessons === null) {
    return undefined;
  }
  const matches = headingLines(snapshot.lessons).filter(
    (item) => item.heading === citation.heading,
  );
  return matches.length === 1 ? citation.heading : undefined;
}

function sameDoc(left: string, right: string): boolean {
  return left.replace(/\s+$/, "") === right.replace(/\s+$/, "");
}

function commitUsableProposal(
  snapshot: PullRequestSnapshot,
): RunOutcome | undefined {
  if (snapshot.proposal === null || snapshot.modelFailed) {
    return undefined;
  }
  const published = publishedDocPaths(snapshot.overrideFile);
  if (
    Object.keys(snapshot.proposal.files).some(
      (filePath) => !published.includes(normalizePath(filePath)),
    )
  ) {
    return undefined;
  }
  if (snapshot.proposal.sections.length === 0) {
    return skippedOutcome();
  }
  const slots = ["overview", "architecture", "glossary"] as const;
  const resolved = [];
  for (const section of snapshot.proposal.sections) {
    const source = citationSource(snapshot, section.citation);
    const slot = publishedSlot(section.path, snapshot.overrideFile);
    if (!source || !slot) {
      return undefined;
    }
    resolved.push({ section, source, slot });
  }
  const rendered = new Map<(typeof slots)[number], string>();
  const summaries: string[] = [];
  for (const slot of slots) {
    const changes = resolved.filter((item) => item.slot === slot);
    if (changes.length === 0) {
      continue;
    }
    const proposed = proposalFile(snapshot.proposal, published[slots.indexOf(slot)]);
    let content = snapshot.publishedDocs[slot] ?? PUBLISHED_OUTLINE[slot];
    const originalOrder = headingLines(content).map((item) => item.heading);
    const applied = new Map<string, string>();
    for (const change of changes) {
      const existing = headingAt(content, change.section.heading);
      const proposedHeading =
        proposed === undefined
          ? null
          : headingAt(proposed, change.section.heading);
      let next: string | null = null;
      if (existing && proposedHeading && proposed !== undefined) {
        next = replaceDirectBody(content, change.section.heading, proposed);
      } else if (existing && !proposedHeading && existing.level > 1) {
        next = removeSection(content, change.section.heading);
      } else if (!existing && proposedHeading && proposed) {
        if (proposedHeading.level > 1) {
          const parent = parentHeading(proposed, change.section.heading);
          if (parent) {
            next = insertSubsection(
              content,
              parent,
              proposed,
              change.section.heading,
            );
          }
        } else if (slot === "glossary") {
          next = appendGlossaryTerm(content, proposed, change.section.heading);
        }
      }
      if (next && !sameDoc(content, next)) {
        applied.set(change.section.heading, change.source);
        content = next;
      }
    }
    if (applied.size > 0) {
      content = ensureRequiredHeadings(content, slot);
    }
    const finalHeadings = headingLines(content).map((item) => item.heading);
    const summaryHeadings = finalHeadings.filter((heading) =>
      applied.has(heading),
    );
    for (const heading of originalOrder) {
      if (!applied.has(heading) || finalHeadings.includes(heading)) {
        continue;
      }
      const index = originalOrder.indexOf(heading);
      let insertAt = 0;
      for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
        const predecessor = summaryHeadings.indexOf(originalOrder[earlier]);
        if (predecessor !== -1) {
          insertAt = predecessor + 1;
          break;
        }
      }
      summaryHeadings.splice(insertAt, 0, heading);
    }
    for (const heading of summaryHeadings) {
      const source = applied.get(heading);
      if (source) {
        summaries.push(`${heading} (${source})`);
      }
    }
    rendered.set(slot, content);
  }
  const changed = slots.some((slot) => {
    const next = rendered.get(slot);
    const current = snapshot.publishedDocs[slot];
    return next !== undefined && (current === null || !sameDoc(current, next));
  });
  if (!changed) {
    return skippedOutcome();
  }
  const files = slots.flatMap((slot, index) => {
    const next = rendered.get(slot);
    const current = snapshot.publishedDocs[slot];
    if (next !== undefined && (current === null || !sameDoc(current, next))) {
      return [{ path: published[index], content: next }];
    }
    if (current === null) {
      return [{ path: published[index], content: PUBLISHED_OUTLINE[slot] }];
    }
    return [];
  });
  return {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "green",
      summary: summaries.join("; "),
    },
    commit: {
      message: OWN_DOC_COMMIT_MESSAGE,
      files,
    },
  };
}

export function decideRun(snapshot: PullRequestSnapshot): RunOutcome {
  if (
    snapshot.draft ||
    !snapshot.headInSameRepository ||
    snapshot.baseBranch !== (readScalar(snapshot.overrideFile, "branch") ?? "main")
  ) {
    return skippedOutcome();
  }
  if (
    snapshot.commits.length > 0 &&
    snapshot.commits.every(
      (commit) => commit.message.trim() === OWN_DOC_COMMIT_MESSAGE,
    )
  ) {
    return skippedOutcome();
  }
  if (snapshot.proposal !== null || snapshot.modelFailed) {
    return (
      rejectUnusableProposal(snapshot) ??
      commitUsableProposal(snapshot) ??
      invokeModelOutcome()
    );
  }
  const ignore = readPatterns(snapshot.overrideFile, "ignore");
  const include = readPatterns(snapshot.overrideFile, "include");
  const publishedDocs = publishedDocPaths(snapshot.overrideFile);
  const lessonsPath = normalizePath(
    readScalar(snapshot.overrideFile, "lessons") ?? DEFAULT_LESSONS,
  );
  if (
    snapshot.changedPaths.some((path) => {
      const normalized = normalizePath(path);
      if (normalized === lessonsPath || normalized === OVERRIDE_PATH) {
        return true;
      }
      if (include.some((pattern) => pathMatches(pattern, normalized))) {
        return true;
      }
      return !isDenylisted(normalized, ignore, publishedDocs);
    })
  ) {
    return invokeModelOutcome();
  }
  return skippedOutcome();
}
