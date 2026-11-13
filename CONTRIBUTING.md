# Contributing

## Adding an explanation rule

The explanation standard is measured twice: the engine refuses a part that misses
it, and `tools/explain-check.mjs` tells the tutor the same verdict, so the two must
agree (`docs/engine.md`, "Explanation standard"). A rule is one file on each side,
one registry line on each side, and one test.

1. **Tool.** Create `tools/explain-check/rules/<id>.mjs` exporting
   `{ id, check(note, ctx) }`. `check` returns `{ ok, detail }`, or an array of
   rows when the rule reports several. Read the note through `note`
   (`tools/explain-check/nota.mjs` derives the shared views once). Add the import
   and the entry in `tools/explain-check/reglas.mjs`, at the place the rule belongs
   in the report.
2. **Engine.** Create `internal/engine/standard_<id>.go` with
   `func <name>Findings(text string, th rules.PartStandardThresholds) []string`
   (`_` for `-` in the file name). Add one entry to `standardRules` in
   `internal/engine/standard_rules.go`. The findings depend only on the note and
   the thresholds.
3. **Thresholds.** If the rule needs a number or a switch, declare it as an
   additive key in `thresholds.partStandard` (`rules/deep.json`), so a rules
   snapshot without it keeps the checks it had.
4. **Test.** One test per rule. The engine's goes in
   `internal/engine/standard_<id>_test.go`; the tool's goes in
   `tools/explain-check.test.mjs`, the file CI runs by name. A test that crosses
   the two verdicts on a fixture keeps them in step.

Then run `go test ./internal/engine -count=1` and
`node --test --test-force-exit tools/explain-check.test.mjs`.
`TestStandardRulesHaveTheirFiles` fails when a table entry has no file.

## Proving a refactor is byte-identical

Record the output before and after the change, over the same notes:

- **Engine.** `STANDARD_GOLDEN_FILES="$files" go test -count=1 -run TestStandardGoldenRecord -v ./internal/engine | grep ^GOLDEN`,
  where `$files` holds one absolute path per line. The recorder skips when the
  variable is unset.
- **Tool.** Run `node tools/explain-check.mjs <note> [--json]` and compare the
  output and the exit code. Capture `--json` through a pseudo-terminal
  (`script -qefc`): when stdout is a pipe, Node can drop the end of one large
  write (above 64 KiB), so a pipe can cut the JSON short.
