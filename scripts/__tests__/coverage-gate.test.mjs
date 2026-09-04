import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import {
  changedCoverage,
  evaluateCoverage,
  parseChangedLines,
  selectBaseRef,
} from "../check-changed-coverage.mjs";

function fileCoverage({ hit = 1, branch = [1, 1] } = {}) {
  return {
    statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } } },
    s: { 0: hit },
    branchMap: { 0: { loc: { start: { line: 1, column: 0 } } } },
    b: { 0: branch },
    fnMap: { 0: { loc: { start: { line: 1, column: 0 } } } },
    f: { 0: hit },
  };
}

test("parses added lines from a zero-context Git diff", () => {
  const changed = parseChangedLines("+++ b/src/example.ts\n@@ -2,0 +3,2 @@\n+one\n+two");
  assert.deepEqual([...changed.get("src/example.ts")], [3, 4]);
});

test("measures changed executable lines and every branch arm", () => {
  const root = "/repo";
  const file = "src/example.ts";
  const result = changedCoverage(
    { [path.resolve(root, file)]: fileCoverage({ branch: [1, 0] }) },
    new Map([[file, new Set([1])]]),
    root
  );
  assert.deepEqual(result, {
    lines: 1,
    coveredLines: 1,
    branches: 2,
    coveredBranches: 1,
    missing: [],
  });
});

test("fails closed when a changed runtime file has no coverage record", () => {
  const result = evaluateCoverage({}, new Map([["src/runtime.ts", new Set([1])]]), "/repo");
  assert.equal(
    result.failures.some((failure) => failure.includes("src/runtime.ts")),
    true
  );
});

test("exempts explicitly identified type-only files", () => {
  const result = changedCoverage(
    {},
    new Map([["src/lib/contracts/capture.ts", new Set([1])]]),
    "/repo"
  );
  assert.deepEqual(result.missing, []);
});

test("selects a configured base distinct from HEAD and ignores an all-zero push SHA", () => {
  const refs = new Map([
    ["base", "a"],
    ["main", "b"],
    ["HEAD", "b"],
  ]);
  const git = (args) => {
    const ref = args.at(-1);
    if (!refs.has(ref)) throw new Error("missing");
    return refs.get(ref);
  };
  assert.equal(selectBaseRef(git, "base"), "base");
  assert.equal(selectBaseRef(git, "00000000000000000000"), undefined);
});
