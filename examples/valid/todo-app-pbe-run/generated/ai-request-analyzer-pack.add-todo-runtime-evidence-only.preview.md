# AI Request Analyzer Prompt Pack

Status: ai-request-analyzer-pack-generated

## Role

Produce Request IR Candidate JSON only. Do not validate it, execute it, or turn it into graph traversal, contract input, instruction packs, or Codex execution.

## Required Output Fields

- schemaId
- requestIrCandidateStatus
- sourceNaturalLanguageRequest
- requestText
- requestLanguage
- requestTypeCandidate
- changeTypeCandidate
- targetRecordIdCandidate
- targetComponentCandidate
- intentSummaryCandidate
- allowedScopeIntentCandidate
- forbiddenScopeIntentCandidate
- requiredEvidenceIntentCandidate
- riskIntentCandidate
- confidence
- ambiguities
- requiresClarification
- humanReviewRequired
- candidateOnly
- authorityStatus
- graphTraversalAllowed
- contractGenerationAllowed
- instructionPackGenerationAllowed

## Allowed Request Types

- runtime-evidence-only
- behavior-change
- bug-fix
- refactor
- documentation-only
- investigation-only
- unknown

## Candidate Boundary Fields

- requestIrCandidateStatus: "candidate-only"
- candidateOnly: true
- authorityStatus: "not-authoritative-until-validated"
- graphTraversalAllowed: false
- contractGenerationAllowed: false
- instructionPackGenerationAllowed: false

## Confidence And Ambiguity

- {"confidenceThresholdForValidation":{"low":"clarification-required-or-human-review-required","medium":"may-proceed-only-to-deterministic-validation","high":"still-requires-deterministic-validation-before-traversal"},"lowConfidenceHandling":"requires clarification or human review","unresolvedTargetMappingHandling":"human-review-required","mediumConfidenceBoundary":"medium confidence does not permit graph traversal or contract generation","highConfidenceBoundary":"high confidence still does not permit graph traversal until deterministic validation succeeds"}

## Safety Instructions

- Return Request IR Candidate JSON only; no prose and no execution instructions.
- Mark all analyzer-produced fields as candidate-only.
- Set requestIrCandidateStatus to "candidate-only".
- Set candidateOnly to true.
- Set authorityStatus to "not-authoritative-until-validated".
- Set graphTraversalAllowed, contractGenerationAllowed, and instructionPackGenerationAllowed to false.
- Use only the allowed request type taxonomy; use unknown plus clarification/human-review state for uncertainty.
- Never claim validation, graph authority, approval, runtime Evidence satisfaction, equivalence proof, scope enforcement, or CI enforcement.

## Forbidden Use

- treat AI analyzer output as validated Request IR
- drive graph traversal directly from analyzer output
- generate selected graph slices directly from analyzer output
- generate contract compiler input directly from analyzer output
- generate instruction packs directly from analyzer output
- trigger Codex execution
- mutate graph-source
- apply graph deltas
- record approval or human decisions
- claim runtime Evidence satisfaction
- prove equivalence
- enforce scope or CI
- call an LLM or API from this deterministic pack generator
- treat prompt-pack output as a Request IR Candidate
- claim validation, graph traversal authority, contract authority, execution authority, approval, or Evidence satisfaction

## Boundary

- This pack is not a Request IR Candidate.
- This pack does not call an LLM or API.
- This pack does not claim validation, approval, runtime Evidence satisfaction, equivalence proof, or enforcement.
- This pack does not trigger Codex execution.
- This AI Request Analyzer Prompt Pack is deterministic prompt/input contract preview only. It does not call an LLM, make network calls, generate a Request IR Candidate, validate Request IR, run graph traversal, generate selected graph slices, generate Contract Compiler Input, generate execution Instruction Packs, trigger Codex execution, mutate graph-source, apply graph deltas, approve work, record human decisions, satisfy runtime Evidence, prove equivalence, enforce scope, or configure CI.
