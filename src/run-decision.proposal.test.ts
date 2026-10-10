import assert from "node:assert/strict";
import { test } from "node:test";
import { decideRun, type PullRequestSnapshot } from "./run-decision.ts";

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

test("a usable proposal commits the cited section and leaves every other section untouched", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      publishedDocs: {
        overview: [
          "# What it does",
          "",
          "Serves files.",
          "",
          "Keeps a local copy.",
          "",
          "# Entry points",
          "",
          "Call main.",
          "",
        ].join("\n"),
        architecture: [
          "# Parts",
          "",
          "none is shown",
          "",
          "# Relationships",
          "",
          "none is shown",
          "",
          "# Data",
          "",
          "none is shown",
          "",
        ].join("\n"),
        glossary: "none is shown\n",
      },
      files: {
        "src/app.ts": "export function main() {}\n",
        "README.md": "DocAtlas\n",
      },
      proposal: {
        files: {
          "docs/overview.md": [
            "# What it does",
            "",
            "Serves published docs.",
            "",
            "# Entry points",
            "",
            "Call start.",
            "",
          ].join("\n"),
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

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "green",
      summary: "What it does (src/app.ts)",
    },
    commit: {
      message: "docs: update for this pull request",
      files: [
        {
          path: "docs/overview.md",
          content: [
            "# What it does",
            "",
            "Serves published docs.",
            "",
            "# Entry points",
            "",
            "Call main.",
            "",
          ].join("\n"),
        },
      ],
    },
  });
});

test("a refactor proposal that changes no section stays green without a commit", () => {
  const overview = "# What it does\n\nServes files.\n\n# Entry points\n\nCall main.\n";
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      publishedDocs: {
        overview,
        architecture: "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        glossary: "none is shown\n",
      },
      files: {
        "src/app.ts": "export function main() {}\n",
      },
      proposal: {
        files: {
          "docs/overview.md":
            "# What it does\n\nServes files after a refactor.\n\n# Entry points\n\nCall main.\n",
        },
        sections: [],
        contradictions: [],
      },
    }),
  );

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "green",
      summary: "No doc update was required.",
    },
  });
});

test("missing published docs are created with the full outline", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      files: {
        "src/app.ts": "export function main() {}\n",
        "README.md": "DocAtlas\n",
      },
      proposal: {
        files: {
          "docs/overview.md": "# What it does\n\nServes published docs.\n",
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

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "green",
      summary: "What it does (src/app.ts)",
    },
    commit: {
      message: "docs: update for this pull request",
      files: [
        {
          path: "docs/overview.md",
          content:
            "# What it does\n\nServes published docs.\n\n# Entry points\n\nnone is shown\n",
        },
        {
          path: "docs/architecture.md",
          content:
            "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        },
        {
          path: "docs/glossary.md",
          content: "none is shown\n",
        },
      ],
    },
  });
});

test("a top-level heading is not deleted when the proposal omits it", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      publishedDocs: {
        overview: "# What it does\n\nServes files.\n\n# Entry points\n\nCall main.\n",
        architecture:
          "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        glossary: "none is shown\n",
      },
      files: {
        "src/app.ts": "export function main() {}\n",
      },
      proposal: {
        files: {
          "docs/overview.md": "# Entry points\n\nCall start.\n",
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
            citation: { kind: "path", path: "src/app.ts" },
          },
        ],
        contradictions: [],
      },
    }),
  );

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "green",
      summary: "Entry points (src/app.ts)",
    },
    commit: {
      message: "docs: update for this pull request",
      files: [
        {
          path: "docs/overview.md",
          content: "# What it does\n\nServes files.\n\n# Entry points\n\nCall start.\n",
        },
      ],
    },
  });
});

test("a top-level heading is not renamed", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      publishedDocs: {
        overview: "# What it does\n\nServes files.\n\n# Entry points\n\nCall main.\n",
        architecture:
          "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        glossary: "none is shown\n",
      },
      files: {
        "src/app.ts": "export function main() {}\n",
      },
      proposal: {
        files: {
          "docs/overview.md":
            "# Purpose\n\nServes published docs.\n\n# Entry points\n\nCall start.\n",
        },
        sections: [
          {
            path: "docs/overview.md",
            heading: "Purpose",
            citation: { kind: "path", path: "src/app.ts" },
          },
          {
            path: "docs/overview.md",
            heading: "Entry points",
            citation: { kind: "path", path: "src/app.ts" },
          },
        ],
        contradictions: [],
      },
    }),
  );

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "green",
      summary: "Entry points (src/app.ts)",
    },
    commit: {
      message: "docs: update for this pull request",
      files: [
        {
          path: "docs/overview.md",
          content: "# What it does\n\nServes files.\n\n# Entry points\n\nCall start.\n",
        },
      ],
    },
  });
});

test("subsections are added under Parts only when each cites a resolved source", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["packages/web/package.json", "packages/api/package.json"],
      publishedDocs: {
        overview: "# What it does\n\nServes files.\n\n# Entry points\n\nCall main.\n",
        architecture:
          "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        glossary: "none is shown\n",
      },
      files: {
        "packages/web/package.json": "{}\n",
        "packages/api/package.json": "{}\n",
        "packages/cli/package.json": "{}\n",
      },
      proposal: {
        files: {
          "docs/architecture.md": [
            "# Parts",
            "",
            "Two packages.",
            "",
            "## Web",
            "",
            "The web package.",
            "",
            "## Api",
            "",
            "The api package.",
            "",
            "## Cli",
            "",
            "The cli package.",
            "",
            "# Relationships",
            "",
            "none is shown",
            "",
            "# Data",
            "",
            "none is shown",
            "",
          ].join("\n"),
        },
        sections: [
          {
            path: "docs/architecture.md",
            heading: "Parts",
            citation: { kind: "path", path: "packages/web/package.json" },
          },
          {
            path: "docs/architecture.md",
            heading: "Web",
            citation: { kind: "path", path: "packages/web/package.json" },
          },
          {
            path: "docs/architecture.md",
            heading: "Api",
            citation: { kind: "path", path: "packages/api/package.json" },
          },
        ],
        contradictions: [],
      },
    }),
  );

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "green",
      summary:
        "Parts (packages/web/package.json); Web (packages/web/package.json); Api (packages/api/package.json)",
    },
    commit: {
      message: "docs: update for this pull request",
      files: [
        {
          path: "docs/architecture.md",
          content: [
            "# Parts",
            "",
            "Two packages.",
            "",
            "## Web",
            "",
            "The web package.",
            "",
            "## Api",
            "",
            "The api package.",
            "",
            "# Relationships",
            "",
            "none is shown",
            "",
            "# Data",
            "",
            "none is shown",
            "",
          ].join("\n"),
        },
      ],
    },
  });
});

test("a subsection is removed only when the proposal cites it", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["packages/web/package.json"],
      publishedDocs: {
        overview: "# What it does\n\nServes files.\n\n# Entry points\n\nCall main.\n",
        architecture: [
          "# Parts",
          "",
          "Two packages.",
          "",
          "## Web",
          "",
          "The web package.",
          "",
          "## Api",
          "",
          "The api package.",
          "",
          "# Relationships",
          "",
          "none is shown",
          "",
          "# Data",
          "",
          "none is shown",
          "",
        ].join("\n"),
        glossary: "none is shown\n",
      },
      files: {
        "packages/web/package.json": "{}\n",
        "packages/api/package.json": "{}\n",
      },
      proposal: {
        files: {
          "docs/architecture.md": [
            "# Parts",
            "",
            "One package.",
            "",
            "# Relationships",
            "",
            "none is shown",
            "",
            "# Data",
            "",
            "none is shown",
            "",
          ].join("\n"),
        },
        sections: [
          {
            path: "docs/architecture.md",
            heading: "Parts",
            citation: { kind: "path", path: "packages/web/package.json" },
          },
          {
            path: "docs/architecture.md",
            heading: "Web",
            citation: { kind: "path", path: "packages/web/package.json" },
          },
        ],
        contradictions: [],
      },
    }),
  );

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "green",
      summary:
        "Parts (packages/web/package.json); Web (packages/web/package.json)",
    },
    commit: {
      message: "docs: update for this pull request",
      files: [
        {
          path: "docs/architecture.md",
          content: [
            "# Parts",
            "",
            "One package.",
            "",
            "## Api",
            "",
            "The api package.",
            "",
            "# Relationships",
            "",
            "none is shown",
            "",
            "# Data",
            "",
            "none is shown",
            "",
          ].join("\n"),
        },
      ],
    },
  });
});

test("an existing overview keeps Entry points when that heading is absent", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      publishedDocs: {
        overview: "# What it does\n\nServes files.\n",
        architecture:
          "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        glossary: "none is shown\n",
      },
      files: {
        "src/app.ts": "export function main() {}\n",
      },
      proposal: {
        files: {
          "docs/overview.md": "# What it does\n\nServes published docs.\n",
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

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "green",
      summary: "What it does (src/app.ts)",
    },
    commit: {
      message: "docs: update for this pull request",
      files: [
        {
          path: "docs/overview.md",
          content:
            "# What it does\n\nServes published docs.\n\n# Entry points\n\nnone is shown\n",
        },
      ],
    },
  });
});

test("each glossary term keeps its own heading", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/snapshot.ts"],
      publishedDocs: {
        overview: "# What it does\n\nServes files.\n\n# Entry points\n\nCall main.\n",
        architecture:
          "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        glossary: "# Atlas\n\nThe published set.\n",
      },
      files: {
        "src/snapshot.ts": "export type Snapshot = {}\n",
      },
      proposal: {
        files: {
          "docs/glossary.md": "# Snapshot\n\nThe pull request view.\n",
        },
        sections: [
          {
            path: "docs/glossary.md",
            heading: "Atlas",
            citation: { kind: "path", path: "src/snapshot.ts" },
          },
          {
            path: "docs/glossary.md",
            heading: "Snapshot",
            citation: { kind: "path", path: "src/snapshot.ts" },
          },
        ],
        contradictions: [],
      },
    }),
  );

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "green",
      summary: "Snapshot (src/snapshot.ts)",
    },
    commit: {
      message: "docs: update for this pull request",
      files: [
        {
          path: "docs/glossary.md",
          content: "# Atlas\n\nThe published set.\n\n# Snapshot\n\nThe pull request view.\n",
        },
      ],
    },
  });
});

test("an empty top-level section stays and states that none is shown", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts"],
      publishedDocs: {
        overview: "# What it does\n\nServes files.\n\n# Entry points\n\nCall main.\n",
        architecture:
          "# Parts\n\nThe web package.\n\n# Relationships\n\nCalls the web package.\n\n# Data\n\nStores nothing.\n",
        glossary: "none is shown\n",
      },
      files: {
        "src/app.ts": "export function main() {}\n",
      },
      proposal: {
        files: {
          "docs/architecture.md":
            "# Parts\n\nThe web package.\n\n# Relationships\n\n# Data\n\nStores nothing.\n",
        },
        sections: [
          {
            path: "docs/architecture.md",
            heading: "Relationships",
            citation: { kind: "path", path: "src/app.ts" },
          },
        ],
        contradictions: [],
      },
    }),
  );

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "green",
      summary: "Relationships (src/app.ts)",
    },
    commit: {
      message: "docs: update for this pull request",
      files: [
        {
          path: "docs/architecture.md",
          content:
            "# Parts\n\nThe web package.\n\n# Relationships\n\nnone is shown\n\n# Data\n\nStores nothing.\n",
        },
      ],
    },
  });
});

test("a lesson heading that exists justifies the changed section", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["docs/lessons.md"],
      publishedDocs: {
        overview: "# What it does\n\nServes files.\n\n# Entry points\n\nCall main.\n",
        architecture: "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        glossary: "none is shown\n",
      },
      lessons: "# Publish the outline\n\nWrite the three docs.\n\n# Leave this\n\nKeep it.\n",
      files: {
        "docs/lessons.md":
          "# Publish the outline\n\nWrite the three docs.\n\n# Leave this\n\nKeep it.\n",
      },
      proposal: {
        files: {
          "docs/overview.md":
            "# What it does\n\nServes published docs.\n\n# Entry points\n\nCall main.\n",
        },
        sections: [
          {
            path: "docs/overview.md",
            heading: "What it does",
            citation: { kind: "lesson", heading: "Publish the outline" },
          },
        ],
        contradictions: [],
      },
    }),
  );

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "green",
      summary: "What it does (Publish the outline)",
    },
    commit: {
      message: "docs: update for this pull request",
      files: [
        {
          path: "docs/overview.md",
          content:
            "# What it does\n\nServes published docs.\n\n# Entry points\n\nCall main.\n",
        },
      ],
    },
  });
});
