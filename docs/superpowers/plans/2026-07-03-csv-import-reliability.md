# CSV Import Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correctly import Excel-generated Chinese CSV files and add a downloadable user import template.

**Architecture:** A shared admin-side CSV utility owns byte decoding, standards-compliant parsing, header validation, and logical row numbering. Both import pages consume this utility; backend business validation and APIs stay unchanged.

**Tech Stack:** Vue 3, TypeScript, Papa Parse, Vitest, Element Plus

---

### Task 1: Shared CSV parser

**Files:**
- Create: `admin/src/utils/csv.ts`
- Create: `admin/src/utils/csv.test.ts`
- Modify: `admin/package.json`

- [ ] Write tests using the supplied failure characteristics: GB18030 bytes and quoted multiline cells must yield six logical records with rows 2-7.
- [ ] Run the tests and verify failure because the shared parser does not exist.
- [ ] Implement strict UTF-8 decoding with GB18030 fallback and Papa Parse record parsing.
- [ ] Validate empty and duplicate headers and expose actionable parse errors.
- [ ] Run parser tests and verify all pass.

### Task 2: Question import integration

**Files:**
- Modify: `admin/src/views/SelfQuestion.vue`

- [ ] Replace physical-line parsing with the shared parser.
- [ ] Preserve the existing API payload and result dialog.
- [ ] Verify the supplied CSV sends six records with logical rows 2-7.
- [ ] Import it into the active development batch and verify six successes.

### Task 3: User template and import integration

**Files:**
- Modify: `admin/src/views/User.vue`

- [ ] Add a `下载导入模板` button next to batch import.
- [ ] Generate a UTF-8 BOM CSV with the supported user-import headers and one complete example row; ignore only the unchanged example row during import.
- [ ] Replace the user page's comma splitting with the shared parser.
- [ ] Show an import-result dialog with success/failure totals and exact logical rows.

### Task 4: Verification

**Files:**
- Test: `admin/src/utils/csv.test.ts`
- Test: `scripts/integration-test.mjs`

- [ ] Run parser unit tests.
- [ ] Run `npm --prefix admin run build` and `npm --prefix backend run build`.
- [ ] Run `npm run test:integration` against the SSH-backed development database.
- [ ] Recheck the supplied CSV through the running local UI/API and confirm no production services or databases were touched.
