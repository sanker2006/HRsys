# CSV Import Reliability Design

## Goal

Make question and user CSV imports behave like spreadsheet imports: support Excel-saved GBK/GB18030 files, quoted multiline cells, and error rows based on logical spreadsheet rows.

## Design

- Decode file bytes as strict UTF-8 first, then fall back to GB18030.
- Parse the complete decoded document with a standards-compliant CSV parser. Never split records on physical newlines.
- Convert parsed records to objects only after validating the header row. Attach `__row` using the logical CSV record index so user-facing errors match spreadsheet rows.
- Reuse the same parser in question and user imports.
- Generate UTF-8 BOM templates so Excel opens Chinese headers correctly.
- Add a user import template with headers: 姓名、工号、部门、岗位、角色、手机号、身份证后四位、状态、负责部门, plus one complete example row. The unchanged example row is ignored before import.

## Error Handling

- Empty files, malformed CSV, duplicate headers, and unsupported encodings produce actionable Chinese messages before any API call.
- Backend business validation remains authoritative for employee number, name, department, question totals, and role rules.
- Import result dialogs show logical row numbers and all row-specific errors.

## Verification

- Automated parser tests cover UTF-8 BOM, GB18030, quoted multiline cells, commas, escaped quotes, blank rows, and duplicate headers.
- The supplied six-row CSV must parse as six records numbered 2 through 7 and import successfully into the active development batch.
- Build backend and admin, then regress the existing integration test.
