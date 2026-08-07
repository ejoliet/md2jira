"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { markdownToJira } = require("../converter.js");

test("converts headings, emphasis, inline code, and links", function () {
  const markdown = [
    "# Build result",
    "",
    "**Status:** *passed* with `42 tests`.",
    "",
    "[Open report](https://example.test/report)",
  ].join("\n");

  assert.equal(
    markdownToJira(markdown),
    [
      "h1. Build result",
      "",
      "*Status:* _passed_ with {{42 tests}}.",
      "",
      "[Open report|https://example.test/report]",
    ].join("\n")
  );
});

test("converts fenced code and language aliases", function () {
  const markdown = ["```py", "print('hello')", "```"].join("\n");
  assert.equal(markdownToJira(markdown), "{code:python}\nprint('hello')\n{code}");
});

test("converts mixed nested lists and task items", function () {
  const markdown = [
    "1. Parent",
    "  - [x] Done",
    "  - [ ] Pending",
    "2. Next",
  ].join("\n");

  assert.equal(
    markdownToJira(markdown),
    ["# Parent", "#* ☑ Done", "#* ☐ Pending", "# Next"].join("\n")
  );
});

test("infers list depth from observed indentation instead of a fixed width", function () {
  const markdown = [
    "1. Parent",
    "    - Four-space child",
    "        1. Grandchild",
    "2. Next",
  ].join("\n");

  assert.equal(
    markdownToJira(markdown),
    ["# Parent", "#* Four-space child", "#*# Grandchild", "# Next"].join("\n")
  );
});

test("converts GitHub-style tables", function () {
  const markdown = [
    "| Item | State |",
    "|---|:---:|",
    "| Airflow | **Ready** |",
    "| Queue | `SQS` |",
  ].join("\n");

  assert.equal(
    markdownToJira(markdown),
    [
      "||Item||State||",
      "|Airflow|*Ready*|",
      "|Queue|{{SQS}}|",
    ].join("\n")
  );
});

test("converts quotes, horizontal rules, images, and setext headings", function () {
  const markdown = [
    "Overview",
    "========",
    "",
    "> Local-only conversion.",
    "> No upload.",
    "",
    "---",
    "",
    "![Architecture](https://example.test/architecture.png)",
  ].join("\n");

  assert.equal(
    markdownToJira(markdown),
    [
      "h1. Overview",
      "",
      "{quote}",
      "Local-only conversion.",
      "No upload.",
      "{quote}",
      "",
      "----",
      "",
      "!https://example.test/architecture.png|alt=Architecture!",
    ].join("\n")
  );
});

test("converts the attached migration document without leaking Markdown block syntax", function () {
  const fixturePath = process.env.MD2JIRA_FIXTURE;
  if (!fixturePath || !fs.existsSync(fixturePath)) {
    return;
  }

  const markdown = fs.readFileSync(fixturePath, "utf8");
  const output = markdownToJira(markdown);

  assert.match(output, /^h1\. Migration: S3-Triggered DAGs/m);
  assert.match(output, /\|\|Item\|\|State\|\|/);
  assert.match(output, /\{code:python\}/);
  assert.match(output, /# \*roman-cloud-airflow — deps:\*/);
  assert.doesNotMatch(output, /^```/m);
  assert.doesNotMatch(output, /^## /m);
});
