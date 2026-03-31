/**
 * Test database setup/teardown utilities.
 *
 * These utilities connect to a real PostgreSQL test database via Prisma.
 * They provide isolated test data creation and cleanup.
 *
 * Usage:
 *   - Set DATABASE_URL to point to a test database
 *   - Call setupTestDb() in beforeAll to ensure connectivity
 *   - Use createPrismaXxx() helpers to seed test data
 *   - Call cleanupTestDb() in afterAll to remove test data
 *
 * NOTE: The API route tests use mocked Prisma (mock-prisma.ts) for isolation
 * and speed. These utilities are provided for integration tests that need
 * a real database (e.g., multi-tenant isolation tests in Sprint 2).
 */
import { PrismaClient } from "@prisma/client";

let testPrisma: PrismaClient | null = null;

/**
 * Get or create a PrismaClient connected to the test database.
 * Returns null if DATABASE_URL is not set (CI without DB).
 */
export function getTestPrisma(): PrismaClient | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  if (!testPrisma) {
    testPrisma = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL,
    });
  }
  return testPrisma;
}

/**
 * Connect to the test database and verify connectivity.
 * Returns true if connected, false if DATABASE_URL is not set.
 */
export async function setupTestDb(): Promise<boolean> {
  const prisma = getTestPrisma();
  if (!prisma) return false;
  await prisma.$connect();
  // Verify connectivity
  await prisma.$queryRaw`SELECT 1`;
  return true;
}

/**
 * Clean up all test data from the database in the correct order
 * (respecting foreign key constraints).
 */
export async function cleanupTestDb(): Promise<void> {
  const prisma = getTestPrisma();
  if (!prisma) return;

  // Delete in reverse dependency order
  await prisma.notification.deleteMany({});
  await prisma.notificationPreference.deleteMany({});
  await prisma.paStatusCheck.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.appeal.deleteMany({});
  await prisma.denial.deleteMany({});
  await prisma.authStatusChange.deleteMany({});
  await prisma.authDocument.deleteMany({});
  await prisma.priorAuthRequest.deleteMany({});
  await prisma.patientInsurance.deleteMany({});
  await prisma.patient.deleteMany({});
  await prisma.payerRule.deleteMany({});
  await prisma.payer.deleteMany({});
  await prisma.ehrConnection.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});
}

/**
 * Disconnect from the test database.
 */
export async function teardownTestDb(): Promise<void> {
  if (testPrisma) {
    await testPrisma.$disconnect();
    testPrisma = null;
  }
}

/**
 * Create an organization in the test database.
 */
export async function createPrismaOrg(
  prisma: PrismaClient,
  overrides: Record<string, unknown> = {}
) {
  return prisma.organization.create({
    data: {
      name: `Test Org ${Date.now()}`,
      type: "imaging_center",
      ...overrides,
    },
  });
}

/**
 * Create a user in the test database.
 */
export async function createPrismaUser(
  prisma: PrismaClient,
  organizationId: string,
  overrides: Record<string, unknown> = {}
) {
  return prisma.user.create({
    data: {
      organizationId,
      email: `user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
      passwordHash: "$2a$12$hashedpassword",
      firstName: "Test",
      lastName: "User",
      role: "admin",
      ...overrides,
    },
  });
}

/**
 * Create a patient in the test database.
 */
export async function createPrismaPatient(
  prisma: PrismaClient,
  organizationId: string,
  overrides: Record<string, unknown> = {}
) {
  return prisma.patient.create({
    data: {
      organizationId,
      firstName: "Test",
      lastName: "Patient",
      mrn: `MRN-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      dob: new Date("1985-01-15"),
      gender: "male",
      ...overrides,
    },
  });
}

/**
 * Create a payer in the test database.
 */
export async function createPrismaPayer(
  prisma: PrismaClient,
  organizationId: string | null,
  overrides: Record<string, unknown> = {}
) {
  return prisma.payer.create({
    data: {
      organizationId,
      name: `Test Payer ${Date.now()}`,
      payerId: `PAYER-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: "commercial",
      ...overrides,
    },
  });
}
