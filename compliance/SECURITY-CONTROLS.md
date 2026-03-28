# GreenLight Security Controls Implementation

## SOC 2 Type II + HITRUST CSF e1 Controls Mapping

This document maps GreenLight's implemented security controls to SOC 2 Trust Services Criteria (TSC) and HITRUST CSF e1 requirements. It serves as the primary evidence document for auditors.

---

## 1. Access Controls

### SOC 2: CC6.1, CC6.2, CC6.3 | HITRUST: 01.b, 01.c, 01.d

| Control | Implementation | Evidence |
|---------|---------------|----------|
| Authentication | NextAuth v5 with bcrypt password hashing, JWT sessions | `lib/auth.ts` |
| Role-based access | 4 roles: admin, pa_coordinator, physician, viewer | `prisma/schema.prisma` (UserRole enum) |
| Session management | JWT with configurable expiry, secure cookie flags | `lib/auth.config.ts` |
| Rate limiting | 10 req/15min on auth, 100 req/min API, 5 req/min submit | `lib/security/rate-limit.ts` |
| Brute-force protection | 5 failed login attempts per email per 15-minute window | `lib/auth.ts` (failedLoginAttempts) |
| Multi-tenancy isolation | All queries scoped to organizationId from JWT | All API routes |

### HIPAA § 164.312(a) — Access Control

- Unique user identification: Email-based accounts with cuid primary keys
- Emergency access procedure: Admin role can override role restrictions
- Automatic logoff: JWT expiry configured in auth.config.ts
- Encryption: AES-256-GCM for PHI at rest (`lib/security/encryption.ts`)

---

## 2. Audit Controls

### SOC 2: CC7.2, CC7.3 | HITRUST: 09.aa, 09.ab | HIPAA § 164.312(b)

| Control | Implementation | Evidence |
|---------|---------------|----------|
| PHI access logging | All API routes log PHI access with user, IP, timestamp | `lib/security/audit-log.ts` |
| Audit log model | Immutable append-only log with 13 indexed fields | `prisma/schema.prisma` (AuditLog) |
| Status change tracking | Full audit trail for all PA status transitions | `prisma/schema.prisma` (AuthStatusChange) |
| FHIR access logging | EHR launch sessions recorded with scopes and timestamps | `app/api/fhir/session/route.ts` |
| Login tracking | All login attempts (success + failure) logged | `lib/auth.ts` |
| Data retention | Audit logs retained for minimum 6 years (HIPAA requirement) | Database retention policy |

### Audit Log Fields (per entry):
- `userId`, `userEmail` — Who
- `action` — What (view, create, update, delete, export, fhir_read, etc.)
- `resourceType`, `resourceId` — Which record
- `ipAddress`, `userAgent` — From where
- `requestPath` — Which endpoint
- `phiAccessed` — Whether PHI was involved
- `metadata` — Additional context
- `createdAt` — When (immutable timestamp)

---

## 3. Transmission Security

### SOC 2: CC6.7 | HITRUST: 09.m | HIPAA § 164.312(e)

| Control | Implementation | Evidence |
|---------|---------------|----------|
| TLS enforcement | HSTS header with 2-year max-age, includeSubDomains, preload | `next.config.ts` |
| FHIR OAuth | OAuth 2.0 + PKCE (no client secret in browser) | `lib/fhir/smart-config.ts` |
| API security | All non-CDS-Hooks endpoints require JWT authentication | `middleware.ts` + API routes |
| CORS | Restricted to self + FHIR servers; CDS Hooks allow cross-origin | `next.config.ts` |

---

## 4. Encryption

### SOC 2: CC6.1, CC6.7 | HITRUST: 09.ac | HIPAA § 164.312(a)(2)(iv)

| Control | Implementation | Evidence |
|---------|---------------|----------|
| In transit | TLS 1.2+ enforced via HSTS | `next.config.ts` |
| At rest — passwords | bcrypt with salt rounds | `lib/auth.ts` |
| At rest — PHI | AES-256-GCM with authenticated encryption | `lib/security/encryption.ts` |
| Key management | Environment variable (Azure Key Vault in production) | `PHI_ENCRYPTION_KEY` env var |
| Key generation | Cryptographically secure 32-byte keys via `crypto.randomBytes` | `lib/security/encryption.ts` |

---

## 5. Input Validation & Application Security

### SOC 2: CC6.1 | HITRUST: 09.s, 10.b

| Control | Implementation | Evidence |
|---------|---------------|----------|
| Input validation | Zod schemas on all API endpoints | All `route.ts` files |
| SQL injection prevention | Prisma ORM with parameterized queries | `lib/prisma.ts` |
| XSS prevention | React auto-escaping + CSP headers | `next.config.ts` |
| Clickjacking prevention | X-Frame-Options: DENY + frame-ancestors 'none' | `next.config.ts` |
| MIME sniffing prevention | X-Content-Type-Options: nosniff | `next.config.ts` |
| Content Security Policy | Strict CSP with self-only defaults | `next.config.ts` |

---

## 6. Infrastructure Security

### SOC 2: CC6.6, CC6.7, CC6.8 | HITRUST: 09.j, 09.m

| Control | Implementation | Evidence |
|---------|---------------|----------|
| Container security | Non-root user in Docker (uid 1001) | `Dockerfile` |
| Health monitoring | Docker HEALTHCHECK + Azure App Insights | `Dockerfile` |
| Dependency scanning | npm audit in CI pipeline | `.github/workflows/ci-cd.yml` |
| Secret scanning | TruffleHog in CI pipeline | `.github/workflows/ci-cd.yml` |
| CI/CD pipeline | GitHub Actions: lint → build → security scan → deploy | `.github/workflows/ci-cd.yml` |
| Telemetry disabled | NEXT_TELEMETRY_DISABLED=1 (no data sent to Vercel/third parties) | `Dockerfile` |

---

## 7. Business Continuity

### SOC 2: A1.2, A1.3 | HITRUST: 12.a

| Control | Implementation | Evidence |
|---------|---------------|----------|
| Database backups | Azure PostgreSQL automated daily backups (35-day retention) | Azure configuration |
| Multi-AZ database | Azure Flexible Server zone-redundant HA | Azure configuration |
| Container registry | GHCR with immutable image tags (SHA-based) | `.github/workflows/ci-cd.yml` |
| Deployment rollback | Previous container image always available by SHA | CI/CD pipeline |

---

## 8. FHIR / EHR Integration Security

### Specific to healthcare integration compliance

| Control | Implementation | Evidence |
|---------|---------------|----------|
| SMART on FHIR OAuth 2.0 | PKCE flow, no client secrets in browser | `lib/fhir/smart-config.ts` |
| Scope minimization | Only requested scopes actually used | `lib/fhir/smart-config.ts` |
| FHIR session tracking | All EHR connections logged with vendor, scopes, timestamps | `app/api/fhir/session/route.ts` |
| EHR data ephemerality | FHIR context stored in sessionStorage (not persisted) | `lib/fhir/types.ts` (FHIR_CONTEXT_KEY) |
| CDS Hooks error handling | Never blocks clinician workflow (returns empty on error) | CDS Hooks route handlers |
| PAS audit trail | Full Bundle + ClaimResponse stored for compliance | `app/api/fhir/submit-pa/route.ts` |
| PHI in FHIR context | 30-minute expiry, cleared on session end | `use-fhir-context.ts` |

---

## Required Actions Before Production PHI

### Immediate (before any real patient data):
- [ ] Execute BAA with Azure (verify existing Enterprise/MCA BAA covers these services)
- [ ] Execute BAA with any LLM provider if PHI enters prompts
- [ ] Generate production PHI_ENCRYPTION_KEY and store in Azure Key Vault
- [ ] Enable Azure Defender for App Service and PostgreSQL
- [ ] Configure Azure Monitor alerts for security events
- [ ] Enable Azure PostgreSQL audit logging
- [ ] Complete HIPAA risk assessment
- [ ] Implement workforce training program
- [ ] Create incident response plan
- [ ] Designate HIPAA Security Officer and Privacy Officer

### SOC 2 Type II (start immediately, 6-12 month process):
- [ ] Engage audit firm (recommended: Vanta, Drata, or Secureframe for automation)
- [ ] Define trust services criteria scope (Security + Availability + Confidentiality)
- [ ] Begin observation period (minimum 3 months for Type II)
- [ ] Document all policies and procedures
- [ ] Conduct penetration testing (quarterly recommended)

### HITRUST CSF e1 (after SOC 2 Type I):
- [ ] Register with HITRUST Alliance
- [ ] Complete e1 self-assessment (44 essential controls)
- [ ] Engage HITRUST assessor
- [ ] Submit for certification
