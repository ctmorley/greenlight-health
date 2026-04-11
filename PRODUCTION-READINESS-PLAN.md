# GreenLight: Customer 1 Production Launch Plan

**Last updated:** April 11, 2026
**Production URL:** https://greenlight.medivis.com
**Health status:** Healthy (200)

## Goal

Launch the first live PHI-handling customer safely on the current GreenLight codebase.

This is not a broad product roadmap. It is a go-live plan with explicit blockers, go/no-go gates, and rollout sequencing.

## Current Verified State

The following foundation work is complete and deployed to production:

- RBAC enforcement on write routes
- Organization scoping on payer rule and PA routes
- Document storage on Azure Blob Storage with local fallback
- Invite/reset-token auth flow with transactional token handling
- PHI field encryption: plaintext writes stopped, fallback reads removed, soak monitoring active
- Patient search migrated from fuzzy plaintext search to blind-index exact match
- Transport registry with simulated + EDI 278 adapters + Availity clearinghouse client
- EHR integration: SMART on FHIR, Da Vinci CRD/DTR/PAS, 6 vendor adapters
- Real-time eligibility endpoint (270/271) with clearinghouse + local fallback
- Application Insights (OpenTelemetry), structured logging on all API routes, request ID middleware
- Health endpoint with DB, storage, and secret probes
- Custom domain with TLS: greenlight.medivis.com
- CI/CD pipeline (GitHub Actions → Azure App Service zip deploy)
- Clean `tsc` on `tsconfig.check.json`
- 309 API tests passing across 26 files
- Production build passing
- Epic FHIR app registered (sandbox)

## Launch Gates

| Gate | Meaning | Status |
|------|---------|--------|
| A | PHI plaintext cutover complete | **Soaking** (since April 10) |
| B | Production operations ready | **Mostly done** (alerting + backup drill remain) |
| C | Real payer submission path working | **Blocked** (Availity MTPA in progress) |
| D | Minimum compliance posture operational | **In progress** (Vanta contract signed April 10) |
| E | Customer-0 dry run complete | Pending |

---

## Gate A — PHI Plaintext Cutover

**Priority:** P0
**Risk:** Medium
**Do not combine all steps into one release.**

### A1. Pre-flight — DONE

- [x] Production database on Azure Flexible Server with automated backups
- [x] Dual-write and dual-read deployed and stable
- [x] `PHI_ENCRYPTION_KEY` is production-grade, stored via Azure App Service settings
- [x] HKDF-derived separate encryption and blind-index subkeys

### A2. Backfill — DONE (April 10, 2026)

- [x] Ran `npm run db:backfill-phi` against production
- [x] Results: 50 patients encrypted, 66 insurances encrypted, 0 skipped
- [x] App version: commit `b1a62b2`, all 8 migrations applied

### A3. Validation — DONE (April 10, 2026)

- [x] Ran `npm run db:validate-phi` — all checks passed
- [x] All patients have required encrypted columns (mrnEncrypted, firstNameEncrypted, lastNameEncrypted, dobEncrypted)
- [x] All patients have required hash columns (mrnHash, firstNameHash, lastNameHash, dobHash)
- [x] All optional encrypted columns consistent (phone, email, address)
- [x] All insurances have memberIdEncrypted and memberIdHash
- [x] Spot-check: 10 patients and 10 insurances decrypted correctly against plaintext

### A4. Plaintext-Off Release — DONE (April 10, 2026)

- [x] All write paths stop writing plaintext PHI columns (patients POST, PATCH, fhir/match-patient)
- [x] Plaintext fallback reads removed from `decryptPatientRecord` and `decryptInsuranceRecord`
- [x] `[PHI-CRYPTO]` warning logs added for soak monitoring (backfill gaps surface as warnings)
- [x] MRN uniqueness check uses only `mrnHash` (plaintext fallback removed)
- [x] Request queue sort uses `lastNameHash` instead of plaintext `lastName`
- [x] Status-check notifications decrypt patient names before dispatch
- [x] Seed script updated to write encrypted fields only (post-cutover compatible)
- [x] Migration `20250409000000_phi_plaintext_nullable`: plaintext columns made nullable, `@@unique([organizationId, mrn])` dropped

### A5. Soak Period — IN PROGRESS

- [x] Soak started: April 10, 2026
- [ ] Monitor App Insights for `[PHI-CRYPTO]` warnings through ~April 14-17
- [ ] Verify: patient search, PA submission, CSV export, FHIR matching all work on encrypted-only data
- [ ] Confirm zero `[PHI-CRYPTO] Missing encrypted column` warnings for post-cutover rows
- [ ] Confirm zero `[PHI-CRYPTO] Decryption failed` errors
- Rollback plan: redeploy pre-cutover code; plaintext columns still exist with data

### A6. Destructive Cleanup — PENDING (after soak)

- [ ] Ship migration to drop plaintext PHI columns: `mrn`, `firstName`, `lastName`, `dob`, `phone`, `email`, `address` from patients; `memberId`, `groupNumber` from patient_insurances
- [ ] Keep only hash-based lookup and uniqueness on encrypted fields
- [ ] Target: ~April 17 if soak is clean

### Exit Criteria

- [x] No plaintext PHI columns are written
- [x] No plaintext fallback reads remain
- [x] Backfill validation is complete
- [ ] Production has completed a successful soak period
- [ ] Plaintext columns are removed after soak

---

## Gate B — Production Operations Ready

**Priority:** P0
**Risk:** Medium

### B1. Health and Observability — DONE

- [x] `GET /api/health` — checks DB connectivity, storage probe (upload/delete canary), secret presence
- [x] Returns `healthy`/`degraded`/`unhealthy` with HTTP 200/503
- [x] Detailed checks for authenticated callers (DB latency, storage latency, per-secret status)
- [x] Structured JSON logging (`lib/logger.ts`) on all API routes — zero `console.error` remaining
- [x] Azure Application Insights wired via `instrumentation.ts` (OpenTelemetry auto-captures HTTP traces)
- [x] Request ID middleware on all `/api/*` routes (`x-request-id` header)
- [x] `withRequestLogging` utility available for per-route structured logging
- [x] Success logging on PA submit and electronic submit routes (user ID, org ID, reference number)

### B2. Alerting — PENDING

- [ ] Configure Azure Monitor alerts for:
  - app down / health check failing
  - spike in 5xx responses
  - failed document storage operations
  - failed email delivery for invite/reset flows
  - submission failures and status-poll failures
  - `[PHI-CRYPTO]` warnings (soak monitoring)

### B3. Backup and Recovery — PENDING

- [ ] Confirm Azure Postgres backup configuration and retention
- [ ] Confirm Blob Storage recovery assumptions
- [ ] Run one restore drill into a non-production environment
- [ ] Document recovery steps and expected RTO/RPO

### B4. Release Discipline — MOSTLY DONE

- [x] CI runs: `tsc --noEmit`, `npm run lint`, `npm run test:api`, `npm run build`
- [x] GitHub Actions workflow with quality + security + deploy jobs
- [x] Prisma `binaryTargets` includes `debian-openssl-3.0.x` for Linux deployment
- [x] Deployment uses `prisma migrate deploy` for schema changes
- [ ] Set `AZURE_WEBAPP_PUBLISH_PROFILE` secret in GitHub repo for automated deploys
- [ ] Add staging slot or staging environment
- [ ] Define smoke test checklist after each deployment

### B5. Production Basics — MOSTLY DONE

- [x] Custom domain: `greenlight.medivis.com` with GeoTrust TLS certificate
- [x] HTTPS enforced (`httpsOnly: true`)
- [x] `alwaysOn` enabled (no cold starts)
- [x] Secrets stored in Azure App Service settings (not in source control)
- [ ] Resend domain DKIM/SPF setup for branded email delivery
- [ ] Key Vault references for secret rotation (currently using App Service settings directly)

### Exit Criteria

- [x] Health, logs, and error telemetry are live
- [ ] Alerting rules configured
- [ ] Backups confirmed and restore tested
- [x] Deployment steps are documented and repeatable
- [ ] A staging deployment path exists

---

## Gate C — Real Submission Path

**Priority:** P0
**Risk:** High
**This is the biggest product blocker — dominated by Availity onboarding timeline.**

### C1. Narrow the Scope First — IN PROGRESS

- [ ] Identify the first customer's top payers
- [ ] Decide submission method per payer (clearinghouse 278, FHIR PAS, fax fallback)
- [x] Architecture decision: clearinghouse EDI 278 via Availity for broad coverage

### C2. Payer Submission Registry — DONE

- [x] `PayerTransport` model with method enum (`fhir_pas`, `edi_278`, `rpa_portal`, `fax_manual`, `simulated`)
- [x] Environment-aware (`sandbox`/`production`), priority-ordered, org-scoped
- [x] `SubmissionAttempt` model with external IDs, failure categories, response tracking
- [x] `SubmissionApproval` model for human-review gating
- [x] Transport CRUD API + Settings UI
- [x] Credential resolver (`env://PREFIX` pattern, extensible to `keyvault://`)

### C3. First Live Adapter — DONE (code), BLOCKED (vendor)

- [x] `TransportAdapter` interface (validate/submit/checkStatus)
- [x] Simulated adapter (working end-to-end)
- [x] EDI 278 adapter with FHIR-to-clearinghouse request mapping
- [x] `ClearinghouseClient` interface (clearinghouse-agnostic)
- [x] Availity client: OAuth 2.0, async 278 submission with polling, status check
- [x] Eligibility check (270/271) via Availity coverages API with local fallback
- [x] Sandbox clearinghouse client for testing
- [x] 16 Availity client tests + 14 EDI 278 adapter tests
- [x] Availity developer account active (App ID 3171, org "Medivis")
- [ ] Availity Essentials registration submitted (application ID 63520634) — pending approval
- [ ] Availity MTPA agreement — sales introduction next week per Caleb Lombardo
- [ ] First real 278 submission end-to-end against Availity production

### C4. Status Tracking — DONE (code)

- [x] `PaStatusCheck` model with response codes, timing, status change tracking
- [x] Status checker dispatches through transport registry
- [x] Real transport adapters support `checkStatus` method
- [x] Manual check via `POST /api/requests/[id]/check-status`
- [ ] Replace simulated status checks with real inquiry when Availity is live

### C5. Failure Handling — DONE (code)

- [x] Failure classification: `network`, `auth`, `validation`, `timeout`, `payer_error`
- [x] Poll timeouts and payer errors correctly surface as failures (not masked as pending)
- [x] Submission attempts recorded with HTTP status, response code, failure category
- [x] Transport endpoint configuration flows through to clearinghouse client

### Exit Criteria

- [ ] At least one payer path works end-to-end in a real external environment
- [ ] GreenLight receives a real submission acknowledgment or status response
- [x] Operators can see and retry failed submissions

---

## Gate D — Minimum Compliance Posture

**Priority:** P0 for live PHI
**Risk:** Medium
**Vanta contract signed April 10, 2026.**

### D1. BAA and Subprocessor Review — PENDING

- [ ] Verify Azure BAA coverage for every Azure service used in production
- [ ] Confirm LLM PHI flow: does Claude receive PHI? (clinical text is de-identified via `lib/ai/de-identify.ts`, but this needs formal review)
- [ ] Confirm email providers do not receive PHI (invite/reset emails contain no PHI)
- [ ] Maintain written subprocessor list

### D2. HIPAA Operational Basics — IN PROGRESS

- [x] Compliance documentation exists: `compliance/SECURITY-CONTROLS.md`, `DATA-FLOW-DIAGRAM.md`, `BAA-CHECKLIST.md`, `INCIDENT-RESPONSE-PLAN.md`
- [x] Vanta contract signed — risk assessment tooling and policy generation in progress
- [ ] Complete HIPAA risk assessment via Vanta
- [ ] Finalize incident response plan with real owners, contacts, and escalation paths
- [ ] Designate Security Officer and Privacy Officer
- [ ] Document workforce access review and offboarding process
- [ ] Document minimum security training expectations

### D3. Secrets and Access — PARTIALLY DONE

- [x] Secrets stored in Azure App Service settings (not in source control)
- [x] Azure Key Vault provisioned
- [ ] Review production admin access (who has Azure portal access)
- [ ] Review database access (who can query production Postgres directly)
- [ ] Confirm least-privilege service credentials

### Exit Criteria

- [ ] Required BAAs for actual PHI subprocessors are in place
- [ ] HIPAA risk assessment is completed
- [ ] Incident response ownership is real, not placeholder text
- [ ] Production access model is documented

---

## Gate E — Customer-0 Dry Run and Launch

**Priority:** P0
**Risk:** Medium

### E1. Internal Dry Run — PENDING

- [ ] Create a staging organization mirroring the first customer
- [ ] Configure their payers and submission paths
- [ ] Run one full workflow:
  - patient intake
  - insurance capture
  - document upload
  - prior auth creation
  - live submission
  - status update
  - denial/appeal flow if available

### E2. Launch Runbooks — PENDING

- [ ] Onboarding runbook
- [ ] Failed submission runbook
- [ ] Password reset / account recovery runbook
- [ ] Incident escalation runbook
- [ ] Production rollback runbook

### E3. Controlled Pilot — PENDING

- [ ] Start with one department or one narrow use case
- [ ] Manually review the first batch of real submissions
- [ ] Compare results against the customer's current workflow
- [ ] Expand only after the first batch is clean

### Exit Criteria

- [ ] The team has run the full flow in staging
- [ ] Support runbooks exist and are usable
- [ ] The first customer can be onboarded in a controlled, low-blast-radius pilot

---

## EHR Integration Status

| Vendor | Registration | Adapter | Sandbox Testing |
|--------|-------------|---------|-----------------|
| Epic | App registered (client ID `3566fbff-...`), sandbox pending | Done | Pending activation |
| Oracle Health | Not registered | Done | Not started |
| athenahealth | Not registered | Done | Not started |
| Meditech | Not registered | Done | Not started |
| Veradigm | Not registered | Done | Not started |
| eClinicalWorks | Not registered | Done | Not started |

EHR connections are a parallel workstream. They do not block a standalone pilot unless the customer requires embedded SMART launch on day one.

---

## Not Required for Customer 1

These are valuable, but they should not be confused with first-customer go-live blockers unless a specific customer contract requires them.

- SOC 2 Type I / Type II
- HITRUST
- Multi-clearinghouse support
- Broad EHR marketplace listings
- Full self-serve onboarding wizard
- AI autonomy v2 (auto-submit + auto-appeal loops)
- Large-scale load testing
- External penetration testing

---

## Recommended Execution Order

1. ~~Finish Gate A through backfill, validation, plaintext-off release~~ — DONE
2. Let Gate A soak complete (~April 14-17), then ship A6 column drop
3. ~~Complete Gate B health, logging, and observability~~ — DONE
4. Finish Gate B alerting and backup drill
5. Narrow Gate C to first customer's payer mix when Availity MTPA is signed
6. Complete Gate D via Vanta before any live customer PHI is processed
7. Run Gate E as a customer-0 dry run, then start a narrow pilot

## Critical Path

```
Now ────── Gate A soak completes (~April 17) ─── A6 column drop
         │
         ├── Gate B alerting + backup (Azure config, ~1 day)
         │
         ├── Gate D compliance (Vanta, ~1-3 weeks)
         │
         └── Gate C Availity MTPA (~1-2 weeks) ── first real 278 ── Gate E dry run ── Pilot
```

**Shortest-path blockers (ordered by risk):**
1. **Availity MTPA approval** — longest lead time, sales introduction next week
2. **Vanta/compliance** — risk assessment + policy generation in progress
3. **Gate A soak** — completes ~April 17
4. **Customer-0 identification** — needed to scope Gate E

## Bottom Line

GreenLight is feature-complete and deployed at https://greenlight.medivis.com. The remaining work is operational:

- Let the PHI soak complete safely
- Get Availity production access
- Close the HIPAA compliance loop via Vanta
- Identify customer-0 and run the dry run
