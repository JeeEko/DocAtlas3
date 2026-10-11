import type { PullRequestSnapshot } from "./run-decision.ts";

export function pullRequest(
  overrides: Partial<PullRequestSnapshot>,
): PullRequestSnapshot {
  return {
    draft: false,
    headInSameRepository: true,
    baseBranch: "main",
    changedPaths: [],
    commits: [],
    publishedDocs: {
      overview: null,
      architecture: null,
      glossary: null,
    },
    lessons: null,
    overrideFile: null,
    files: {},
    diff: "",
    proposal: null,
    modelFailed: false,
    ...overrides,
  };
}
