// Pipeline step tests using FAKE_LLM mode — exercises the real parsing/orchestration
// logic end-to-end without any network or API keys.
process.env.FAKE_LLM = "true";

const { test } = require("node:test");
const assert = require("node:assert");
const {
  identifyAbstractions,
  analyzeRelationships,
  orderChapters,
  orderChaptersHeuristic,
  writeChapter,
} = require("../services/aiService");

const files = [
  { path: "index.js", content: "const express = require('express');\napp.listen(3000);" },
  { path: "core.js", content: "function main() { return 42; }\nclass Engine {}" },
  { path: "utils.js", content: "module.exports = { helper: () => 1 };" },
];

test("identifyAbstractions parses FAKE_LLM JSON into valid abstractions", async () => {
  const abstractions = await identifyAbstractions(files, "demo", "Project: demo", () => {});
  assert.strictEqual(abstractions.length, 3);
  for (const a of abstractions) {
    assert.ok(a.name);
    assert.ok(a.description);
    assert.ok(Array.isArray(a.files));
    for (const idx of a.files) {
      assert.ok(idx >= 0 && idx < files.length, `file index ${idx} out of range`);
    }
  }
});

test("analyzeRelationships parses summary + relationships", async () => {
  const abstractions = [
    { name: "Entry Point", description: "d", files: [0] },
    { name: "Core Logic", description: "d", files: [1] },
    { name: "Utilities", description: "d", files: [2] },
  ];
  const result = await analyzeRelationships(abstractions, files, "demo", () => {});
  assert.ok(result.summary.includes("demo"));
  assert.ok(result.details.length >= 1);
  for (const rel of result.details) {
    assert.ok(rel.from >= 0 && rel.from < abstractions.length);
    assert.ok(rel.to >= 0 && rel.to < abstractions.length);
    assert.ok(rel.label);
  }
});

test("orderChaptersHeuristic returns every abstraction exactly once", () => {
  const abstractions = [
    { name: "Entry Point", description: "d", files: [0] },
    { name: "Core Logic", description: "d", files: [1] },
    { name: "Utilities", description: "d", files: [2] },
  ];
  const relationships = {
    summary: "s",
    details: [
      { from: 0, to: 1, label: "Uses" },
      { from: 1, to: 2, label: "Uses" },
    ],
  };
  const ordered = orderChaptersHeuristic(abstractions, relationships);
  assert.strictEqual(ordered.length, 3);
  assert.deepStrictEqual(new Set(ordered).size, 3);
});

test("orderChapters returns every abstraction exactly once", async () => {
  const abstractions = [
    { name: "Entry Point", description: "d", files: [0] },
    { name: "Core Logic", description: "d", files: [1] },
    { name: "Utilities", description: "d", files: [2] },
  ];
  const relationships = {
    summary: "s",
    details: [
      { from: 0, to: 1, label: "Uses" },
      { from: 1, to: 2, label: "Uses" },
    ],
  };
  const ordered = await orderChapters(abstractions, relationships, "demo", () => {});
  assert.strictEqual(ordered.length, 3);
  assert.deepStrictEqual(new Set(ordered).size, 3);
  ordered.forEach((idx) => assert.ok(idx >= 0 && idx < 3));
});

test("writeChapter returns a chapter with a proper heading", async () => {
  const abstraction = { name: "Entry Point", description: "d", files: [0] };
  const allChapters = [
    { name: "Entry Point" },
    { name: "Core Logic" },
    { name: "Utilities" },
  ];
  const content = await writeChapter(
    1,
    abstraction,
    files,
    "demo",
    allChapters,
    [],
    "Project: demo"
  );
  assert.ok(content.trim().startsWith("# Chapter 1: Entry Point"));
});