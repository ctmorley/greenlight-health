# Business Associate Agreement (BAA) Checklist

**HIPAA § 164.502(e), § 164.308(b) | SOC 2 CC2.3 | HITRUST 05.i**

BAAs must be executed with every entity that creates, receives, maintains, or transmits PHI on GreenLight's behalf — BEFORE any PHI is shared.

## Required BAAs

### Infrastructure (Execute before any PHI)

| Vendor | Service | BAA Status | Notes |
|--------|---------|------------|-------|
| **Microsoft Azure** | App Service, PostgreSQL, Key Vault, Blob Storage | [ ] Verify existing | Azure Enterprise/MCA agreements include BAA. Verify via Azure Portal → Cost Management → Properties |
| **GitHub** | Container Registry (GHCR) | [ ] Not needed | No PHI in container images (code only) |

### Current Vendors (Execute before migration from Vercel)

| Vendor | Service | BAA Status | Notes |
|--------|---------|------------|-------|
| **Vercel** | Current hosting | [ ] N/A | Migrating to Azure. No BAA on Hobby/Pro. |
| **Neon** | Current database | [ ] N/A | Migrating to Azure PostgreSQL. |

### Future Vendors (Execute before integration)

| Vendor | Service | BAA Status | Notes |
|--------|---------|------------|-------|
| **LLM Provider** | AI-powered audit/suggestions | [ ] Required | If any PHI enters LLM prompts. AWS Bedrock has BAA; direct API requires separate agreement |
| **Epic Systems** | Vendor Services Agreement | [ ] Required | For Epic Showroom listing. Includes data handling terms. |
| **Payer FHIR endpoints** | PAS electronic submission | [ ] Per payer | Each payer requires data exchange agreement for Claim/$submit |

## BAA Key Provisions Checklist

Every BAA must include:

- [ ] Permitted uses and disclosures of PHI
- [ ] Requirement to use appropriate safeguards
- [ ] Requirement to report breaches within 60 days
- [ ] Requirement to ensure subcontractors agree to same restrictions
- [ ] Authorization to terminate if BA violates material terms
- [ ] Return or destruction of PHI upon termination
- [ ] BA must make PHI available to satisfy individual access rights
- [ ] BA must make practices available to HHS for compliance review

## Annual Review

All BAAs must be reviewed:
- Annually at minimum
- When scope of services changes
- When subcontractors change
- When regulatory requirements change

**Last reviewed:** [DATE]
**Next review due:** [DATE + 1 year]
