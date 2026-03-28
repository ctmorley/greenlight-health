# GreenLight Data Flow Diagram

**SOC 2 CC2.1 | HITRUST 06.d | Required for HIPAA Risk Assessment**

## System Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AZURE TRUST BOUNDARY                         │
│                    (BAA-covered, HIPAA-eligible)                     │
│                                                                     │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────┐  │
│  │  Azure App        │    │  Azure Database   │    │  Azure Key   │  │
│  │  Service          │◄──►│  for PostgreSQL   │    │  Vault       │  │
│  │  (Next.js 15)     │    │  (PHI at rest)    │    │  (Enc. keys) │  │
│  │                   │    │                   │    │              │  │
│  │  - API Routes     │    │  - Patients       │    │  - PHI_KEY   │  │
│  │  - CDS Hooks      │    │  - PA Requests    │    │  - AUTH_SEC  │  │
│  │  - SMART Launch   │    │  - Audit Logs     │    │              │  │
│  └─────────┬─────────┘    └──────────────────┘    └──────────────┘  │
│            │                                                         │
│  ┌─────────▼─────────┐    ┌──────────────────┐                      │
│  │  Azure Blob       │    │  Azure Monitor    │                      │
│  │  Storage           │    │  + App Insights   │                      │
│  │  (Clinical docs)   │    │  (Observability)  │                      │
│  └───────────────────┘    └──────────────────┘                      │
│                                                                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                     ┌─────────┴─────────┐
                     │    INTERNET        │
                     └─────────┬─────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
   ┌────▼────┐           ┌────▼────┐            ┌────▼────┐
   │ Browser │           │  EHR    │            │  Payer  │
   │ (User)  │           │ System  │            │  FHIR   │
   │         │           │ (Epic,  │            │  Server │
   │ - Login │           │  Oracle │            │         │
   │ - PA    │           │  etc.)  │            │ - PAS   │
   │   Wizard│           │         │            │   $sub  │
   │ - Dash  │           │ - SMART │            │ - Claim │
   └─────────┘           │   Launch│            │   Resp  │
                         │ - CDS   │            └─────────┘
                         │   Hooks │
                         └─────────┘
```

## Data Classification

| Data Type | Classification | Encryption | Retention | Access |
|-----------|---------------|------------|-----------|--------|
| Patient demographics | PHI | AES-256-GCM at rest, TLS in transit | Indefinite | Role-based |
| Clinical notes | PHI | AES-256-GCM at rest, TLS in transit | Indefinite | Role-based |
| PA request details | PHI | TLS in transit, DB encryption | Indefinite | Role-based + org-scoped |
| ICD-10/CPT codes | Clinical (not PHI alone) | TLS in transit | Indefinite | Role-based |
| Audit logs | Security metadata | TLS in transit | 6+ years | Admin only |
| FHIR context (session) | PHI (ephemeral) | TLS in transit, sessionStorage | 30 minutes | Current user only |
| User credentials | Sensitive | bcrypt hash (never stored plain) | Account lifetime | System only |
| Encryption keys | Critical | Azure Key Vault (HSM-backed) | Key rotation policy | System only |
| PAS Bundle/Response | PHI | TLS in transit, DB JSON field | With PA record | Role-based |

## PHI Data Flows

### Flow 1: Manual PA Submission
```
User Browser → [TLS] → Azure App Service → [internal] → PostgreSQL
                                          → [internal] → Blob Storage (docs)
                                          → [internal] → Audit Log
```

### Flow 2: EHR Launch (SMART on FHIR)
```
EHR System → [TLS] → /launch (OAuth 2.0 + PKCE)
           → [TLS] → EHR Auth Server (token exchange)
           → [TLS] → EHR FHIR Server (Patient, Coverage, etc.)
           → sessionStorage (browser, 30-min TTL)
           → [TLS] → /api/fhir/match-patient (server-side)
           → [internal] → PostgreSQL + Audit Log
```

### Flow 3: CDS Hooks (CRD)
```
EHR System → [TLS] → /api/cds-hooks/services/greenlight-pa-check
           → [internal] → PostgreSQL (ACR criteria, payer rules)
           → [TLS] → CDS Cards response (no PHI stored)
```

### Flow 4: Electronic PA Submission (PAS)
```
User Browser → [TLS] → /api/fhir/submit-pa
             → [internal] → PostgreSQL (assemble Bundle)
             → [TLS] → Payer FHIR Server (Claim/$submit)
             → [TLS] → ClaimResponse
             → [internal] → PostgreSQL (update status + audit)
```
