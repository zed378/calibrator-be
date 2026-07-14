/**
 * Tests for rlsEnforcement middleware
 */
const { db } = require("../../config");
const { tenantStorage } = require("../../middlewares/tenantContext.middleware");
const { rlsEnforcementMiddleware, initializePostgresRLS } = require("../../middlewares/rlsEnforcement.middleware");

describe("rlsEnforcement middleware", () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = {
      headersSent: false,
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should skip if dialect is not postgres", async () => {
    jest.spyOn(db, "getDialect").mockReturnValue("sqlite");
    await rlsEnforcementMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("should execute RLS session variables query in postgres dialect", async () => {
    jest.spyOn(db, "getDialect").mockReturnValue("postgres");
    const spyTransaction = jest.spyOn(db, "transaction").mockImplementation(async (callback) => {
      await callback("dummy-tx");
    });
    const spyQuery = jest.spyOn(db, "query").mockResolvedValue([]);

    const storeSpy = jest.spyOn(tenantStorage, "getStore").mockReturnValue({
      tenantId: "tenant-999",
      isSuperAdmin: false,
    });

    await rlsEnforcementMiddleware(req, res, next);

    expect(spyTransaction).toHaveBeenCalled();
    expect(spyQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET app.current_tenant = 'tenant-999'"),
      expect.any(Object)
    );
    expect(spyQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET app.enable_rls = 'on'"),
      expect.any(Object)
    );
    expect(next).toHaveBeenCalled();
  });

  it("should initialize Postgres RLS skip if not using postgres", async () => {
    jest.spyOn(db, "getDialect").mockReturnValue("sqlite");
    const spyQuery = jest.spyOn(db, "query");
    await initializePostgresRLS();
    expect(spyQuery).not.toHaveBeenCalled();
  });
});
