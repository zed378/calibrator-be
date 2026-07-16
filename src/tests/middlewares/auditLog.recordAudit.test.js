/**
 * Tests for recordAudit — the DB-backed audit-trail middleware.
 */
jest.mock("../../models", () => ({
  Tenants: {},
  Users: {},
  Roles: {},
  MenuGroups: {},
  RoleMenuPermissions: {},
}));
jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../services/audit.service", () => ({
  logAction: jest.fn().mockResolvedValue({ id: "log-1" }),
}));

const { recordAudit } = require("../../middlewares/auditLog.middleware");
const auditService = require("../../services/audit.service");

const makeRes = () => {
  const handlers = {};
  return {
    statusCode: 200,
    on: jest.fn((evt, cb) => {
      handlers[evt] = cb;
    }),
    _finish() {
      if (handlers.finish) handlers.finish();
    },
  };
};

describe("recordAudit", () => {
  beforeEach(() => jest.clearAllMocks());

  it("throws for an invalid audit action", () => {
    expect(() => recordAudit("FROBNICATE", "User")).toThrow();
  });

  it("writes an audit row on a successful (2xx) response", async () => {
    const req = {
      user: { id: "user-1", tenantId: "tenant-1" },
      tenantId: "tenant-1",
      body: { userId: "target-9" },
      ip: "203.0.114.5",
      get: () => "jest-agent",
    };
    const res = makeRes();
    const next = jest.fn();

    recordAudit("UPDATE", "User", {
      resolveResourceId: (r) => r.body.userId,
    })(req, res, next);

    expect(next).toHaveBeenCalled();
    res.statusCode = 200;
    res._finish();
    await Promise.resolve();

    expect(auditService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        userId: "user-1",
        action: "UPDATE",
        resourceType: "User",
        resourceId: "target-9",
        ipAddress: "203.0.114.5",
        userAgent: "jest-agent",
      }),
    );
  });

  it("does NOT write an audit row on an error (>=400) response", async () => {
    const req = { user: { id: "u" }, tenantId: "t", params: {}, get: () => "a" };
    const res = makeRes();
    recordAudit("DELETE", "User")(req, res, jest.fn());
    res.statusCode = 403;
    res._finish();
    await Promise.resolve();
    expect(auditService.logAction).not.toHaveBeenCalled();
  });

  it("falls back to req.params.id when no resolver is given", async () => {
    const req = {
      user: { id: "u", tenantId: "t" },
      tenantId: "t",
      params: { id: "res-42" },
      get: () => "a",
    };
    const res = makeRes();
    recordAudit("CREATE", "Role")(req, res, jest.fn());
    res._finish();
    await Promise.resolve();
    expect(auditService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: "res-42", action: "CREATE" }),
    );
  });
});
