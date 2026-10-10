import assert from "node:assert/strict";
import { test } from "node:test";
import { decideRun, type PullRequestSnapshot } from "./run-decision.ts";

const rejected = {
  invokeModel: false,
  check: {
    name: "DocAtlas",
    state: "red",
    summary: "The proposal cannot be applied.",
  },
};

function pullRequest(
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

test("a changed section that cites a path missing from the snapshot writes nothing, fails DocAtlas, and posts no comment", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      lessons: "# Teach the name\n\nUse start.\n",
      overrideFile: "branch: main\n",
      files: {
        "src/app.ts": "export function start() {}\n",
      },
      proposal: {
        files: {
          "docs/overview.md":
            "# What it does\n\nThe app starts.\n\n# Entry points\n\nCall start.\n",
        },
        sections: [
          {
            path: "docs/overview.md",
            heading: "What it does",
            citation: { kind: "path", path: "src/app.ts" },
          },
          {
            path: "docs/overview.md",
            heading: "Entry points",
            citation: { kind: "path", path: "src/missing.ts" },
          },
        ],
        contradictions: [],
      },
    }),
  );

  assert.deepEqual(outcome, rejected);
});

test("citing a duplicate lesson heading writes nothing, fails DocAtlas, and posts no comment", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      lessons: [
        "# Ship the code name",
        "",
        "Use the name in the source.",
        "",
        "# Ship the code name",
        "",
        "Use the name in the source.",
        "",
      ].join("\n"),
      overrideFile: "branch: main\n",
      files: {
        "src/app.ts": "export function start() {}\n",
      },
      proposal: {
        files: {
          "docs/overview.md":
            "# What it does\n\nThe app starts.\n\n# Entry points\n\nCall start.\n",
        },
        sections: [
          {
            path: "docs/overview.md",
            heading: "What it does",
            citation: { kind: "lesson", heading: "Ship the code name" },
          },
        ],
        contradictions: [],
      },
    }),
  );

  assert.deepEqual(outcome, rejected);
});

test("citing a lesson heading that is not in the lessons file writes nothing, fails DocAtlas, and posts no comment", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      lessons: "# Teach the name\n\nUse start.\n",
      overrideFile: "branch: main\n",
      files: {
        "src/app.ts": "export function start() {}\n",
      },
      proposal: {
        files: {
          "docs/overview.md":
            "# What it does\n\nThe app starts.\n\n# Entry points\n\nCall start.\n",
        },
        sections: [
          {
            path: "docs/overview.md",
            heading: "What it does",
            citation: { kind: "lesson", heading: "Ship the code name" },
          },
        ],
        contradictions: [],
      },
    }),
  );

  assert.deepEqual(outcome, rejected);
});

test("a proposal that changes anything other than the three published docs writes nothing, fails DocAtlas, and posts no comment", () => {
  const outside = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      lessons: "# Teach the name\n\nUse start.\n",
      overrideFile: "branch: main\n",
      files: {
        "src/app.ts": "export function start() {}\n",
      },
      proposal: {
        files: {
          "docs/overview.md":
            "# What it does\n\nThe app starts.\n\n# Entry points\n\nCall start.\n",
          "docs/lessons.md": "# Teach the name\n\nUse begin.\n",
          ".docatlas.yml": "branch: develop\n",
          "src/app.ts": "export function begin() {}\n",
        },
        sections: [],
        contradictions: [],
      },
    }),
  );
  assert.deepEqual(outside, rejected);

  const retargeted = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      lessons: "# Teach the name\n\nUse start.\n",
      overrideFile: "overview: guide/home.md\n",
      files: {
        "src/app.ts": "export function start() {}\n",
      },
      proposal: {
        files: {
          "docs/overview.md":
            "# What it does\n\nThe app starts.\n\n# Entry points\n\nCall start.\n",
        },
        sections: [],
        contradictions: [],
      },
    }),
  );
  assert.deepEqual(retargeted, rejected);

  const sectionOutside = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      lessons: "# Teach the name\n\nUse start.\n",
      overrideFile: "branch: main\n",
      files: {
        "src/app.ts": "export function start() {}\n",
      },
      proposal: {
        files: {
          "docs/overview.md":
            "# What it does\n\nThe app starts.\n\n# Entry points\n\nCall start.\n",
        },
        sections: [
          {
            path: "src/app.ts",
            heading: "start",
            citation: { kind: "path", path: "src/app.ts" },
          },
        ],
        contradictions: [],
      },
    }),
  );
  assert.deepEqual(sectionOutside, rejected);
});

test("a model timeout or a model error writes nothing, fails DocAtlas, and posts no comment", () => {
  const timedOut = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      lessons: "# Teach the name\n\nUse start.\n",
      overrideFile: "branch: main\n",
      files: {
        "src/app.ts": "export function start() {}\n",
      },
      modelFailed: true,
    }),
  );
  assert.deepEqual(timedOut, rejected);

  const errored = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      lessons: "# Teach the name\n\nUse start.\n",
      overrideFile: "branch: main\n",
      files: {
        "src/app.ts": "export function start() {}\n",
      },
      modelFailed: true,
      proposal: {
        files: {
          "docs/overview.md":
            "# What it does\n\nThe app starts.\n\n# Entry points\n\nCall start.\n",
        },
        sections: [
          {
            path: "docs/overview.md",
            heading: "What it does",
            citation: { kind: "path", path: "src/app.ts" },
          },
        ],
        contradictions: [],
      },
    }),
  );
  assert.deepEqual(errored, rejected);
});

test("a proposal the run decision cannot apply writes nothing, fails DocAtlas, and posts no comment", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      lessons: "# Teach the name\n\nUse start.\n",
      overrideFile: "branch: main\n",
      files: {
        "src/app.ts": "export function start() {}\n",
      },
      publishedDocs: {
        overview: "# What it does\n\nOld.\n\n# Entry points\n\nNone is shown.\n",
        architecture: null,
        glossary: null,
      },
      proposal: {
        files: {},
        sections: [
          {
            path: "docs/overview.md",
            heading: "What it does",
            citation: { kind: "path", path: "src/app.ts" },
          },
        ],
        contradictions: [],
      },
    }),
  );

  assert.deepEqual(outcome, rejected);

  const unnamed = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      lessons: "# Teach the name\n\nUse start.\n",
      overrideFile: "branch: main\n",
      files: {
        "src/app.ts": "export function start() {}\n",
      },
      publishedDocs: {
        overview: "# What it does\n\nOld.\n\n# Entry points\n\nNone is shown.\n",
        architecture: null,
        glossary: null,
      },
      proposal: {
        files: {
          "docs/overview.md":
            "# What it does\n\nThe app starts.\n\n# Entry points\n\nCall start.\n",
        },
        sections: [
          {
            path: "docs/overview.md",
            heading: "Not a section",
            citation: { kind: "path", path: "src/app.ts" },
          },
        ],
        contradictions: [],
      },
    }),
  );

  assert.deepEqual(unnamed, rejected);
});
