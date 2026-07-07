import { reportExtensionReadiness } from '../core/extension-readiness.js'
import {
  compileExtensionProfileCatalog,
  ExtensionProfileCatalogValidationError,
} from '../core/extension-profile-catalog.js'
import { ExtensionContextPlanValidationError, planExtensionContext } from '../core/extension-context-plan.js'
import {
  ExtensionAdapterCompatibilityValidationError,
  validateExtensionAdapterCompatibility,
} from '../core/extension-adapter-compatibility.js'
import {
  NativeRetrofitProfileValidationError,
  validateNativeRetrofitProfile,
} from '../core/native-retrofit-profile-validation.js'
import type { CommandResult } from '../core/types.js'
import { ExitCode, issue } from '../core/types.js'
import type { CommandContext } from './shared.js'

export async function extensionsReportReadinessCommand(context: CommandContext): Promise<CommandResult> {
  try {
    const report = await reportExtensionReadiness(context.options.root, {
      projectProfile: context.options.projectProfile,
      extensionsDir: context.options.extensionsDir,
      output: context.options.output,
      markdown: context.options.markdown,
    })
    const blocked = report.status !== 'devview-extension-readiness-ready'
    const errorFindings = report.findings.filter((finding) => finding.severity === 'error')

    return {
      ok: !blocked,
      command: 'extensions report-readiness',
      exitCode: blocked ? ExitCode.ValidationFailed : ExitCode.Success,
      message: blocked
        ? 'Extension readiness is blocked before any extension execution.'
        : 'Extension readiness reported without executing extension code.',
      issues: blocked
        ? errorFindings.map((finding) =>
            issue({
              validator: 'ExtensionReadiness',
              code: finding.code,
              severity: finding.severity,
              message: finding.message,
              file: finding.path,
              reason: finding.field ? `Field: ${finding.field}` : undefined,
              suggestedFix:
                'Use a declarative DevView Project Profile and Extension Manifest with supported capability and permission declarations.',
            }),
          )
        : [],
      data: { ...report },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      command: 'extensions report-readiness',
      exitCode: ExitCode.ValidationFailed,
      message: 'Extension readiness could not run.',
      issues: [
        issue({
          validator: 'ExtensionReadiness',
          code: 'EXTENSION_READINESS_FAILED',
          severity: 'error',
          message,
          suggestedFix:
            'Write extension readiness output to a dedicated report path outside source/control artifacts and rerun the command.',
        }),
      ],
    }
  }
}

export async function extensionsCompileProfileCommand(context: CommandContext): Promise<CommandResult> {
  try {
    const report = await compileExtensionProfileCatalog(context.options.root, {
      projectProfile: context.options.projectProfile,
      extensionsDir: context.options.extensionsDir,
      extensionReadiness: context.options.extensionReadiness,
      output: context.options.output,
      markdown: context.options.markdown,
    })

    return {
      ok: true,
      command: 'extensions compile-profile',
      exitCode: ExitCode.Success,
      message: 'Extension profile catalog compiled without executing extension code.',
      issues: [],
      data: { ...report },
    }
  } catch (error) {
    if (error instanceof ExtensionProfileCatalogValidationError) {
      const report = error.report
      const errorFindings = report.findings.filter((finding) => finding.severity === 'error')
      return {
        ok: false,
        command: 'extensions compile-profile',
        exitCode: ExitCode.ValidationFailed,
        message: 'Extension profile catalog is blocked before any extension execution.',
        issues: errorFindings.map((finding) =>
          issue({
            validator: 'ExtensionProfileCatalog',
            code: finding.code,
            severity: finding.severity,
            message: finding.message,
            file: finding.path,
            reason: finding.field ? `Field: ${finding.field}` : undefined,
            suggestedFix:
              'Provide a ready extension readiness report and declarative manifests with supported permissions only.',
          }),
        ),
        data: { ...report },
      }
    }

    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      command: 'extensions compile-profile',
      exitCode: ExitCode.ValidationFailed,
      message: 'Extension profile catalog could not run.',
      issues: [
        issue({
          validator: 'ExtensionProfileCatalog',
          code: 'EXTENSION_PROFILE_CATALOG_FAILED',
          severity: 'error',
          message,
          suggestedFix:
            'Write extension catalog output to a dedicated report path outside source/control artifacts and rerun the command.',
        }),
      ],
    }
  }
}

export async function extensionsPlanContextCommand(context: CommandContext): Promise<CommandResult> {
  try {
    const report = await planExtensionContext(context.options.root, {
      extensionProfileCatalog: context.options.extensionProfileCatalog,
      viewTree: context.options.viewTree,
      contextPack: context.options.contextPack ?? context.options.contractInput,
      output: context.options.output,
      markdown: context.options.markdown,
    })

    return {
      ok: true,
      command: 'extensions plan-context',
      exitCode: ExitCode.Success,
      message: 'Extension context planning report generated without executing extension code.',
      issues: [],
      data: { ...report },
    }
  } catch (error) {
    if (error instanceof ExtensionContextPlanValidationError) {
      const report = error.report
      const errorFindings = report.findings.filter((finding) => finding.severity === 'error')
      return {
        ok: false,
        command: 'extensions plan-context',
        exitCode: ExitCode.ValidationFailed,
        message: 'Extension context planning is blocked before any extension execution.',
        issues: errorFindings.map((finding) =>
          issue({
            validator: 'ExtensionContextPlan',
            code: finding.code,
            severity: finding.severity,
            message: finding.message,
            file: finding.path,
            reason: finding.field ? `Field: ${finding.field}` : undefined,
            suggestedFix:
              'Provide a compiled extension profile catalog and optional valid View Tree / Context Pack sources.',
          }),
        ),
        data: { ...report },
      }
    }

    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      command: 'extensions plan-context',
      exitCode: ExitCode.ValidationFailed,
      message: 'Extension context plan could not run.',
      issues: [
        issue({
          validator: 'ExtensionContextPlan',
          code: 'EXTENSION_CONTEXT_PLAN_FAILED',
          severity: 'error',
          message,
          suggestedFix:
            'Write extension context plan output to a dedicated report path outside source/control artifacts and rerun the command.',
        }),
      ],
    }
  }
}

export async function extensionsValidateAdaptersCommand(context: CommandContext): Promise<CommandResult> {
  try {
    const report = await validateExtensionAdapterCompatibility(context.options.root, {
      extensionProfileCatalog: context.options.extensionProfileCatalog,
      extensionContextPlan: context.options.extensionContextPlan,
      runtimeEvidenceSatisfactionReadiness: context.options.runtimeEvidenceSatisfactionReadiness,
      equivalenceProofReadiness: context.options.equivalenceProofReadiness,
      scopeCiEnforcementReadiness: context.options.scopeCiEnforcementReadiness,
      output: context.options.output,
      markdown: context.options.markdown,
    })

    return {
      ok: true,
      command: 'extensions validate-adapters',
      exitCode: ExitCode.Success,
      message: 'Extension adapter compatibility validated without executing adapters or policy extensions.',
      issues: [],
      data: { ...report },
    }
  } catch (error) {
    if (error instanceof ExtensionAdapterCompatibilityValidationError) {
      const report = error.report
      const errorFindings = report.findings.filter((finding) => finding.severity === 'error')
      return {
        ok: false,
        command: 'extensions validate-adapters',
        exitCode: ExitCode.ValidationFailed,
        message: 'Extension adapter compatibility is blocked before any adapter execution.',
        issues: errorFindings.map((finding) =>
          issue({
            validator: 'ExtensionAdapterCompatibility',
            code: finding.code,
            severity: finding.severity,
            message: finding.message,
            file: finding.path,
            reason: finding.field ? `Field: ${finding.field}` : undefined,
            suggestedFix:
              'Provide a compiled extension profile catalog, generated extension context plan, and optional valid readiness sources.',
          }),
        ),
        data: { ...report },
      }
    }

    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      command: 'extensions validate-adapters',
      exitCode: ExitCode.ValidationFailed,
      message: 'Extension adapter compatibility validation could not run.',
      issues: [
        issue({
          validator: 'ExtensionAdapterCompatibility',
          code: 'EXTENSION_ADAPTER_COMPATIBILITY_FAILED',
          severity: 'error',
          message,
          suggestedFix:
            'Write adapter compatibility output to a dedicated report path outside source/control artifacts and rerun the command.',
        }),
      ],
    }
  }
}

export async function extensionsValidateNativeRetrofitProfileCommand(context: CommandContext): Promise<CommandResult> {
  try {
    const report = await validateNativeRetrofitProfile(context.options.root, {
      projectProfile: context.options.projectProfile,
      extensionProfileCatalog: context.options.extensionProfileCatalog,
      extensionAdapterCompatibilityReport: context.options.extensionAdapterCompatibilityReport,
      extensionContextPlan: context.options.extensionContextPlan,
      output: context.options.output,
      markdown: context.options.markdown,
    })

    return {
      ok: true,
      command: 'extensions validate-native-retrofit-profile',
      exitCode: ExitCode.Success,
      message: 'Native/Retrofit profile validation reported without executing extensions or external tooling.',
      issues: [],
      data: { ...report },
    }
  } catch (error) {
    if (error instanceof NativeRetrofitProfileValidationError) {
      const report = error.report
      const errorFindings = report.validationFindings.filter((finding) => finding.severity === 'error')
      return {
        ok: false,
        command: 'extensions validate-native-retrofit-profile',
        exitCode: ExitCode.ValidationFailed,
        message: 'Native/Retrofit profile validation is blocked before any execution.',
        issues: errorFindings.map((finding) =>
          issue({
            validator: 'NativeRetrofitProfileValidation',
            code: finding.code,
            severity: finding.severity,
            message: finding.message,
            file: finding.path,
            reason: finding.field ? `Field: ${finding.field}` : undefined,
            suggestedFix:
              'Provide a configured Project Profile, compiled extension catalog, validated adapter compatibility report, and optional generated context plan.',
          }),
        ),
        data: { ...report },
      }
    }

    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      command: 'extensions validate-native-retrofit-profile',
      exitCode: ExitCode.ValidationFailed,
      message: 'Native/Retrofit profile validation could not run.',
      issues: [
        issue({
          validator: 'NativeRetrofitProfileValidation',
          code: 'NATIVE_RETROFIT_PROFILE_VALIDATION_FAILED',
          severity: 'error',
          message,
          suggestedFix:
            'Write Native/Retrofit profile validation output to a dedicated report path outside source/control artifacts and rerun the command.',
        }),
      ],
    }
  }
}
