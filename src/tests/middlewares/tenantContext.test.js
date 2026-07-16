/**
 * Tests for tenantContext middleware
 */
jest.mock("../../config", () => ({
  db: {
    getDialect: jest.fn(),
    transaction: jest.fn(),
    query: jest.fn(),
  },
}));

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
    jest.clearAllMocks();
  });

  it("should run AsyncLocalStorage with tenant context details", async () => {
    db.getDialect.mockReturnValue("sqlite");
    
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
    db.getDialect.mockReturnValue("sqlite");
    req.user.role.name = "SUPER_ADMIN";
    
    let contextValue;
    next.mockImplementation(() => {
      contextValue = tenantStorage.getStore();
    });

    await tenantContextMiddleware(req, res, next);

    expect(contextValue.isSuperAdmin).toBe(true);
  });

  it("should call next() directly for non-postgres dialects (mysql)", async () => {
    db.getDialect.mockReturnValue("mysql");

    await tenantContextMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should setup local transaction and query session variables in postgres dialect", async () => {
    db.getDialect.mockReturnValue("postgres");
    
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
      expect.stringContaining("set_config('app.current_tenant'"),
      expect.objectContaining({ bind: ["tenant-abc"] })
    );
    expect(spyQuery).toHaveBeenCalledWith(
      expect.stringContaining("set_config('app.enable_rls'"),
      expect.any(Object)
    );
    expect(next).toHaveBeenCalled();
  });

  it("should pass SUPER_ADMIN value when user is super admin in postgres dialect", async () => {
    db.getDialect.mockReturnValue("postgres");
    req.user.role.name = "SUPER_ADMIN";

    const spyQuery = jest.spyOn(db, "query").mockResolvedValue([]);
    jest.spyOn(db, "transaction").mockImplementation(async (callback) => {
      await callback("dummy-transaction-object");
    });

    await new Promise((resolve) => {
      next.mockImplementation(() => {
        resolve();
      });

      tenantContextMiddleware(req, res, next);

      setTimeout(() => {
        const finishCall = res.on.mock.calls.find((c) => c[0] === "finish");
        if (finishCall && typeof finishCall[1] === "function") {
          finishCall[1]();
        }
      }, 5);
    });

    expect(spyQuery).toHaveBeenCalledWith(
      expect.stringContaining("set_config('app.current_tenant'"),
      expect.objectContaining({ bind: ["SUPER_ADMIN"] })
    );
  });

  it("should pass empty string for tenant when tenantId is null in postgres dialect", async () => {
    db.getDialect.mockReturnValue("postgres");
    req.tenantId = null;

    const spyQuery = jest.spyOn(db, "query").mockResolvedValue([]);
    jest.spyOn(db, "transaction").mockImplementation(async (callback) => {
      await callback("dummy-transaction-object");
    });

    await new Promise((resolve) => {
      next.mockImplementation(() => {
        resolve();
      });

      tenantContextMiddleware(req, res, next);

      setTimeout(() => {
        const finishCall = res.on.mock.calls.find((c) => c[0] === "finish");
        if (finishCall && typeof finishCall[1] === "function") {
          finishCall[1]();
        }
      }, 5);
    });

    expect(spyQuery).toHaveBeenCalledWith(
      expect.stringContaining("set_config('app.current_tenant'"),
      expect.objectContaining({ bind: [""] })
    );
  });

  it("should call next(err) when transaction throws and headers not sent", async () => {
    db.getDialect.mockReturnValue("postgres");

    const testError = new Error("Transaction failed");
    jest.spyOn(db, "transaction").mockRejectedValue(testError);
    const spyQuery = jest.spyOn(db, "query").mockResolvedValue([]);

    await tenantContextMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith(testError);
    expect(spyQuery).not.toHaveBeenCalled();
  });

  it("should skip next(err) when headers are already sent", async () => {
    db.getDialect.mockReturnValue("postgres");

    const testError = new Error("Transaction failed");
    jest.spyOn(db, "transaction").mockRejectedValue(testError);

    const resHeadersSent = {
      on: jest.fn(),
      headersSent: true,
    };

    await tenantContextMiddleware(req, resHeadersSent, next);

    expect(next).not.toHaveBeenCalled();
  });

  it("should cover res.on finish callback path in postgres dialect", async () => {
    db.getDialect.mockReturnValue("postgres");

    let resolveFinish = null;
    const finishPromise = new Promise((resolve) => {
      resolveFinish = resolve;
    });

    jest.spyOn(db, "transaction").mockImplementation(async (callback) => {
      await callback("dummy-transaction-object");
    });
    jest.spyOn(db, "query").mockResolvedValue([]);

    // Store original next implementation, call middleware then trigger finish
    tenantContextMiddleware(req, res, next);

    // The res.on('finish') handler was registered; find and call it directly
    // to cover the () => resolve() arrow function and its body resolve()
    const finishHandler = res.on.mock.calls.find((c) => c[0] === "finish");
    if (finishHandler && typeof finishHandler[1] === "function") {
      finishHandler[1]();
    }

    // Give the event loop a tick for any async cleanup
    await new Promise((r) => setTimeout(r, 1));
  });
});
