# Review Result Gate Message Template

```text
[PBE 상태 보고]

현재 단계:
- state: WAITING_REVIEW_RESULT
- currentGate: review_result
- nextStep: review_result

방금 완료된 작업:
- ACEP 또는 Revision 실행 결과를 검토용으로 정리했습니다.
- Codex는 결과를 submitted_for_review 상태로 제출했습니다.
- accepted / accepted_done은 사용자만 줄 수 있습니다.

생성/갱신된 산출물:
- .pbe/review/codex-final-report.md
- .pbe/review/result-summary.md
- .pbe/review/validation-results.md
- .pbe/review/coverage-result.md
- .pbe/review/ui-ux-evidence.md
- .pbe/review/user-review-checklist.md
- .pbe/control/acceptance-tree.json
- .pbe/control/impact-tree.json
- .pbe/evidence/evidence-tree.json

검증:
- {validation_summary}

확인할 내용:
- 실행 결과
- 실패한 테스트 케이스
- coverage audit 결과
- UX audit 결과
- Evidence Tree 반영 상태
- Impact/Reopen 상태
- 남은 리스크
- 재실행이 필요한 항목

다음 동작:
- 승인하면 Acceptance Tree에 사용자 승인 기록을 남기고 Next Slice Decision gate로 이동합니다.
- 수정 요청이 있으면 feedback mapping -> Change Tree -> Impact Tree -> revision pack -> revision run 순서로 진행합니다.

사용자가 답할 수 있는 말:
- 승인: "결과 괜찮습니다", "승인합니다", "이 slice는 완료해도 됩니다"
- 수정: "실패한 케이스만 수정해서 다시 실행해주세요"
- 질문: "완료해도 되는 상태인지 판단해주세요"
- 중단: "중단해주세요"

추천 답변:
"결과 괜찮습니다. 다음 단계로 진행해주세요"
```

```text
[Codex 메모]

검토할 때는 passing 여부만 보지 말고, included Product/Work/Test node가 evidence와 연결되어 있는지 확인하세요.
Impact Tree에 reopened, invalidated, stale 항목이 남아 있으면 승인 대신 revision을 요청하는 것이 안전합니다.
```
