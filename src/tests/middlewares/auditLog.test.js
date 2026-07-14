/**
 * Tests for auditLog middleware
 */
const { auditAction, withAudit } = require("../../middlewares/auditLog.middleware");
const { logger } = require("../../middlewares/activityLog.middleware");

describe("auditLog middleware", () => {
  let req, res, next;
  let spyInfo, spyError;

  beforeEach(() => {
    spyInfo = jest.spyOn(logger, "info").mockImplementation(() => {});
    spyError = jest.spyOn(logger, "error").mockImplementation(() => {});
    req = {
      ip: "127.0.0.1",
      get: jest.fn().mockReturnValue("Mozilla/5.0"),
      user: { id: "test-user-id", tenantId: "test-tenant-id" },
      body: { name: "test-role" },
      params: { id: "123" },
    };
    res = {
      statusCode: 200,
      json: jest.fn().mockImplementation((body) => body),
    };
    next = jest.fn();
  });

  afterEach(() => {
    spyInfo.mockRestore();
    spyError.mockRestore();
  });

  describe("auditAction", () => {
    it("should log audit action and intercept res.json", async () => {
      const middleware = auditAction("role_create", "Role");
      await middleware(req, res, next);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("AUDIT: role_create"),
        expect.objectContaining({
          userId: "test-user-id",
          tenantId: "test-tenant-id",
          resource: "Role",
          action: "role_create",
        })
      );
      expect(next).toHaveBeenCalled();

      // Trigger the intercepted res.json
      const testBody = { success: true };
      res.json(testBody);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("AUDIT: role_create complete"),
        expect.objectContaining({
          userId: "test-user-id",
          tenantId: "test-tenant-id",
          statusCode: 200,
          success: true,
        })
      );
    });

    it("should default user info if req.user is missing", async () => {
      delete req.user;
      const middleware = auditAction("role_create", "Role");
      await middleware(req, res, next);

      expect(logger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          userId: "anonymous",
          tenantId: null,
        })
      );
    });
  });

  describe("withAudit", () => {
    it("should audit log start, call handler, and log complete on success", async () => {
      const handler = jest.fn().mockImplementation(async (req, res, next) => {
        res.statusCode = 201;
      });

      const middleware = withAudit("role_delete", "Role")(handler);
      await middleware(req, res, next);

      expect(logger.info).toHaveBeenCalledWith(
        "AUDIT START: role_delete",
        expect.any(Object)
      );
      expect(handler).toHaveBeenCalledWith(req, res, next);
      expect(logger.info).toHaveBeenCalledWith(
        "AUDIT COMPLETE: role_delete",
        expect.objectContaining({
          statusCode: 201,
          success: true,
        })
      );
    });

    it("should audit log error when handler throws", async () => {
      const testError = new Error("something went wrong");
      const handler = jest.fn().mockRejectedValue(testError);

      const middleware = withAudit("role_delete", "Role")(handler);
      await expect(middleware(req, res, next)).rejects.toThrow("something went wrong");

      expect(logger.error).toHaveBeenCalledWith(
        "AUDIT ERROR: role_delete",
        expect.objectContaining({
          error: "something went wrong",
        })
      );
    });
  });
});
