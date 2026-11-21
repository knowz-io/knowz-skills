export const meta = {
  name: 'build-review',
  description: 'Build one ready wave of KnowzCode scopes with TDD and audit each with a fresh reviewer',
  whenToUse: 'Optional Stage 2 fan-out for /knowzcode:work when the user asks for a workflow and a wave has many independent scopes with disjoint owned files. Never replaces a quality gate.',
  phases: [
    { title: 'Build', detail: 'one builder per scope, strict TDD' },
    { title: 'Audit', detail: 'one fresh independent reviewer per scope' },
  ],
}

// args shape (passed by the lead):
// {
//   wgid: "kc-feat-...",
//   baselineSha: "<pre-implementation commit>",
//   scopes: [{
//     id: "Authentication/token-expiry",
//     specPaths: ["knowzcode/specs/Authentication.md"],
//     criteria: ["VERIFY: ..."],
//     ownedFiles: ["src/auth/token.ts", "tests/auth/token.test.ts"],
//     notes: "optional advisor handoffs or prior checkpoint"
//   }]
// }

const BUILD_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['complete', 'partial', 'blocked'] },
    changedPaths: { type: 'array', items: { type: 'string' } },
    redEvidence: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          test: { type: 'string' },
          command: { type: 'string' },
          failingAssertion: { type: 'string' },
        },
        required: ['test', 'command', 'failingAssertion'],
      },
    },
    testsRun: { type: 'string' },
    handoffs: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['status', 'changedPaths', 'redEvidence', 'testsRun', 'summary'],
}

const AUDIT_SCHEMA = {
  type: 'object',
  properties: {
    clean: { type: 'boolean' },
    criteriaMet: { type: 'array', items: { type: 'string' } },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string' },
          file: { type: 'string' },
          expected: { type: 'string' },
          actual: { type: 'string' },
        },
        required: ['criterion', 'expected', 'actual'],
      },
    },
    securityFindings: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['clean', 'criteriaMet', 'gaps', 'summary'],
}

const input = args || {}
const scopes = Array.isArray(input.scopes) ? input.scopes : []
if (!input.wgid || !input.baselineSha || scopes.length === 0) {
  throw new Error('build-review needs args { wgid, baselineSha, scopes: [...] }')
}

// Refuse a wave whose scopes share a file: builders share the working tree.
const owners = new Map()
for (const scope of scopes) {
  for (const file of scope.ownedFiles || []) {
    if (owners.has(file)) {
      throw new Error(`File ${file} is owned by both ${owners.get(file)} and ${scope.id}; serialize those scopes`)
    }
    owners.set(file, scope.id)
  }
}

const list = (items) => (items || []).map((item) => `- ${item}`).join('\n')

const buildPrompt = (scope) => `Coordination Mode: named-agent
WorkGroup: ${input.wgid}
Scope: ${scope.id}
Spec path(s):
${list(scope.specPaths)}
Assigned acceptance criteria (implement only these):
${list(scope.criteria)}
Owned files (edit nothing else):
${list(scope.ownedFiles)}
Pre-implementation commit: ${input.baselineSha}
${scope.notes ? `Notes from the lead:\n${scope.notes}\n` : ''}
Implement this scope with strict TDD: write each failing test first, keep its failing run as RED evidence, then write the minimal code to pass. Run the narrow tests and targeted static checks for this scope. Do not stage or commit. Do not ask the user anything; if a spec is wrong or unclear, tag [SPEC_ISSUE], use your best judgment, and list the question under handoffs. Return status, every changed path, RED evidence for each new test, the tests you ran with their result, and a short summary.`

const auditPrompt = (scope, build) => `Coordination Mode: named-agent
WorkGroup: ${input.wgid}
Scope: ${scope.id}
Spec path(s):
${list(scope.specPaths)}
Assigned acceptance criteria (audit only these):
${list(scope.criteria)}
Owned files:
${list(scope.ownedFiles)}
Changed paths reported by the builder:
${list(build.changedPaths)}
Pre-implementation commit: ${input.baselineSha}

READ-ONLY independent audit. Do not modify any file. For each assigned criterion decide whether the code implements it and whether a passing test proves it. Report a gap for each criterion not met, with file, expected, and actual. Report a gap if a criterion was dropped, weakened, or substituted. Do not score criteria outside the assigned list.`

const results = await pipeline(
  scopes,
  (scope) =>
    agent(buildPrompt(scope), {
      label: `build:${scope.id}`,
      phase: 'Build',
      agentType: 'knowzcode:builder',
      schema: BUILD_SCHEMA,
    }),
  (build, scope) => {
    if (!build) return { scope: scope.id, build: null, audit: null }
    if (build.status !== 'complete') return { scope: scope.id, build, audit: null }
    return agent(auditPrompt(scope, build), {
      label: `audit:${scope.id}`,
      phase: 'Audit',
      agentType: 'knowzcode:reviewer',
      schema: AUDIT_SCHEMA,
    }).then((audit) => ({ scope: scope.id, build, audit }))
  }
)

const byScope = scopes.map((scope, index) => results[index] || { scope: scope.id, build: null, audit: null })
const clean = byScope.filter((r) => r.audit && r.audit.clean).map((r) => r.scope)
const needsWork = byScope.filter((r) => !(r.audit && r.audit.clean)).map((r) => r.scope)
log(`${clean.length}/${scopes.length} scopes audited clean`)
if (needsWork.length) log(`Needs lead follow-up: ${needsWork.join(', ')}`)

return { wgid: input.wgid, baselineSha: input.baselineSha, clean, needsWork, scopes: byScope }
