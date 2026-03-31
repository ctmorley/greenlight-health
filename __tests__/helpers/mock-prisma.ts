/**
 * Deep mock of the Prisma client.
 *
 * Each model exposes the standard Prisma CRUD methods as vi.fn() stubs.
 * Tests configure return values per-test:
 *
 *   prismaMock.user.findUnique.mockResolvedValueOnce(mockUser);
 *
 * The mock is registered via vi.mock("@/lib/prisma") in setup.ts.
 */
import { vi } from "vitest";

function createModelMock() {
  return {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    groupBy: vi.fn().mockResolvedValue([]),
    aggregate: vi.fn(),
    upsert: vi.fn(),
  };
}

export const prismaMock = {
  organization: createModelMock(),
  user: createModelMock(),
  patient: createModelMock(),
  patientInsurance: createModelMock(),
  payer: createModelMock(),
  payerRule: createModelMock(),
  priorAuthRequest: createModelMock(),
  authDocument: createModelMock(),
  authStatusChange: createModelMock(),
  denial: createModelMock(),
  appeal: createModelMock(),
  clinicalGuideline: createModelMock(),
  payerClinicalPolicy: createModelMock(),
  documentationRequirement: createModelMock(),
  denialPattern: createModelMock(),
  ehrConnection: createModelMock(),
  auditLog: createModelMock(),
  notificationPreference: createModelMock(),
  notification: createModelMock(),
  paStatusCheck: createModelMock(),
  // Transaction support: runs the callback with the same mock client
  $transaction: vi.fn().mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
    return fn(prismaMock);
  }),
  $connect: vi.fn(),
  $disconnect: vi.fn(),
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
};

/**
 * Reset all prisma mocks. Call in beforeEach.
 */
export function resetPrismaMocks() {
  const resetModel = (model: ReturnType<typeof createModelMock>) => {
    Object.values(model).forEach((fn) => {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    });
    // Restore default count/groupBy
    model.count.mockResolvedValue(0);
    model.groupBy.mockResolvedValue([]);
  };

  for (const [key, value] of Object.entries(prismaMock)) {
    if (key.startsWith("$")) {
      if (key === "$transaction") {
        prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock));
      }
      continue;
    }
    resetModel(value as ReturnType<typeof createModelMock>);
  }
}

// Register the mock
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));
