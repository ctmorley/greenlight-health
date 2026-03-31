/**
 * Mock data factories.
 *
 * Each factory returns a plain object matching the Prisma model shape.
 * Pass overrides to customize fields per-test.
 */

let counter = 0;
function uid() {
  counter++;
  return `test-${counter}-${Date.now()}`;
}

// Reset counter between test files
export function resetFactoryCounter() {
  counter = 0;
}

// ─── Organization ────────────────────────────────────────────

export function createMockOrg(overrides: Record<string, unknown> = {}) {
  const id = uid();
  return {
    id,
    name: `Test Org ${id}`,
    type: "imaging_center" as const,
    npi: null,
    taxId: null,
    address: null,
    phone: null,
    fax: null,
    email: null,
    settings: null,
    stripeCustomerId: null,
    subscriptionId: null,
    subscriptionStatus: "active",
    planId: "starter",
    planPeriodEnd: null,
    trialEndsAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── User ────────────────────────────────────────────────────

export function createMockUser(overrides: Record<string, unknown> = {}) {
  const id = uid();
  return {
    id,
    organizationId: "org-1",
    email: `user-${id}@test.com`,
    passwordHash: "$2a$12$hashedpassword",
    firstName: "Test",
    lastName: "User",
    role: "admin" as const,
    title: null,
    npiNumber: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Session (NextAuth-compatible) ──────────────────────────

export function createMockSession(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: "user-1",
      email: "admin@test.com",
      name: "Test Admin",
      role: "admin",
      organizationId: "org-1",
      organizationName: "Test Org",
      ...overrides,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

// ─── Patient ─────────────────────────────────────────────────

export function createMockPatient(overrides: Record<string, unknown> = {}) {
  const id = uid();
  return {
    id,
    organizationId: "org-1",
    mrn: `MRN-${id}`,
    firstName: "John",
    lastName: "Doe",
    dob: new Date("1985-03-15"),
    gender: "male" as const,
    phone: "555-0100",
    email: "john.doe@test.com",
    address: "123 Main St",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Patient Insurance ───────────────────────────────────────

export function createMockInsurance(overrides: Record<string, unknown> = {}) {
  const id = uid();
  return {
    id,
    patientId: "patient-1",
    payerId: "payer-1",
    planName: "Gold PPO",
    planType: "ppo" as const,
    memberId: `MEM-${id}`,
    groupNumber: "GRP-001",
    isPrimary: true,
    effectiveDate: new Date("2024-01-01"),
    terminationDate: null,
    ...overrides,
  };
}

// ─── Payer ───────────────────────────────────────────────────

export function createMockPayer(overrides: Record<string, unknown> = {}) {
  const id = uid();
  return {
    id,
    name: `Test Payer ${id}`,
    payerId: `PAYER-${id}`,
    type: "commercial" as const,
    phone: "800-555-0100",
    fax: "800-555-0101",
    portalUrl: "https://portal.testpayer.com",
    electronicSubmission: true,
    avgResponseDays: 5,
    rbmVendor: null,
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  };
}

// ─── Payer Rule ──────────────────────────────────────────────

export function createMockPayerRule(overrides: Record<string, unknown> = {}) {
  const id = uid();
  return {
    id,
    payerId: "payer-1",
    serviceCategory: "imaging" as const,
    cptCode: "70553",
    requiresPA: true,
    clinicalCriteria: null,
    validFrom: new Date("2024-01-01"),
    validTo: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ─── Prior Auth Request ──────────────────────────────────────

export function createMockRequest(overrides: Record<string, unknown> = {}) {
  const id = uid();
  return {
    id,
    organizationId: "org-1",
    patientId: "patient-1",
    createdById: "user-1",
    assignedToId: null,
    referenceNumber: `GL-20260330-${id.slice(-5).padStart(5, "0")}`,
    status: "draft" as const,
    urgency: "routine" as const,
    serviceCategory: "imaging" as const,
    serviceType: "mri" as const,
    cptCodes: ["70553"],
    icd10Codes: ["M54.5"],
    procedureDescription: "MRI of lumbar spine",
    payerId: "payer-1",
    insuranceId: "ins-1",
    rbmVendor: null,
    rbmReferenceNumber: null,
    orderingPhysicianId: null,
    renderingPhysicianNpi: null,
    facilityName: "Test Imaging Center",
    scheduledDate: new Date("2026-04-15"),
    dueDate: new Date("2026-04-10"),
    clinicalNotes: "Patient presents with chronic low back pain.",
    aiAuditResult: null,
    draftMetadata: null,
    submittedAt: null,
    decidedAt: null,
    expiresAt: null,
    approvedUnits: null,
    approvedCptCodes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Auth Document ───────────────────────────────────────────

export function createMockDocument(overrides: Record<string, unknown> = {}) {
  const id = uid();
  return {
    id,
    priorAuthId: "req-1",
    uploadedById: "user-1",
    fileName: "clinical-notes.pdf",
    fileType: "application/pdf",
    filePath: `uploads/org-1/req-1/${id}.pdf`,
    fileSize: 1024,
    category: "clinical_notes" as const,
    createdAt: new Date(),
    ...overrides,
  };
}

// ─── Auth Status Change ──────────────────────────────────────

export function createMockStatusChange(overrides: Record<string, unknown> = {}) {
  const id = uid();
  return {
    id,
    priorAuthId: "req-1",
    changedById: "user-1",
    fromStatus: "draft" as const,
    toStatus: "draft" as const,
    note: "PA request created as draft",
    metadata: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ─── Denial ──────────────────────────────────────────────────

export function createMockDenial(overrides: Record<string, unknown> = {}) {
  const id = uid();
  return {
    id,
    priorAuthId: "req-1",
    denialDate: new Date(),
    reasonCode: "MN001",
    reasonCategory: "medical_necessity" as const,
    reasonDescription: "Does not meet medical necessity criteria",
    payerNotes: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ─── Appeal ──────────────────────────────────────────────────

export function createMockAppeal(overrides: Record<string, unknown> = {}) {
  const id = uid();
  return {
    id,
    priorAuthId: "req-1",
    denialId: "denial-1",
    appealLevel: "first" as const,
    filedDate: new Date(),
    filedById: "user-1",
    appealReason: "The patient meets clinical criteria for this procedure based on documented symptoms.",
    status: "filed" as const,
    decisionDate: null,
    decisionNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
