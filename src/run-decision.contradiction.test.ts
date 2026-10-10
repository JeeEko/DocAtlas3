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

test("a proposal that reports lesson contradictions still publishes the code, stays red, and comments once with each new conflict", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/billing.ts", "src/retry.ts"],
      publishedDocs: {
        overview: [
          "# What it does",
          "",
          "Billed yearly and retried forever.",
          "",
          "# Entry points",
          "",
          "Call main.",
          "",
        ].join("\n"),
        architecture:
          "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        glossary: "none is shown\n",
      },
      lessons: [
        "# Billing period",
        "",
        "Billed yearly.",
        "",
        "# Retry window",
        "",
        "Retried forever.",
        "",
      ].join("\n"),
      files: {
        "src/billing.ts": 'export const period = "month";\n',
        "src/retry.ts": "export const attempts = 2;\n",
      },
      proposal: {
        files: {
          "docs/overview.md": [
            "# What it does",
            "",
            "Billed monthly and retried twice.",
            "",
            "# Entry points",
            "",
            "Call main.",
            "",
          ].join("\n"),
        },
        sections: [
          {
            path: "docs/overview.md",
            heading: "What it does",
            citation: { kind: "path", path: "src/billing.ts" },
          },
        ],
        contradictions: [
          { lessonHeading: "Billing period", file: "src/billing.ts" },
          { lessonHeading: "Retry window", file: "src/retry.ts" },
        ],
      },
    }),
  );

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "red",
      summary: "What it does (src/billing.ts)",
    },
    commit: {
      message: "docs: update for this pull request",
      files: [
        {
          path: "docs/overview.md",
          content: [
            "# What it does",
            "",
            "Billed monthly and retried twice.",
            "",
            "# Entry points",
            "",
            "Call main.",
            "",
          ].join("\n"),
        },
      ],
    },
    comment: {
      body: "Billing period contradicts src/billing.ts\nRetry window contradicts src/retry.ts",
    },
  });
});

test("a later push with the same conflicts stays red and does not comment again", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/billing.ts", "src/retry.ts"],
      commentedConflicts: [
        { lessonHeading: "Billing period", file: "src/billing.ts" },
        { lessonHeading: "Retry window", file: "src/retry.ts" },
      ],
      publishedDocs: {
        overview: [
          "# What it does",
          "",
          "Billed yearly and retried forever.",
          "",
          "# Entry points",
          "",
          "Call main.",
          "",
        ].join("\n"),
        architecture:
          "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        glossary: "none is shown\n",
      },
      lessons: [
        "# Billing period",
        "",
        "Billed yearly.",
        "",
        "# Retry window",
        "",
        "Retried forever.",
        "",
      ].join("\n"),
      files: {
        "src/billing.ts": 'export const period = "month";\n',
        "src/retry.ts": "export const attempts = 2;\n",
      },
      proposal: {
        files: {
          "docs/overview.md": [
            "# What it does",
            "",
            "Billed monthly and retried twice.",
            "",
            "# Entry points",
            "",
            "Call main.",
            "",
          ].join("\n"),
        },
        sections: [
          {
            path: "docs/overview.md",
            heading: "What it does",
            citation: { kind: "path", path: "src/billing.ts" },
          },
        ],
        contradictions: [
          { lessonHeading: "Billing period", file: "src/billing.ts" },
          { lessonHeading: "Retry window", file: "src/retry.ts" },
        ],
      },
    }),
  );

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "red",
      summary: "What it does (src/billing.ts)",
    },
    commit: {
      message: "docs: update for this pull request",
      files: [
        {
          path: "docs/overview.md",
          content: [
            "# What it does",
            "",
            "Billed monthly and retried twice.",
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

test("a later push that introduces a new conflict comments only about that new conflict", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/billing.ts", "src/retry.ts"],
      commentedConflicts: [
        { lessonHeading: "Billing period", file: "src/billing.ts" },
      ],
      publishedDocs: {
        overview: [
          "# What it does",
          "",
          "Billed yearly and retried forever.",
          "",
          "# Entry points",
          "",
          "Call main.",
          "",
        ].join("\n"),
        architecture:
          "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        glossary: "none is shown\n",
      },
      lessons: [
        "# Billing period",
        "",
        "Billed yearly.",
        "",
        "# Retry window",
        "",
        "Retried forever.",
        "",
      ].join("\n"),
      files: {
        "src/billing.ts": 'export const period = "month";\n',
        "src/retry.ts": "export const attempts = 2;\n",
      },
      proposal: {
        files: {
          "docs/overview.md": [
            "# What it does",
            "",
            "Billed monthly and retried twice.",
            "",
            "# Entry points",
            "",
            "Call main.",
            "",
          ].join("\n"),
        },
        sections: [
          {
            path: "docs/overview.md",
            heading: "What it does",
            citation: { kind: "path", path: "src/billing.ts" },
          },
        ],
        contradictions: [
          { lessonHeading: "Billing period", file: "src/billing.ts" },
          { lessonHeading: "Retry window", file: "src/retry.ts" },
        ],
      },
    }),
  );

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "red",
      summary: "What it does (src/billing.ts)",
    },
    commit: {
      message: "docs: update for this pull request",
      files: [
        {
          path: "docs/overview.md",
          content: [
            "# What it does",
            "",
            "Billed monthly and retried twice.",
            "",
            "# Entry points",
            "",
            "Call main.",
            "",
          ].join("\n"),
        },
      ],
    },
    comment: {
      body: "Retry window contradicts src/retry.ts",
    },
  });
});

test("a named conflict keeps DocAtlas red when the published docs already follow the code", () => {
  const overview = [
    "# What it does",
    "",
    "Billed monthly.",
    "",
    "# Entry points",
    "",
    "Call main.",
    "",
  ].join("\n");
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/billing.ts"],
      publishedDocs: {
        overview,
        architecture:
          "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        glossary: "none is shown\n",
      },
      lessons: "# Billing period\n\nBilled yearly.\n",
      files: {
        "src/billing.ts": 'export const period = "month";\n',
      },
      proposal: {
        files: {
          "docs/overview.md": overview,
        },
        sections: [
          {
            path: "docs/overview.md",
            heading: "What it does",
            citation: { kind: "path", path: "src/billing.ts" },
          },
        ],
        contradictions: [
          { lessonHeading: "Billing period", file: "src/billing.ts" },
        ],
      },
    }),
  );

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "red",
      summary: "No doc update was required.",
    },
    comment: {
      body: "Billing period contradicts src/billing.ts",
    },
  });
});

test("a proposal that changes no section still stays red and comments when it reports a new conflict", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/billing.ts"],
      publishedDocs: {
        overview: "# What it does\n\nBilled monthly.\n\n# Entry points\n\nCall main.\n",
        architecture:
          "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        glossary: "none is shown\n",
      },
      lessons: "# Billing period\n\nBilled yearly.\n",
      files: {
        "src/billing.ts": 'export const period = "month";\n',
      },
      proposal: {
        files: {},
        sections: [],
        contradictions: [
          { lessonHeading: "Billing period", file: "src/billing.ts" },
        ],
      },
    }),
  );

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "red",
      summary: "No doc update was required.",
    },
    comment: {
      body: "Billing period contradicts src/billing.ts",
    },
  });
});

test("a later push with the same conflict and no doc change stays red and does not comment again", () => {
  const overview = "# What it does\n\nBilled monthly.\n\n# Entry points\n\nCall main.\n";
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/billing.ts"],
      commentedConflicts: [
        { lessonHeading: "Billing period", file: "src/billing.ts" },
      ],
      publishedDocs: {
        overview,
        architecture:
          "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        glossary: "none is shown\n",
      },
      lessons: "# Billing period\n\nBilled yearly.\n",
      files: {
        "src/billing.ts": 'export const period = "month";\n',
      },
      proposal: {
        files: {
          "docs/overview.md": overview,
        },
        sections: [
          {
            path: "docs/overview.md",
            heading: "What it does",
            citation: { kind: "path", path: "src/billing.ts" },
          },
        ],
        contradictions: [
          { lessonHeading: "Billing period", file: "src/billing.ts" },
        ],
      },
    }),
  );

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "red",
      summary: "No doc update was required.",
    },
  });
});

test("the same lesson heading with a different file is a new conflict", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/invoice.ts"],
      commentedConflicts: [
        { lessonHeading: "Billing period", file: "src/billing.ts" },
      ],
      publishedDocs: {
        overview: "# What it does\n\nBilled yearly.\n\n# Entry points\n\nCall main.\n",
        architecture:
          "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        glossary: "none is shown\n",
      },
      lessons: "# Billing period\n\nBilled yearly.\n",
      files: {
        "src/billing.ts": 'export const period = "month";\n',
        "src/invoice.ts": 'export const period = "month";\n',
      },
      proposal: {
        files: {
          "docs/overview.md":
            "# What it does\n\nBilled monthly.\n\n# Entry points\n\nCall main.\n",
        },
        sections: [
          {
            path: "docs/overview.md",
            heading: "What it does",
            citation: { kind: "path", path: "src/invoice.ts" },
          },
        ],
        contradictions: [
          { lessonHeading: "Billing period", file: "src/billing.ts" },
          { lessonHeading: "Billing period", file: "src/invoice.ts" },
        ],
      },
    }),
  );

  assert.deepEqual(outcome, {
    invokeModel: false,
    check: {
      name: "DocAtlas",
      state: "red",
      summary: "What it does (src/invoice.ts)",
    },
    commit: {
      message: "docs: update for this pull request",
      files: [
        {
          path: "docs/overview.md",
          content: "# What it does\n\nBilled monthly.\n\n# Entry points\n\nCall main.\n",
        },
      ],
    },
    comment: {
      body: "Billing period contradicts src/invoice.ts",
    },
  });
});

test("when no named conflict remains, a clean proposal passes green", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/billing.ts"],
      commentedConflicts: [
        { lessonHeading: "Billing period", file: "src/billing.ts" },
      ],
      publishedDocs: {
        overview: "# What it does\n\nBilled yearly.\n\n# Entry points\n\nCall main.\n",
        architecture:
          "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        glossary: "none is shown\n",
      },
      lessons: "# Billing period\n\nBilled monthly.\n",
      files: {
        "src/billing.ts": 'export const period = "month";\n',
      },
      proposal: {
        files: {
          "docs/overview.md":
            "# What it does\n\nBilled monthly.\n\n# Entry points\n\nCall main.\n",
        },
        sections: [
          {
            path: "docs/overview.md",
            heading: "What it does",
            citation: { kind: "path", path: "src/billing.ts" },
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
      summary: "What it does (src/billing.ts)",
    },
    commit: {
      message: "docs: update for this pull request",
      files: [
        {
          path: "docs/overview.md",
          content: "# What it does\n\nBilled monthly.\n\n# Entry points\n\nCall main.\n",
        },
      ],
    },
  });
});

test("a lesson can add a claim the code does not mention, and that update stays green with no comment", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["docs/lessons.md"],
      publishedDocs: {
        overview: "# What it does\n\nServes files.\n\n# Entry points\n\nCall main.\n",
        architecture:
          "# Parts\n\nnone is shown\n\n# Relationships\n\nnone is shown\n\n# Data\n\nnone is shown\n",
        glossary: "none is shown\n",
      },
      lessons: "# Support hours\n\nPeople can write in on weekdays.\n",
      files: {
        "src/app.ts": "export function main() {}\n",
        "docs/lessons.md": "# Support hours\n\nPeople can write in on weekdays.\n",
      },
      proposal: {
        files: {
          "docs/overview.md":
            "# What it does\n\nPeople can write in on weekdays.\n\n# Entry points\n\nCall main.\n",
        },
        sections: [
          {
            path: "docs/overview.md",
            heading: "What it does",
            citation: { kind: "lesson", heading: "Support hours" },
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
      summary: "What it does (Support hours)",
    },
    commit: {
      message: "docs: update for this pull request",
      files: [
        {
          path: "docs/overview.md",
          content:
            "# What it does\n\nPeople can write in on weekdays.\n\n# Entry points\n\nCall main.\n",
        },
      ],
    },
  });
});

test("an ordinary doc update does not comment", () => {
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
            "# What it does\n\nServes published docs.\n\n# Entry points\n\nCall main.\n",
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
            "# What it does\n\nServes published docs.\n\n# Entry points\n\nCall main.\n",
        },
      ],
    },
  });
});
