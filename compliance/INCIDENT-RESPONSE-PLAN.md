# GreenLight Incident Response Plan

**HIPAA § 164.308(a)(6) | SOC 2 CC7.3, CC7.4 | HITRUST 11.a**

## 1. Scope

This plan covers security incidents and breaches involving Protected Health Information (PHI) processed by GreenLight. A "breach" is defined per HIPAA as unauthorized acquisition, access, use, or disclosure of unsecured PHI that compromises its security or privacy.

## 2. Incident Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| **P1 Critical** | Confirmed PHI breach, active intrusion, data exfiltration | 1 hour | Unauthorized database access, stolen credentials with PHI access |
| **P2 High** | Potential PHI exposure, system compromise without confirmed breach | 4 hours | Suspicious login patterns, vulnerability exploited, misconfigured access |
| **P3 Medium** | Security event without PHI risk | 24 hours | Failed brute-force attacks, non-PHI data exposure, dependency vulnerability |
| **P4 Low** | Policy violation, minor security improvement | 72 hours | Missing audit log entry, expired certificate, configuration drift |

## 3. Response Team

| Role | Responsibility |
|------|---------------|
| **Incident Commander** | Overall coordination, stakeholder communication, regulatory decisions |
| **Security Engineer** | Technical investigation, containment, forensics |
| **HIPAA Privacy Officer** | Breach determination, patient notification, HHS reporting |
| **HIPAA Security Officer** | Risk assessment, control remediation, policy updates |
| **Legal Counsel** | Regulatory guidance, notification requirements, liability assessment |

## 4. Response Phases

### Phase 1: Detection & Triage (0-1 hour)
1. Alert received via Azure Monitor, audit log anomaly, or user report
2. On-call engineer assesses severity level
3. If P1/P2: Activate incident response team immediately
4. Create incident record with: time detected, who detected, initial assessment

### Phase 2: Containment (1-4 hours)
1. Isolate affected systems (revoke tokens, block IPs, disable accounts)
2. Preserve forensic evidence (database snapshots, audit logs, container images)
3. Assess blast radius: which patients, which data, which time period
4. Implement temporary controls to prevent further exposure

### Phase 3: Investigation (4-48 hours)
1. Review audit logs: `SELECT * FROM audit_logs WHERE created_at BETWEEN ... AND ...`
2. Review auth status changes for affected PA requests
3. Check FHIR session logs for unauthorized EHR access
4. Determine root cause and full scope of exposure
5. Document findings in incident record

### Phase 4: Breach Determination (within 48 hours)
Per HIPAA, determine if the incident constitutes a breach by assessing:
1. Nature and extent of PHI involved (types, identifiers)
2. Unauthorized person who used/received the PHI
3. Whether PHI was actually acquired or viewed
4. Extent to which risk has been mitigated

### Phase 5: Notification (if breach confirmed)
**HIPAA notification requirements:**
- **Individuals**: Written notice within 60 days of discovery
- **HHS**: Report via hhs.gov/hipaa breach portal
  - Breaches affecting 500+ individuals: within 60 days
  - Breaches affecting <500 individuals: annual log submission
- **Media**: If breach affects 500+ residents of a state/jurisdiction
- **Business Associates**: Notify covered entities within 60 days

### Phase 6: Remediation
1. Implement permanent fix for root cause
2. Update security controls and monitoring
3. Conduct post-incident review (blameless retrospective)
4. Update this plan based on lessons learned
5. Retrain workforce if applicable

## 5. Contact Information

| Contact | Name | Phone | Email |
|---------|------|-------|-------|
| Incident Commander | [TBD] | [TBD] | [TBD] |
| Security Engineer | [TBD] | [TBD] | [TBD] |
| HIPAA Privacy Officer | [TBD] | [TBD] | [TBD] |
| Legal Counsel | [TBD] | [TBD] | [TBD] |
| Azure Support | N/A | N/A | Azure Portal |

## 6. Annual Testing

This plan must be tested at minimum annually via:
- Tabletop exercise simulating a PHI breach scenario
- Review and update of all contact information
- Verification that detection systems are operational
- Review of response time targets vs. actual performance

**Last reviewed:** [DATE]
**Next review due:** [DATE + 1 year]
