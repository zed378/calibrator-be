// Mock dependencies BEFORE requires
jest.mock("../../utils/jwt.util", () => ({
  verifyAccessToken: jest.fn(),
}));
jest.mock("../../services/auth.service", () => ({
  getAuthUserWithTenant: jest.fn(),
}));
jest.mock("../../services/tenant.service", () => ({
  getTenantByCodeForMiddleware: jest.fn(),
  getTenantByIdForMiddleware: jest.fn(),
}));
jest.mock("../../services/apiKey.service", () => ({
  verifyApiKey: jest.fn(),
}));
jest.mock("../../constants", () => ({
  ROLE_NAMES: { SUPER_ADMIN: "SUPER_ADMIN", USER: "USER" },
}));
jest.mock("../../middlewares/tenantContext.middleware", () => ({
  tenantContextMiddleware: jest.fn((req, res, next) => next()),
}));
jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    error: jest.fn(),
  },
}));

const {
  auth,
  optionalAuth,
  superAdminOnly,
} = require("../../middlewares/auth.middleware");
const { createMockReq, createMockNext } = require("../utils/test.utils");
const { ROLE_NAMES } = require("../../constants");
const { verifyAccessToken } = require("../../utils/jwt.util");
const authService = require("../../services/auth.service");
const tenantService = require("../../services/tenant.service");

describe("auth Middleware", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = createMockReq();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    next = createMockNext();

    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("auth", () => {
    it("should return unauthorized if no authorization header", async () => {
      await auth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("should return unauthorized if header doesn't start with Bearer", async () => {
      req.headers.authorization = "Basic token";
      await auth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return unauthorized if token is invalid", async () => {
      req.headers.authorization = "Bearer invalid-token";
      verifyAccessToken.mockImplementation(() => {
        throw new Error("Invalid token");
      });
      await auth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return unauthorized if user not found", async () => {
      req.headers.authorization = "Bearer valid-token";
      verifyAccessToken.mockReturnValue({ id: "user-1" });
      authService.getAuthUserWithTenant.mockResolvedValue(null);

      await auth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return forbidden if user is banned (isActive=false)", async () => {
      req.headers.authorization = "Bearer valid-token";
      verifyAccessToken.mockReturnValue({ id: "user-1" });
      authService.getAuthUserWithTenant.mockResolvedValue({ isActive: false });

      await auth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return forbidden if user is suspended or inactive", async () => {
      req.headers.authorization = "Bearer valid-token";
      verifyAccessToken.mockReturnValue({ id: "user-1" });
      authService.getAuthUserWithTenant.mockResolvedValue({
        isActive: true,
        status: "SUSPENDED",
      });

      await auth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should attach user and token to req if successful", async () => {
      req.headers.authorization = "Bearer valid-token";
      verifyAccessToken.mockReturnValue({ id: "user-1" });
      const mockUser = {
        id: "user-1",
        isActive: true,
        status: "ACTIVE",
        role: { name: ROLE_NAMES.USER },
      };
      authService.getAuthUserWithTenant.mockResolvedValue(mockUser);

      await auth(req, res, next);
      expect(req.user).toEqual(mockUser);
      expect(req.token).toBe("valid-token");
      expect(next).toHaveBeenCalled();
    });

    it("should attach tenant context if user has tenantId", async () => {
      req.headers.authorization = "Bearer valid-token";
      verifyAccessToken.mockReturnValue({ id: "user-1" });
      const mockUser = {
        id: "user-1",
        isActive: true,
        status: "ACTIVE",
        tenantId: "t-1",
        tenant: { id: "t-1", name: "Tenant 1" },
        role: { name: ROLE_NAMES.USER },
      };
      authService.getAuthUserWithTenant.mockResolvedValue(mockUser);

      await auth(req, res, next);
      expect(req.tenantId).toBe("t-1");
      expect(req.tenant).toEqual(mockUser.tenant);
      expect(next).toHaveBeenCalled();
    });

    it("should return forbidden if user tenant is suspended", async () => {
      req.headers.authorization = "Bearer valid-token";
      verifyAccessToken.mockReturnValue({ id: "user-1" });
      const mockUser = {
        id: "user-1",
        isActive: true,
        status: "ACTIVE",
        tenantId: "t-1",
        tenant: { id: "t-1", name: "Tenant 1", status: "suspended" },
        role: { name: ROLE_NAMES.USER },
      };
      authService.getAuthUserWithTenant.mockResolvedValue(mockUser);

      await auth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("should allow SUPER_ADMIN to override tenant via x-tenant-code", async () => {
      req.headers.authorization = "Bearer valid-token";
      req.headers["x-tenant-code"] = "CODE";
      verifyAccessToken.mockReturnValue({ id: "user-1" });
      const mockUser = {
        id: "user-1",
        isActive: true,
        status: "ACTIVE",
        role: { name: ROLE_NAMES.SUPER_ADMIN },
      };
      authService.getAuthUserWithTenant.mockResolvedValue(mockUser);
      tenantService.getTenantByCodeForMiddleware.mockResolvedValue({
        id: "t-override",
      });

      await auth(req, res, next);
      expect(req.tenantId).toBe("t-override");
      expect(tenantService.getTenantByCodeForMiddleware).toHaveBeenCalledWith(
        "CODE",
      );
    });

    it("should not set tenant context if x-tenant-code is invalid", async () => {
      req.headers.authorization = "Bearer valid-token";
      req.headers["x-tenant-code"] = "INVALID";
      verifyAccessToken.mockReturnValue({ id: "user-1" });
      const mockUser = {
        id: "user-1",
        isActive: true,
        status: "ACTIVE",
        role: { name: ROLE_NAMES.SUPER_ADMIN },
      };
      authService.getAuthUserWithTenant.mockResolvedValue(mockUser);
      tenantService.getTenantByCodeForMiddleware.mockResolvedValue(null);

      await auth(req, res, next);
      expect(req.tenantId).toBeUndefined();
    });

    it("should allow SUPER_ADMIN to override tenant via x-tenant-id", async () => {
      req.headers.authorization = "Bearer valid-token";
      req.headers["x-tenant-id"] = "ID";
      verifyAccessToken.mockReturnValue({ id: "user-1" });
      const mockUser = {
        id: "user-1",
        isActive: true,
        status: "ACTIVE",
        role: { name: ROLE_NAMES.SUPER_ADMIN },
      };
      authService.getAuthUserWithTenant.mockResolvedValue(mockUser);
      tenantService.getTenantByIdForMiddleware.mockResolvedValue({
        id: "t-override",
        status: "ACTIVE",
      });

      await auth(req, res, next);
      expect(req.tenantId).toBe("t-override");
    });

    it("should not set tenant context if x-tenant-id is invalid", async () => {
      req.headers.authorization = "Bearer valid-token";
      req.headers["x-tenant-id"] = "INVALID";
      verifyAccessToken.mockReturnValue({ id: "user-1" });
      const mockUser = {
        id: "user-1",
        isActive: true,
        status: "ACTIVE",
        role: { name: ROLE_NAMES.SUPER_ADMIN },
      };
      authService.getAuthUserWithTenant.mockResolvedValue(mockUser);
      tenantService.getTenantByIdForMiddleware.mockResolvedValue(null);

      await auth(req, res, next);
      expect(req.tenantId).toBeUndefined();
    });

    it("should not set tenant context if x-tenant-id is not ACTIVE", async () => {
      req.headers.authorization = "Bearer valid-token";
      req.headers["x-tenant-id"] = "ID";
      verifyAccessToken.mockReturnValue({ id: "user-1" });
      const mockUser = {
        id: "user-1",
        isActive: true,
        status: "ACTIVE",
        role: { name: ROLE_NAMES.SUPER_ADMIN },
      };
      authService.getAuthUserWithTenant.mockResolvedValue(mockUser);
      tenantService.getTenantByIdForMiddleware.mockResolvedValue({
        id: "t-override",
        status: "SUSPENDED",
      });

      await auth(req, res, next);
      expect(req.tenantId).toBeUndefined();
    });

    it("should handle API key authentication", async () => {
      const apiKeyService = require("../../services/apiKey.service");
      apiKeyService.verifyApiKey.mockResolvedValue({
        id: "api-key-1",
        tenantId: "t-1",
        tenant: { id: "t-1", status: "ACTIVE" },
        scopes: ["read"],
      });

      req.headers.authorization = "ApiKey test-key";

      await auth(req, res, next);

      expect(req.user.isApiKey).toBe(true);
      expect(next).toHaveBeenCalled();
    });

    it("should reject invalid API key", async () => {
      const apiKeyService = require("../../services/apiKey.service");
      apiKeyService.verifyApiKey.mockResolvedValue(null);

      req.headers.authorization = "ApiKey invalid-key";

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe("optionalAuth", () => {
    it("should call next() without attaching user if no header provided", async () => {
      await optionalAuth(req, res, next);
      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
    });

    it("should attach user if valid token provided", async () => {
      req.headers.authorization = "Bearer valid-token";
      verifyAccessToken.mockReturnValue({ id: "user-1" });
      authService.getAuthUserWithTenant.mockResolvedValue({
        id: "user-1",
        isActive: true,
        status: "ACTIVE",
        tenantId: "t-1",
      });
      await optionalAuth(req, res, next);
      expect(req.user.id).toBe("user-1");
      expect(req.tenantId).toBe("t-1");
      expect(next).toHaveBeenCalled();
    });

    it("should attach user if valid token provided and user is INACTIVE", async () => {
      req.headers.authorization = "Bearer valid-token";
      verifyAccessToken.mockReturnValue({ id: "user-1" });
      authService.getAuthUserWithTenant.mockResolvedValue({
        id: "user-1",
        isActive: true,
        status: "INACTIVE",
      });
      await optionalAuth(req, res, next);
      expect(req.user.id).toBe("user-1");
      expect(next).toHaveBeenCalled();
    });

    it("should not attach user if user is SUSPENDED", async () => {
      req.headers.authorization = "Bearer valid-token";
      verifyAccessToken.mockReturnValue({ id: "user-1" });
      authService.getAuthUserWithTenant.mockResolvedValue({
        id: "user-1",
        isActive: true,
        status: "SUSPENDED",
      });
      await optionalAuth(req, res, next);
      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
    });

    it("should not attach user if user has no tenantId (branch coverage)", async () => {
      req.headers.authorization = "Bearer valid-token";
      verifyAccessToken.mockReturnValue({ id: "user-1" });
      authService.getAuthUserWithTenant.mockResolvedValue({
        id: "user-1",
        isActive: true,
        status: "ACTIVE",
      });
      await optionalAuth(req, res, next);
      expect(req.user.id).toBe("user-1");
      expect(req.tenantId).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it("should ignore error and call next() if token invalid", async () => {
      req.headers.authorization = "Bearer invalid";
      verifyAccessToken.mockImplementation(() => {
        throw new Error();
      });
      await optionalAuth(req, res, next);
      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
    });
  });

  describe("superAdminOnly", () => {
    it("should return forbidden if no user", () => {
      superAdminOnly(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("should return forbidden if not super admin", () => {
      req.user = { role: { name: "USER" } };
      superAdminOnly(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should call next if super admin", () => {
      req.user = { role: { name: ROLE_NAMES.SUPER_ADMIN } };
      superAdminOnly(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
