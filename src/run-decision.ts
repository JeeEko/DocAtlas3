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
