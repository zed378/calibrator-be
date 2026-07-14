/**
 * Tests for tenantContext middleware
 */
const { db } = require("../../config");
const { tenantContextMiddleware, tenantStorage } = require("../../middlewares/tenantContext.middleware");

describe("tenantContext middleware", () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      tenantId: "tenant-abc",
      user: {
        role: { name: "TENANT_ADMIN" },
      },
    };
    res = {
      on: jest.fn(),
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should run AsyncLocalStorage with tenant context details", async () => {
    jest.spyOn(db, "getDialect").mockReturnValue("sqlite");
    
    let contextValue;
    next.mockImplementation(() => {
      contextValue = tenantStorage.getStore();
    });

    await tenantContextMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(contextValue).toEqual({
      tenantId: "tenant-abc",
      isSuperAdmin: false,
      isSystemTask: false,
    });
  });

  it("should detect super admin status in context", async () => {
    jest.spyOn(db, "getDialect").mockReturnValue("sqlite");
    req.user.role.name = "SUPER_ADMIN";
    
    let contextValue;
    next.mockImplementation(() => {
      contextValue = tenantStorage.getStore();
    });

    await tenantContextMiddleware(req, res, next);

    expect(contextValue.isSuperAdmin).toBe(true);
  });

  it("should setup local transaction and query session variables in postgres dialect", async () => {
    jest.spyOn(db, "getDialect").mockReturnValue("postgres");
    
    const spyTransaction = jest.spyOn(db, "transaction").mockImplementation(async (callback) => {
      await callback("dummy-transaction-object");
    });
    const spyQuery = jest.spyOn(db, "query").mockResolvedValue([]);

    // We wait for next to be called because tenantContextMiddleware runs asynchronously
    // inside AsyncLocalStorage.run without returning the promise to the caller.
    await new Promise((resolve) => {
      next.mockImplementation(() => {
        resolve();
      });

      tenantContextMiddleware(req, res, next);

      // Trigger the response finish callback to resolve the transaction promise
      setTimeout(() => {
        const finishCall = res.on.mock.calls.find((c) => c[0] === "finish");
        if (finishCall && typeof finishCall[1] === "function") {
          finishCall[1]();
        }
      }, 5);
    });

    expect(spyTransaction).toHaveBeenCalled();
    expect(spyQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET LOCAL app.current_tenant = 'tenant-abc';"),
      expect.any(Object)
    );
    expect(spyQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET LOCAL app.enable_rls = 'on';"),
      expect.any(Object)
    );
    expect(next).toHaveBeenCalled();
  });
});
