const CODES = {
  productName: [
    80, 114, 111, 106, 101, 99, 116, 32, 66, 108, 117, 101, 112, 114, 105, 110, 116, 32, 69, 110, 103, 105, 110, 101,
  ],
  productAcronymUpper: [80, 66, 69],
  productAcronymLower: [112, 98, 101],
  productIntakeAcronym: [82, 80, 68],
  workPlanningAcronym: [87, 80, 68],
  verificationDesignAcronym: [86, 68],
  executionPackAcronym: [65, 67, 69, 80],
}

export const RETIRED_PRODUCT_NAME = textFromCodes(CODES.productName)
export const RETIRED_PRODUCT_ACRONYM_UPPER = textFromCodes(CODES.productAcronymUpper)
export const RETIRED_PRODUCT_ACRONYM_LOWER = textFromCodes(CODES.productAcronymLower)
export const RETIRED_STORAGE_ROOT = `.${RETIRED_PRODUCT_ACRONYM_LOWER}`
export const RETIRED_PRODUCT_INTAKE_ACRONYM = textFromCodes(CODES.productIntakeAcronym)
export const RETIRED_WORK_PLANNING_ACRONYM = textFromCodes(CODES.workPlanningAcronym)
export const RETIRED_VERIFICATION_DESIGN_ACRONYM = textFromCodes(CODES.verificationDesignAcronym)
export const RETIRED_EXECUTION_PACK_ACRONYM = textFromCodes(CODES.executionPackAcronym)

export interface RetiredTermPattern {
  id: string
  pattern: RegExp
}

export function createRetiredTermPatterns(): RetiredTermPattern[] {
  return [
    { id: 'retired-product-name', pattern: new RegExp(escapeRegExp(RETIRED_PRODUCT_NAME), 'g') },
    { id: 'retired-product-acronym-upper', pattern: retiredWordPattern(RETIRED_PRODUCT_ACRONYM_UPPER) },
    { id: 'retired-product-acronym-lower', pattern: retiredWordPattern(RETIRED_PRODUCT_ACRONYM_LOWER) },
    { id: 'retired-storage-root', pattern: new RegExp(escapeRegExp(RETIRED_STORAGE_ROOT), 'g') },
    { id: 'retired-product-intake-acronym', pattern: retiredWordPattern(RETIRED_PRODUCT_INTAKE_ACRONYM) },
    { id: 'retired-work-planning-acronym', pattern: retiredWordPattern(RETIRED_WORK_PLANNING_ACRONYM) },
    { id: 'retired-verification-design-acronym', pattern: retiredWordPattern(RETIRED_VERIFICATION_DESIGN_ACRONYM) },
    { id: 'retired-execution-pack-acronym', pattern: retiredWordPattern(RETIRED_EXECUTION_PACK_ACRONYM) },
  ]
}

export function createRetiredCombinedPattern(): RegExp {
  return new RegExp(
    [
      escapeRegExp(RETIRED_PRODUCT_ACRONYM_UPPER),
      escapeRegExp(RETIRED_PRODUCT_NAME),
      retiredWordSource(RETIRED_PRODUCT_ACRONYM_LOWER),
      escapeRegExp(RETIRED_STORAGE_ROOT),
    ].join('|'),
    'g',
  )
}

export function retiredWorkflowStatePrefixes(): string[] {
  return [
    `${RETIRED_PRODUCT_INTAKE_ACRONYM}_`,
    `${RETIRED_WORK_PLANNING_ACRONYM}_`,
    `${RETIRED_VERIFICATION_DESIGN_ACRONYM}_`,
    `${RETIRED_EXECUTION_PACK_ACRONYM}_`,
  ]
}

export function retiredWorkflowAcronyms(): string[] {
  return [
    RETIRED_PRODUCT_INTAKE_ACRONYM,
    RETIRED_WORK_PLANNING_ACRONYM,
    RETIRED_VERIFICATION_DESIGN_ACRONYM,
    RETIRED_EXECUTION_PACK_ACRONYM,
  ]
}

function retiredWordPattern(value: string): RegExp {
  return new RegExp(retiredWordSource(value), 'g')
}

function retiredWordSource(value: string): string {
  return `\\b${escapeRegExp(value)}\\b`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function textFromCodes(codes: number[]): string {
  return String.fromCharCode(...codes)
}
