/**
 * Tests for enforceQuota middleware
 */
const { enforceSeatQuota, enforceStorageQuota, requireFeature } = require("../../middlewares/enforceQuota.middleware");
const quotaService = require("../../services/quota.service");
const { AppError } = require("../../utils/appError.util");

describe("enforceQuota middleware", () => {
  let req, res, next;
  let spySeat, spyStorage, spyFeature;

  beforeEach(() => {
    spySeat = jest.spyOn(quotaService, "checkSeatQuota").mockImplementation(() => {});
    spyStorage = jest.spyOn(quotaService, "checkStorageQuota").mockImplementation(() => {});
    spyFeature = jest.spyOn(quotaService, "checkFeature").mockImplementation(() => {});
    req = {
      headers: {},
      user: {
        tenantId: "tenant-123",
        role: { name: "TENANT_ADMIN" },
      },
    };
    res = {};
    next = jest.fn();
  });

  afterEach(() => {
    spySeat.mockRestore();
    spyStorage.mockRestore();
    spyFeature.mockRestore();
  });

  describe("enforceSeatQuota", () => {
    it("should allow super admins to bypass check", async () => {
      req.user.role.name = "SUPER_ADMIN";
      const middleware = enforceSeatQuota();
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(spySeat).not.toHaveBeenCalled();
    });

    it("should call next if seat quota is allowed", async () => {
      spySeat.mockResolvedValue({ allowed: true });
      const middleware = enforceSeatQuota();
      await middleware(req, res, next);
      expect(spySeat).toHaveBeenCalledWith("tenant-123");
      expect(next).toHaveBeenCalledWith();
    });

    it("should call next with AppError if seat quota is not allowed", async () => {
      spySeat.mockResolvedValue({ allowed: false, used: 5, limit: 5 });
      const middleware = enforceSeatQuota();
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.status).toBe(403);
      expect(error.message).toContain("Seat limit reached");
    });
  });

  describe("enforceStorageQuota", () => {
    it("should allow super admins to bypass check", async () => {
      req.user.role.name = "SUPERADMIN";
      const middleware = enforceStorageQuota();
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(spyStorage).not.toHaveBeenCalled();
    });

    it("should call next if storage quota is allowed", async () => {
      req.headers["content-length"] = "1024";
      spyStorage.mockResolvedValue({ allowed: true });
      const middleware = enforceStorageQuota();
      await middleware(req, res, next);
      expect(spyStorage).toHaveBeenCalledWith("tenant-123", 1024);
      expect(next).toHaveBeenCalledWith();
    });

    it("should call next with AppError if storage quota is not allowed", async () => {
      spyStorage.mockResolvedValue({ allowed: false, usedMb: 10, limitMb: 10 });
      const middleware = enforceStorageQuota();
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.status).toBe(413);
    });
  });

  describe("requireFeature", () => {
    it("should allow super admins to bypass check", async () => {
      req.user.role.name = "SUPER_ADMIN";
      const middleware = requireFeature("analytics");
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(spyFeature).not.toHaveBeenCalled();
    });

    it("should call next if feature is allowed", async () => {
      spyFeature.mockResolvedValue({ allowed: true });
      const middleware = requireFeature("analytics");
      await middleware(req, res, next);
      expect(spyFeature).toHaveBeenCalledWith("tenant-123", "analytics");
      expect(next).toHaveBeenCalledWith();
    });

    it("should call next with AppError if feature is not allowed", async () => {
      spyFeature.mockResolvedValue({ allowed: false, plan: "Basic" });
      const middleware = requireFeature("analytics");
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.status).toBe(402);
    });
  });
});
