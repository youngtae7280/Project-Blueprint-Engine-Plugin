# Evidence Quality Checklist

## Target Evidence

## Linked Acceptance Criteria / Tests

| Evidence ID | Test ID | AC ID | Evidence Type | Strength |
| ----------- | ------- | ----- | ------------- | -------- |

## Quality Checks

- [ ] Evidence links to the Test it proves.
- [ ] Evidence links to the AC or observable result it supports.
- [ ] Evidence includes observable output, screenshot, doc excerpt, or manual result.
- [ ] Evidence type matches the work type.
- [ ] Evidence is specific enough for a reviewer to judge pass/fail.
- [ ] Evidence includes relevant input/condition/result where applicable.
- [ ] UI evidence includes screenshot or manual visual result.
- [ ] CLI evidence includes command output and expected pass result.
- [ ] Documentation evidence includes changed section or excerpt.
- [ ] Hardware/environment-limited evidence includes manual log, mock/fake result, or manual_not_verified blocker.
- [ ] Evidence timestamp/status/link is present when required.
- [ ] Evidence is not merely "confirmed", "passed", or "looks good".

## Weak Evidence Smell Check

Bad examples:

- "확인함"
- "테스트 통과"
- "문제 없음"
- "검색 기능 동작 확인"
- "UI 괜찮음"

Rewrite as:

- "Command output shows PASS for T-SEARCH-001, T-SEARCH-002."
- "Screenshot shows only Todo titles containing 'milk'."
- "Doc excerpt shows the sequential verification warning in docs/install.md."

## Remaining Evidence Risks
