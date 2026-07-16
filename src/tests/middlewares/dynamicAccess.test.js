/**
 * Tests for dynamicAccess middleware
 */

const { expect } = require("@jest/globals");

jest.mock("../../utils/appError.util", () => {
  class AppError extends Error {
    constructor(statusCode, message) {
      super(message);
      this.statusCode = statusCode;
      this.name = "AppError";
    }
  }
  return { AppError };
});

jest.mock("../../models", () => ({
  User: {
    findByPk: jest.fn(),
  },
  Tenants: {
    findByPk: jest.fn(),
  },
}));

jest.mock("../../services/roles.service", () => {
  const mockGetRolePermissionsMatrix = jest.fn().mockResolvedValue({
    Home: ["read", "write"],
    Dashboard: ["read", "write"],
    Account: ["read", "write"],
    Management: ["read", "write"],
    Report: ["read", "write"],
  });
  return {
    hasRolePermission: jest.fn().mockReturnValue(true),
    getRolePermissionsMatrix: mockGetRolePermissionsMatrix,
  };
});

jest.mock("../../services/apiKey.service", () => ({
  scopeAllows: jest.fn().mockReturnValue(true),
}));

jest.mock("../../services/userPermission.service", () => ({
  getUserOverrideMatrix: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { dynamicAccess, hasDynamicPermission } = require("../../middlewares/dynamicAccess.middleware");
const RolesService = require("../../services/roles.service");
const { scopeAllows } = require("../../services/apiKey.service");
const { getUserOverrideMatrix } = require("../../services/userPermission.service");
const { User, Tenants } = require("../../models");
const { logger } = require("../../middlewares/activityLog.middleware");

const makeUser = (overrides = {}) => ({
  id: "user-1",
  role: { id: "role-1", name: "user" },
  permissions: [],
  isApiKey: false,
  apiKeyScopes: [],
  tenantId: "tenant-123",
  tenant: { id: "tenant-123" },
  ...overrides,
});

describe("dynamicAccess middleware", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    RolesService.getRolePermissionsMatrix.mockResolvedValue({
      Home: ["read", "write"],
      Dashboard: ["read", "write"],
      Account: ["read", "write"],
      Management: ["read", "write"],
      Report: ["read", "write"],
    });
    scopeAllows.mockReturnValue(true);
    getUserOverrideMatrix.mockResolvedValue({});
    User.findByPk.mockResolvedValue(null);
    Tenants.findByPk.mockResolvedValue(null);
    next = jest.fn();
    req = {
      user: makeUser(),
      params: {},
      body: {},
      method: "GET",
      path: "/api/test",
      ip: "192.168.1.1",
      query: {},
    };
    res = {
      locals: {},
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  const run = (mw) => mw(req, res, next);

  describe("auth / role guards", () => {
    it("should return a middleware function", () => {
      expect(typeof dynamicAccess("Home", "read")).toBe("function");
    });

    it("should return 401 when there is no user context", async () => {
      req.user = null;
      await run(dynamicAccess("Home", "read"));
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 when the user has no role", async () => {
      req.user = { id: "user-1" };
      await run(dynamicAccess("Home", "read"));
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("should bypass for SUPER_ADMIN role", async () => {
      req.user = makeUser({ role: { id: "role-1", name: "SUPER_ADMIN" } });
      await run(dynamicAccess("Home", "read"));
      expect(next).toHaveBeenCalled();
    });

    it("should bypass for SUPERADMIN role (alt spelling)", async () => {
      req.user = makeUser({ role: { id: "role-1", name: "SUPERADMIN" } });
      await run(dynamicAccess("Home", "read"));
      expect(next).toHaveBeenCalled();
    });

    it("should return 500 when the permission lookup throws", async () => {
      RolesService.getRolePermissionsMatrix.mockRejectedValue(
        new Error("boom"),
      );
      await run(dynamicAccess("Home", "read"));
      expect(res.status).toHaveBeenCalledWith(500);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("permission resolution", () => {
    it("should allow when the role matrix grants the permission", async () => {
      await run(dynamicAccess("Home", "read"));
      expect(next).toHaveBeenCalled();
    });

    it("should deny with 403 when the role matrix lacks the permission", async () => {
      RolesService.getRolePermissionsMatrix.mockResolvedValueOnce({ Home: [] });
      await run(dynamicAccess("Home", "write"));
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("should let write satisfy a read request", async () => {
      RolesService.getRolePermissionsMatrix.mockResolvedValueOnce({
        Home: ["write"],
      });
      await run(dynamicAccess("Home", "read"));
      expect(next).toHaveBeenCalled();
    });

    it("should use OR logic across menu groups by default", async () => {
      RolesService.getRolePermissionsMatrix.mockResolvedValue({
        Home: ["read"],
        Dashboard: [],
      });
      await run(dynamicAccess(["Home", "Dashboard"], "read"));
      expect(next).toHaveBeenCalled();
    });

    it("should require ALL groups when requireAll is set", async () => {
      RolesService.getRolePermissionsMatrix.mockResolvedValue({
        Home: ["read"],
        Dashboard: [],
      });
      await run(
        dynamicAccess(["Home", "Dashboard"], "read", { requireAll: true }),
      );
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("should allow when requireAll is satisfied", async () => {
      RolesService.getRolePermissionsMatrix.mockResolvedValue({
        Home: ["read"],
        Dashboard: ["read"],
      });
      await run(
        dynamicAccess(["Home", "Dashboard"], "read", { requireAll: true }),
      );
      expect(next).toHaveBeenCalled();
    });
  });

  describe("per-user overrides", () => {
    it("should deny when an override sets the menu to none", async () => {
      getUserOverrideMatrix.mockResolvedValueOnce({ Home: "none" });
      await run(dynamicAccess("Home", "read"));
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should honor a permission override", async () => {
      getUserOverrideMatrix.mockResolvedValueOnce({ Home: "write" });
      RolesService.getRolePermissionsMatrix.mockResolvedValueOnce({
        Home: [],
      });
      await run(dynamicAccess("Home", "read"));
      expect(next).toHaveBeenCalled();
    });

    it("should fall back to role permissions when override lookup fails", async () => {
      getUserOverrideMatrix.mockRejectedValueOnce(new Error("lookup failed"));
      await run(dynamicAccess("Home", "read"));
      expect(logger.error).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe("checkSelf", () => {
    it("should allow when acting on own resource", async () => {
      await run(dynamicAccess("Home", "read", { checkSelf: true }));
      expect(next).toHaveBeenCalled();
    });

    it("should allow self via body.userId", async () => {
      req.body = { userId: "user-1" };
      await run(dynamicAccess("Home", "read", { checkSelf: true }));
      expect(next).toHaveBeenCalled();
    });

    it("should fall through to permissions when owner id does not match", async () => {
      req.params = { userId: "other-user" };
      await run(dynamicAccess("Home", "read", { checkSelf: true }));
      expect(next).toHaveBeenCalled();
    });
  });

  describe("checkTenant", () => {
    it("should 404 when the resource tenant is not found", async () => {
      Tenants.findByPk.mockResolvedValueOnce(null);
      req.params = { tenantId: "missing" };
      await run(dynamicAccess("Home", "read", { checkTenant: true }));
      expect(res.status).toHaveBeenCalledWith(404);
      expect(next).not.toHaveBeenCalled();
    });

    it("should 403 when the resource belongs to a different tenant", async () => {
      Tenants.findByPk.mockResolvedValueOnce({ id: "tenant-999" });
      req.params = { tenantId: "tenant-999" };
      await run(dynamicAccess("Home", "read", { checkTenant: true }));
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("should allow when the resource belongs to the user tenant", async () => {
      Tenants.findByPk.mockResolvedValueOnce({ id: "tenant-123" });
      req.params = { tenantId: "tenant-123" };
      await run(dynamicAccess("Home", "read", { checkTenant: true }));
      expect(next).toHaveBeenCalled();
    });

    it("should 404 when the resource owner is not found (no tenantId)", async () => {
      Tenants.findByPk.mockResolvedValueOnce(null);
      User.findByPk.mockResolvedValueOnce(null);
      req.params = { userId: "other-user" };
      await run(dynamicAccess("Home", "read", { checkTenant: true }));
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should 403 when the resource owner is in another tenant", async () => {
      Tenants.findByPk.mockResolvedValueOnce(null);
      User.findByPk.mockResolvedValueOnce({ tenantId: "tenant-999" });
      req.params = { userId: "other-user" };
      await run(dynamicAccess("Home", "read", { checkTenant: true }));
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should allow when the resource owner shares the tenant", async () => {
      Tenants.findByPk.mockResolvedValueOnce(null);
      User.findByPk.mockResolvedValueOnce({ tenantId: "tenant-123" });
      req.params = { userId: "other-user" };
      await run(dynamicAccess("Home", "read", { checkTenant: true }));
      expect(next).toHaveBeenCalled();
    });
  });

  describe("API key principals", () => {
    beforeEach(() => {
      req.user = makeUser({ isApiKey: true, apiKeyScopes: ["Home:read"] });
    });

    it("should authorize via scopes when allowed", async () => {
      scopeAllows.mockReturnValue(true);
      await run(dynamicAccess("Home", "read"));
      expect(scopeAllows).toHaveBeenCalledWith(
        ["Home:read"],
        "Home",
        "read",
      );
      expect(next).toHaveBeenCalled();
    });

    it("should deny via scopes when not allowed", async () => {
      scopeAllows.mockReturnValue(false);
      await run(dynamicAccess("Home", "write"));
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should require all scopes when requireAll is set", async () => {
      scopeAllows.mockReturnValue(false);
      await run(
        dynamicAccess("Home", ["read", "write"], { requireAll: true }),
      );
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});

describe("hasDynamicPermission", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    RolesService.getRolePermissionsMatrix.mockResolvedValue({
      Home: ["read", "write"],
      Dashboard: ["read", "write"],
      Account: ["read", "write"],
      Management: ["read", "write"],
      Report: ["read", "write"],
    });
    next = jest.fn();
    req = {
      user: makeUser(),
      body: { menuGroup: "Home", permissionType: "read" },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  it("should return 400 when menuGroup is missing", async () => {
    req.body = { permissionType: "read" };
    await hasDynamicPermission(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("should return 400 when permissionType is missing", async () => {
    req.body = { menuGroup: "Home" };
    await hasDynamicPermission(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("should return 401 when there is no user", async () => {
    req.user = null;
    await hasDynamicPermission(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("should return 200 with allowed true", async () => {
    await hasDynamicPermission(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ allowed: true }),
      }),
    );
  });

  it("should let write satisfy read", async () => {
    RolesService.getRolePermissionsMatrix.mockResolvedValueOnce({
      Home: ["write"],
    });
    await hasDynamicPermission(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ allowed: true }),
      }),
    );
  });

  it("should return 200 with allowed false", async () => {
    RolesService.getRolePermissionsMatrix.mockResolvedValueOnce({ Home: [] });
    await hasDynamicPermission(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ allowed: false }),
      }),
    );
  });

  it("should return 500 on error", async () => {
    RolesService.getRolePermissionsMatrix.mockRejectedValue(
      new Error("boom"),
    );
    await hasDynamicPermission(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(logger.error).toHaveBeenCalled();
  });
});
