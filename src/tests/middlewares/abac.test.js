/**
 * Tests for abac middleware
 */
const { abac } = require("../../middlewares/abac.middleware");
const tenantService = require("../../services/tenant.service");
const RolesService = require("../../services/roles.service");

describe("abac middleware", () => {
  let req, res, next;
  let spyGetTenant, spyMatrix;

  beforeEach(() => {
    spyGetTenant = jest.spyOn(tenantService, "getTenantByIdForMiddleware").mockImplementation(() => {});
    spyMatrix = jest.spyOn(RolesService, "getRolePermissionsMatrix").mockImplementation(() => {});

    req = {
      user: {
        id: "user-123",
        tenantId: "tenant-123",
        role: { id: "role-123", name: "TENANT_ADMIN" },
      },
      params: {},
      body: {},
      query: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return 401 if user or role is missing", async () => {
    req.user = null;
    const middleware = abac(["tenant:read"]);
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should bypass check for super admins", async () => {
    req.user.role.name = "SUPER_ADMIN";
    const middleware = abac(["tenant:read"]);
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.abacContext.allowed).toBe(true);
  });

  it("should handle checkTenant and match tenant ID", async () => {
    req.params.tenantId = "tenant-123";
    spyGetTenant.mockResolvedValue({ id: "tenant-123" });
    spyMatrix.mockResolvedValue({
      management: ["read"],
    });

    const middleware = abac(["tenant:read"], { checkTenant: true });
    await middleware(req, res, next);

    expect(spyGetTenant).toHaveBeenCalledWith("tenant-123");
    expect(next).toHaveBeenCalled();
  });

  it("should return 403 if tenant ID does not match", async () => {
    req.params.tenantId = "tenant-999";
    spyGetTenant.mockResolvedValue({ id: "tenant-999" });

    const middleware = abac(["tenant:read"], { checkTenant: true });
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 404 if tenant not found", async () => {
    req.params.tenantId = "tenant-999";
    spyGetTenant.mockResolvedValue(null);

    const middleware = abac(["tenant:read"], { checkTenant: true });
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("should handle checkSelf when user id matches resource owner id", async () => {
    req.params.userId = "user-123";
    const middleware = abac(["user:update"], { checkSelf: true });
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.abacContext.reason).toBe("self");
  });

  it("should enforce matrix permissions and return 403 on failure", async () => {
    spyMatrix.mockResolvedValue({
      management: [],
    });

    const middleware = abac(["tenant:write"]);
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
