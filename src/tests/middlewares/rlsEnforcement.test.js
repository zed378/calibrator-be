/**
 * Tests for rlsEnforcement middleware
 */

const mockDb = {
  getDialect: jest.fn(),
  transaction: jest.fn(),
  query: jest.fn(),
};

const mockGetStore = jest.fn();

jest.mock("../../config", () => ({ db: mockDb }));
jest.mock("../../middlewares/tenantContext.middleware", () => ({
  tenantStorage: { getStore: mockGetStore },
}));
jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));
const mockModels = {
  TenantScopedModel: {
    tableName: "tenant_scoped",
    rawAttributes: { tenantId: { field: "tenantId" } },
  },
  UnderscoreModel: {
    tableName: "underscore_table",
    rawAttributes: { tenant_id: { field: "tenant_id" } },
  },
  CustomFieldModel: {
    tableName: "custom_table",
    rawAttributes: { tenantId: { field: "custom_field_name" } },
  },
  NoTenantModel: {
    tableName: "no_tenant",
    rawAttributes: {},
  },
};

jest.mock("../../models", () => ({
  models: {
    TenantScopedModel: {
      tableName: "tenant_scoped",
      rawAttributes: { tenantId: { field: "tenantId" } },
    },
    TenantIdNoField: {
      tableName: "tenant_id_no_field",
      rawAttributes: { tenantId: {} },
    },
    UnderscoreModel: {
      tableName: "underscore_table",
      rawAttributes: { tenant_id: { field: "tenant_id" } },
    },
    UnderscoreNoField: {
      tableName: "underscore_no_field",
      rawAttributes: { tenant_id: {} },
    },
    CustomFieldModel: {
      tableName: "custom_table",
      rawAttributes: { tenantId: { field: "custom_field_name" } },
    },
    NoTenantModel: {
      tableName: "no_tenant",
      rawAttributes: {},
    },
  },
}));

const { logger } = require("../../middlewares/activityLog.middleware");
const {
  rlsEnforcementMiddleware,
  initializePostgresRLS,
} = require("../../middlewares/rlsEnforcement.middleware");

describe("rlsEnforcement middleware", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {};
    res = { headersSent: false };
    next = jest.fn();
  });

  it("should skip if dialect is not postgres", async () => {
    mockDb.getDialect.mockReturnValue("sqlite");
    await rlsEnforcementMiddleware(req, res, next);
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it("should call next immediately when no tenant context is present", async () => {
    mockDb.getDialect.mockReturnValue("postgres");
    mockGetStore.mockReturnValue(null);
    await rlsEnforcementMiddleware(req, res, next);
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it("should execute RLS session variables query in postgres dialect", async () => {
    mockDb.getDialect.mockReturnValue("postgres");
    mockDb.transaction.mockImplementation(async (cb) => {
      await cb("tx");
    });
    mockGetStore.mockReturnValue({ tenantId: "tenant-999", isSuperAdmin: false });

    await rlsEnforcementMiddleware(req, res, next);

    expect(mockDb.transaction).toHaveBeenCalled();
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("SET app.current_tenant = 'tenant-999'"),
      expect.any(Object),
    );
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("SET app.enable_rls = 'on'"),
      expect.any(Object),
    );
    expect(next).toHaveBeenCalled();
  });

  it("should set SUPER_ADMIN tenant variable for superadmin context", async () => {
    mockDb.getDialect.mockReturnValue("postgres");
    mockDb.transaction.mockImplementation(async (cb) => {
      await cb("tx");
    });
    mockGetStore.mockReturnValue({ isSuperAdmin: true });

    await rlsEnforcementMiddleware(req, res, next);

    expect(mockDb.query).toHaveBeenCalledWith(
      "SET app.current_tenant = 'SUPER_ADMIN'",
      expect.any(Object),
    );
    expect(next).toHaveBeenCalled();
  });

  it("should escape single quotes in the tenant value", async () => {
    mockDb.getDialect.mockReturnValue("postgres");
    mockDb.transaction.mockImplementation(async (cb) => {
      await cb("tx");
    });
    mockGetStore.mockReturnValue({ isSuperAdmin: false, tenantId: "bad'value" });

    await rlsEnforcementMiddleware(req, res, next);

    expect(mockDb.query).toHaveBeenCalledWith(
      "SET app.current_tenant = 'bad''value'",
      expect.any(Object),
    );
  });

  it("should log and forward the error when the transaction fails", async () => {
    mockDb.getDialect.mockReturnValue("postgres");
    mockDb.transaction.mockRejectedValue(new Error("rls fail"));
    const spyError = jest.spyOn(logger, "error").mockImplementation(() => {});
    mockGetStore.mockReturnValue({ isSuperAdmin: false, tenantId: "t-1" });

    await rlsEnforcementMiddleware(req, res, next);

    expect(spyError).toHaveBeenCalledWith("RLS enforcement failed", {
      error: "rls fail",
      tenantId: "t-1",
    });
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("should not forward the error when headers are already sent", async () => {
    mockDb.getDialect.mockReturnValue("postgres");
    mockDb.transaction.mockRejectedValue(new Error("rls fail"));
    const spyError = jest.spyOn(logger, "error").mockImplementation(() => {});
    mockGetStore.mockReturnValue({ isSuperAdmin: false, tenantId: "t-1" });
    res.headersSent = true;

    await rlsEnforcementMiddleware(req, res, next);

    expect(spyError).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("should set an empty tenant variable when context has no tenant id", async () => {
    mockDb.getDialect.mockReturnValue("postgres");
    mockDb.transaction.mockImplementation(async (cb) => {
      await cb("tx");
    });
    mockGetStore.mockReturnValue({ isSuperAdmin: false });

    await rlsEnforcementMiddleware(req, res, next);

    expect(mockDb.query).toHaveBeenCalledWith(
      "SET app.current_tenant = ''",
      expect.any(Object),
    );
    expect(next).toHaveBeenCalled();
  });

  it("should initialize Postgres RLS skip if not using postgres", async () => {
    mockDb.getDialect.mockReturnValue("sqlite");
    await initializePostgresRLS();
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  it("should create RLS policies for tenant-scoped models", async () => {
    mockDb.getDialect.mockReturnValue("postgres");
    mockDb.query.mockResolvedValue([]);

    await initializePostgresRLS();

    expect(mockDb.query).toHaveBeenCalledWith(
      'ALTER TABLE "tenant_scoped" ENABLE ROW LEVEL SECURITY;',
    );
    expect(mockDb.query).toHaveBeenCalledWith(
      'ALTER TABLE "tenant_scoped" FORCE ROW LEVEL SECURITY;',
    );
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE POLICY tenant_isolation_policy ON "tenant_scoped"',
      ),
    );
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('"tenant_id"::text'),
    );
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('"custom_field_name"::text'),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Postgres RLS initialization completed",
    );
  });

  it("should log a warning when policy creation fails for a table", async () => {
    mockDb.getDialect.mockReturnValue("postgres");
    mockDb.query.mockRejectedValueOnce(new Error("permission denied"));
    const spyWarn = jest.spyOn(logger, "warn").mockImplementation(() => {});

    await initializePostgresRLS();

    expect(spyWarn).toHaveBeenCalledWith(
      expect.stringContaining("RLS setup skipped for"),
    );
  });
});
