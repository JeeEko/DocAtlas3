import assert from "node:assert/strict";
import { test } from "node:test";
import { decideRun } from "./run-decision.ts";
import { pullRequest } from "./pull-request-snapshot.ts";

const skipped = {
  invokeModel: false,
  check: {
    name: "DocAtlas",
    state: "green",
    summary: "No doc update was required.",
  },
};

test("a draft pull request does not invoke the model and does not fail DocAtlas", () => {
  const outcome = decideRun(
    pullRequest({
      draft: true,
      changedPaths: ["src/app.ts"],
    }),
  );

  assert.deepEqual(outcome, skipped);
});

const invokeModel = {
  invokeModel: true,
  check: {
    name: "DocAtlas",
    state: "pending",
    summary: "Invoke the model.",
  },
};

test("a pull request from a fork does not invoke the model and does not fail DocAtlas", () => {
  const outcome = decideRun(
    pullRequest({
      headInSameRepository: false,
      changedPaths: ["src/app.ts"],
    }),
  );

  assert.deepEqual(outcome, skipped);
});

test("a pull request aimed at a branch other than the watched branch does not invoke the model and does not fail DocAtlas", () => {
  const outcome = decideRun(
    pullRequest({
      baseBranch: "develop",
      changedPaths: ["src/app.ts"],
    }),
  );

  assert.deepEqual(outcome, skipped);
});

test("a pull request whose changed paths are all on the denylist stays green without a model call", () => {
  const paths = [
    "docs/overview.md",
    "docs/architecture.md",
    "docs/glossary.md",
    "package-lock.json",
    "packages/web/package-lock.json",
    "npm-shrinkwrap.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
    "Cargo.lock",
    "Gemfile.lock",
    "poetry.lock",
    "go.sum",
    "src/test/widget.ts",
    "src/tests/widget.ts",
    "src/__tests__/widget.ts",
    "src/widget_test.go",
    "src/widget.test.ts",
    "src/widget.spec.ts",
    ".github/workflows/ci.yml",
    ".cursor/rules/docs.mdc",
    "vendor/lib/foo.js",
    "node_modules/leftpad/index.js",
    "packages/app/node_modules/leftpad/index.js",
    "dist/app.js",
    "build/app.js",
    "out/app.js",
    "assets/screenshot.png",
    "assets/screenshot.jpg",
    "assets/screenshot.jpeg",
    "assets/screenshot.gif",
    "assets/screenshot.webp",
    "assets/icon.ico",
    "assets/font.woff2",
    "assets/font.ttf",
    "assets/font.otf",
    "assets/bundle.zip",
    "assets/bundle.tar.gz",
    "assets/bundle.tgz",
  ];

  for (const path of paths) {
    assert.deepEqual(
      decideRun(pullRequest({ changedPaths: [path] })),
      skipped,
      path,
    );
  }

  assert.deepEqual(
    decideRun(
      pullRequest({
        changedPaths: ["docs/overview.md", "package-lock.json", "src/widget.test.ts"],
      }),
    ),
    skipped,
  );
});

test("DocAtlas's own doc commit leaves a green check and does not commit again", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts", "docs/overview.md"],
      commits: [
        {
          message: "docs: update for this pull request",
          paths: ["docs/overview.md"],
        },
      ],
    }),
  );

  assert.deepEqual(outcome, skipped);
});

test("a push that includes more than DocAtlas's doc commit still asks for the model", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/app.ts", "docs/overview.md"],
      commits: [
        { message: "feat: add the entry point", paths: ["src/app.ts"] },
        {
          message: "docs: update for this pull request",
          paths: ["docs/overview.md"],
        },
      ],
    }),
  );

  assert.deepEqual(outcome, invokeModel);
});

test("the branch key retargets the watched branch", () => {
  assert.deepEqual(
    decideRun(
      pullRequest({
        baseBranch: "main",
        changedPaths: ["src/app.ts"],
        overrideFile: "branch: develop\n",
      }),
    ),
    skipped,
  );

  assert.deepEqual(
    decideRun(
      pullRequest({
        baseBranch: "develop",
        changedPaths: ["src/app.ts"],
        overrideFile: "branch: develop\n",
      }),
    ),
    invokeModel,
  );
});

test("overview, architecture, and glossary keys retarget the published docs", () => {
  const overrideFile = [
    "overview: guide/home.md",
    "architecture: guide/structure.md",
    "glossary: guide/terms.md",
    "",
  ].join("\n");

  for (const path of ["guide/home.md", "guide/structure.md", "guide/terms.md"]) {
    assert.deepEqual(
      decideRun(pullRequest({ changedPaths: [path], overrideFile })),
      skipped,
      path,
    );
  }

  for (const path of [
    "docs/overview.md",
    "docs/architecture.md",
    "docs/glossary.md",
  ]) {
    assert.deepEqual(
      decideRun(pullRequest({ changedPaths: [path], overrideFile })),
      invokeModel,
      path,
    );
  }
});

test("the lessons key retargets the lessons file and that file still wakes when ignored", () => {
  const overrideFile = ["lessons: notes/teach.md", "ignore:", "  - notes/**", ""].join(
    "\n",
  );

  assert.deepEqual(
    decideRun(
      pullRequest({
        changedPaths: ["notes/teach.md"],
        overrideFile,
      }),
    ),
    invokeModel,
  );

  assert.deepEqual(
    decideRun(
      pullRequest({
        changedPaths: ["notes/other.md"],
        overrideFile,
      }),
    ),
    skipped,
  );
});

test("a missing override key keeps its default", () => {
  const overrideFile = "branch: develop\n";

  assert.deepEqual(
    decideRun(
      pullRequest({
        baseBranch: "develop",
        changedPaths: ["docs/overview.md"],
        overrideFile,
      }),
    ),
    skipped,
  );
  assert.deepEqual(
    decideRun(
      pullRequest({
        baseBranch: "develop",
        changedPaths: ["docs/architecture.md"],
        overrideFile,
      }),
    ),
    skipped,
  );
  assert.deepEqual(
    decideRun(
      pullRequest({
        baseBranch: "develop",
        changedPaths: ["docs/glossary.md"],
        overrideFile,
      }),
    ),
    skipped,
  );
  assert.deepEqual(
    decideRun(
      pullRequest({
        baseBranch: "develop",
        changedPaths: ["docs/lessons.md"],
        overrideFile,
      }),
    ),
    invokeModel,
  );
  assert.deepEqual(
    decideRun(
      pullRequest({
        baseBranch: "develop",
        changedPaths: ["src/widget.test.ts"],
        overrideFile,
      }),
    ),
    skipped,
  );
  assert.deepEqual(
    decideRun(
      pullRequest({
        baseBranch: "main",
        changedPaths: ["src/app.ts"],
        overrideFile: "ignore:\n  - generated/**\n",
      }),
    ),
    invokeModel,
  );
});

test("an unrecognized override key is ignored", () => {
  const overrideFile = [
    "theme: dark",
    "custom:",
    "  - src/app.ts",
    "denylist: src/**",
    "branch: develop",
    "",
  ].join("\n");

  assert.deepEqual(
    decideRun(
      pullRequest({
        baseBranch: "main",
        changedPaths: ["src/app.ts"],
        overrideFile,
      }),
    ),
    skipped,
  );
  assert.deepEqual(
    decideRun(
      pullRequest({
        baseBranch: "develop",
        changedPaths: ["src/app.ts"],
        overrideFile,
      }),
    ),
    invokeModel,
  );
  assert.deepEqual(
    decideRun(
      pullRequest({
        baseBranch: "develop",
        changedPaths: ["docs/overview.md"],
        overrideFile,
      }),
    ),
    skipped,
  );
});

test("include wakes a path that ignore would also skip", () => {
  const overrideFile = [
    "ignore:",
    "  - src/hidden/**",
    "include:",
    "  - src/hidden/keep.ts",
    "",
  ].join("\n");

  assert.deepEqual(
    decideRun(
      pullRequest({
        changedPaths: ["src/hidden/keep.ts"],
        overrideFile,
      }),
    ),
    invokeModel,
  );
  assert.deepEqual(
    decideRun(
      pullRequest({
        changedPaths: ["src/hidden/drop.ts"],
        overrideFile,
      }),
    ),
    skipped,
  );
});

test("include wakes a path even when a denylist pattern would skip it", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["src/widget.test.ts"],
      overrideFile: "include:\n  - \"**/*.test.ts\"\n",
    }),
  );

  assert.deepEqual(outcome, invokeModel);
});

test("ignore adds denylist patterns", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["generated/api.ts"],
      overrideFile: "ignore:\n  - generated/**\n",
    }),
  );

  assert.deepEqual(outcome, skipped);
});

test("a change to the override file still asks for the model when ignore would skip it", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: [".docatlas.yml"],
      overrideFile: "ignore:\n  - .docatlas.yml\n",
    }),
  );

  assert.deepEqual(outcome, invokeModel);
});

test("a change to the override file asks the host to invoke the model", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: [".docatlas.yml"],
      overrideFile: "overview: guide/home.md\n",
    }),
  );

  assert.deepEqual(outcome, invokeModel);
});

test("a change to the lessons file asks the host to invoke the model", () => {
  const outcome = decideRun(
    pullRequest({
      changedPaths: ["docs/lessons.md"],
    }),
  );

  assert.deepEqual(outcome, invokeModel);
});

test("a changed path outside the denylist asks the host to invoke the model", () => {
  const outside = [
    "src/app.ts",
    "README.md",
    "docs/notes.md",
    "pkg/vendor/lib.js",
    "src/build/app.js",
    "src/dist/app.js",
    "src/out/app.js",
    "src/.github/workflows/ci.yml",
    "src/.cursor/rules/docs.mdc",
  ];

  for (const path of outside) {
    assert.deepEqual(
      decideRun(pullRequest({ changedPaths: [path] })),
      invokeModel,
      path,
    );
  }

  assert.deepEqual(
    decideRun(
      pullRequest({
        changedPaths: ["docs/overview.md", "src/app.ts"],
      }),
    ),
    invokeModel,
  );
});
