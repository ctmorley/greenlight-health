# GreenLight: Customer 1 Production Launch Plan

## Goal

Launch the first live PHI-handling customer safely on the current GreenLight codebase.

This is not a broad product roadmap. It is a go-live plan with explicit blockers, go/no-go gates, and rollout sequencing.

## Current Verified State

The following foundation work is already complete in the repo:

- RBAC enforcement on write routes
- Organization scoping on payer rule and PA routes
- Document storage moved to Azure Blob Storage with local fallback
- Invite/reset-token auth flow with transactional token handling
- PHI field encryption dual-write and dual-read across routes
- Patient search migrated from fuzzy plaintext search to blind-index exact match
- Clean `tsc` on `tsconfig.check.json`
- API test suite passing
- Production build passing

The biggest remaining product gap is still real payer connectivity. PA submission is currently simulated.

That said, simulated submission is not the only remaining blocker. Before onboarding a live PHI customer, GreenLight still needs:

- PHI encryption cutover completed in production
- Production operational visibility and recovery confidence
- At least one real submission path to a payer or clearinghouse
- Minimum HIPAA operational readiness
- A controlled customer-0 rollout plan

## Launch Gates

GreenLight is ready for the first live customer only when all five gates below are green.

| Gate | Meaning | Status |
|------|---------|--------|
| A | PHI plaintext cutover complete | Pending |
| B | Production operations ready | Pending |
| C | Real payer submission path working | Pending |
| D | Minimum compliance posture operational | Pending |
| E | Customer-0 dry run complete | Pending |

---

## Gate A — PHI Plaintext Cutover

**Priority:** P0  
**Risk:** Medium  
**Do not combine all steps into one release.**

This is the last step of the encryption migration. Dual-write and dual-read are already in place, so the remaining work is operational cutover.

### A1. Pre-flight

- Take a production database backup or snapshot
- Confirm the current release with dual-write and dual-read is deployed
- Confirm `PHI_ENCRYPTION_KEY` is production-grade and stored via Azure Key Vault or equivalent secret management

### A2. Backfill

- Run `npm run db:backfill-phi` against production
- Log row counts before and after
- Capture the exact app version and migration version used for the run

### A3. Validation

- Validate encrypted patient rows:
  - `SELECT count(*) FROM patients WHERE mrn_encrypted IS NULL OR first_name_encrypted IS NULL OR last_name_encrypted IS NULL;`
- Validate encrypted insurance rows:
  - `SELECT count(*) FROM patient_insurances WHERE member_id_encrypted IS NULL;`
- Validate blind-index population for lookup fields
- Spot-check a sample of production records through the app UI and API responses
- Confirm creates, updates, search, request submission, export, and FHIR matching still work on backfilled data

### A4. Plaintext-Off Release

- Deploy a code change that stops writing plaintext PHI columns
- Remove plaintext fallback reads from the crypto mappers
- Keep legacy plaintext columns in the database for one soak period after plaintext writes are disabled

### A5. Soak Period

- Observe production for at least several days under normal usage
- Watch for null decrypts, search misses, duplicate-MRN issues, export issues, and PAS assembly issues
- Keep a rollback plan ready for the app release

### A6. Destructive Cleanup

- After the soak period, ship a follow-up migration to:
  - drop plaintext PHI columns
  - remove the old `@@unique([organizationId, mrn])`
  - keep only hash-based lookup and uniqueness on encrypted fields

### Exit Criteria

- No plaintext PHI columns are written
- No plaintext fallback reads remain
- Backfill validation is complete
- Production has completed a successful soak period
- Plaintext columns are removed only after the above conditions hold

---

## Gate B — Production Operations Ready

**Priority:** P0  
**Risk:** Medium

The app needs to be supportable before live PHI onboarding. This is the minimum operational bar.

### B1. Health and Observability

- Add `GET /api/health`
  - app version
  - database connectivity
  - storage connectivity
  - critical secret/config presence
- Add structured JSON logging with request ID, user ID, organization ID, route, status code, and duration
- Wire Azure Application Insights or equivalent error telemetry into the app runtime
- Capture unhandled exceptions, failed background work, and 500s with enough context to debug

### B2. Alerting

- Configure alerts for:
  - app down / health check failing
  - spike in 5xx responses
  - failed document storage operations
  - failed email delivery for invite/reset flows
  - submission failures and status-poll failures

### B3. Backup and Recovery

- Confirm Azure Postgres backup configuration and retention
- Confirm Blob Storage recovery assumptions
- Run one restore drill into a non-production environment
- Document recovery steps and expected RTO/RPO

### B4. Release Discipline

- CI should run:
  - `npx tsc --noEmit -p tsconfig.check.json`
  - `npm run lint`
  - `npm run test:api`
  - `npm run build`
- Deployments should run `prisma migrate deploy`
- Add a staging slot or staging environment
- Define a smoke test checklist after each deployment

### B5. Production Basics

- Configure custom production domain
- Verify Resend domain and DKIM/SPF setup
- Confirm secrets are stored outside source control and rotated through Azure-native secret management

### Exit Criteria

- Health, logs, errors, and alerts are live
- Backups are confirmed and restore has been tested
- Deployment and rollback steps are documented and repeatable
- A staging deployment path exists

---

## Gate C — Real Submission Path

**Priority:** P0  
**Risk:** High  
**This is the biggest product blocker.**

GreenLight does not need every payer on day one. It does need one real submission path for the first customer's actual payer mix.

### C1. Narrow the Scope First

- Identify the first customer's top payers
- Decide which ones will go through:
  - clearinghouse 278
  - clearinghouse-assisted FHIR
  - direct FHIR PAS
  - manual fallback such as fax
- Do not build a generic multi-network abstraction before this decision is made

### C2. Payer Submission Registry

- Add payer-level configuration for:
  - submission method
  - clearinghouse payer ID
  - FHIR endpoint, if applicable
  - credentials reference
  - status inquiry method

### C3. First Live Adapter

- Build one real transport path for the first launch target
- Replace simulated submission in the live submission route
- Persist external submission identifiers and raw failure context
- Normalize transport responses into GreenLight's internal status model

### C4. Status Tracking

- Replace simulated status checks with real inquiry where supported
- Add manual retry / recheck support for operators
- Add polling only after the first live submission path is stable

### C5. Failure Handling

- Retry transient transport failures
- Surface hard failures clearly in the request timeline and admin UI
- Record enough detail for support without leaking secrets

### Exit Criteria

- At least one payer path works end-to-end in a real external environment
- GreenLight receives a real submission acknowledgment or status response
- Operators can see and retry failed submissions

---

## Gate D — Minimum Compliance Posture

**Priority:** P0 for live PHI  
**Risk:** Medium

This section is intentionally narrower than a full enterprise compliance roadmap. These items are the minimum needed before live PHI onboarding.

### D1. BAA and Subprocessor Review

- Verify Azure BAA coverage for every Azure service actually used in production
- Confirm whether any LLM provider receives PHI
  - if yes, execute the appropriate BAA or disable PHI-to-LLM flows before go-live
- Confirm whether email providers or other subprocessors receive PHI
  - invite/reset emails should avoid PHI wherever possible
- Maintain a written subprocessor list

### D2. HIPAA Operational Basics

- Complete a basic HIPAA risk assessment
- Finalize the incident response plan with real owners, contacts, and escalation paths
- Designate Security Officer and Privacy Officer responsibilities, even if both are currently the same person
- Document workforce access review and offboarding process
- Document minimum security training expectations for anyone with production access

### D3. Secrets and Access

- Review production admin access
- Review database and cloud-console access
- Confirm least-privilege service credentials where possible

### Exit Criteria

- Required BAAs for actual PHI subprocessors are in place
- HIPAA risk assessment is completed
- Incident response ownership is real, not placeholder text
- Production access model is documented

---

## Gate E — Customer-0 Dry Run and Launch

**Priority:** P0  
**Risk:** Medium

Before a real customer starts using the system, run the full workflow exactly the way support and operations will need to run it.

### E1. Internal Dry Run

- Create a staging organization that mirrors the first customer
- Configure their payers and submission paths
- Run one full workflow:
  - patient intake
  - insurance capture
  - document upload
  - prior auth creation
  - live submission
  - status update
  - denial/appeal flow if available

### E2. Launch Runbooks

- Onboarding runbook
- Failed submission runbook
- Password reset / account recovery runbook
- Incident escalation runbook
- Production rollback runbook

### E3. Controlled Pilot

- Start with one department or one narrow use case
- Manually review the first batch of real submissions
- Compare results against the customer's current workflow
- Expand only after the first batch is clean

### Exit Criteria

- The team has run the full flow in staging
- Support runbooks exist and are usable
- The first customer can be onboarded in a controlled, low-blast-radius pilot

---

## Not Required for Customer 1

These are valuable, but they should not be confused with first-customer go-live blockers unless a specific customer contract requires them.

- SOC 2 Type I
- SOC 2 Type II
- HITRUST
- Multi-clearinghouse support
- Broad EHR marketplace listings
- Full self-serve onboarding wizard
- AI autonomy v2
- Large-scale load testing

## Parallel Workstreams

These can run in parallel without blocking the first customer if the customer can operate GreenLight as a standalone workflow.

### EHR Connections

- Prioritize the first customer's actual EHR vendor
- Sandbox validation is useful early
- Marketplace approvals may take months and should not block a standalone pilot unless the customer requires embedded SMART launch on day one

### Enterprise Maturity

- SOC 2 program
- External pentest
- Additional monitoring depth
- Broader support tooling

---

## Recommended Execution Order

1. Finish Gate A through backfill, validation, plaintext-off release, and soak period.
2. Complete Gate B before any live PHI customer activity.
3. Narrow Gate C to one real payer path for the first customer and ship that path only.
4. Complete Gate D before any live customer PHI is processed in production.
5. Run Gate E as a customer-0 dry run, then start a narrow pilot.
6. Only after the pilot is stable, ship the destructive plaintext-drop migration from Gate A.

## Realistic Near-Term Timeline

| Workstream | Estimate | Notes |
|------------|----------|-------|
| Gate A backfill + validation + plaintext-off | 3-7 days | Includes soak period; do not compress into one release |
| Gate B operations readiness | 3-7 days | Faster if Azure resources already exist |
| Gate C first live submission path | 2-6+ weeks | Dominated by external onboarding and payer reality |
| Gate D compliance minimum | 1-3 weeks | Some items are documentation and legal turnaround |
| Gate E dry run + pilot launch | 1-2 weeks | Depends on customer responsiveness |

## Bottom Line

The critical path to a real first customer is:

**Gate A → Gate B → Gate C → Gate D → Gate E**

GreenLight is much closer than the original roadmap implied, but the remaining work is launch work, not feature work:

- finish PHI cutover safely
- make production supportable
- get one real submission path working
- close the minimum HIPAA operational loop
- launch through a controlled pilot
