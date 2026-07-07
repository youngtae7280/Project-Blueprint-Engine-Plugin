# Product Intake Interview Summary

## Raw User Request

Windows에서 validate:devview와 test:examples를 병렬 실행하면 clean-dist EPERM이 날 수 있다. 사용자가 검증 명령을
안전하게 실행하도록 문서에 순차 실행 권장을 추가해줘.

## Draft Product Tree Candidate

- 사용자는 local verification 명령을 안전한 순서로 실행해야 함을 알 수 있어야 한다.
- Windows 사용자는 validate/test 명령을 병렬 실행하지 말고 순차 실행해야 함을 알 수 있어야 한다.
- clean-dist EPERM이 발생했을 때 병렬 실행 가능성을 확인할 수 있어야 한다.

## Suggested First Slice

install/troubleshooting/cli-reference 문서에 sequential verification guidance 추가.

## Ambiguity / Missing Decisions

| ID         | Topic | Why it matters                                                     | Suggested question                                            |
| ---------- | ----- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| A-SELF-001 | Scope | Determines whether this is a docs-only slice or a script/code fix. | 이번 slice는 문서 보강만 하고, script/code 변경은 제외할까요? |

## Assumed User Response

예. 이번 slice는 문서 보강만 한다.

## Deferred / Out Of Scope

- clean-dist locking 코드 수정
- npm script 구조 변경
- CI workflow 변경
- cross-platform lock 구현
- test runner 병렬성 제어

## Recommended Single Question

이번 slice는 문서 보강만 하고, script/code 변경은 제외할까요?

## Confirmation Needed

The docs-only slice is treated as confirmed for this example after the assumed user response above.

## Next CLI Command

`devview rpd check`
