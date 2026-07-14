/**
 * Tests for tenant controller
 */

jest.mock("../../services/tenant.service", () => ({
  fetchTenants: jest.fn(),
  fetchSpecificTenant: jest.fn(),
  createTenant: jest.fn(),
  updateTenant: jest.fn(),
  deleteTenant: jest.fn(),
  getPublicBranding: jest.fn(),
  getTenantSettings: jest.fn(),
  updateTenantSettings: jest.fn(),
  getTenantUserCount: jest.fn(),
}));

jest.mock("../../services/tenantUpload.service", () => ({
  updateTenantLogo: jest.fn(),
  removeTenantLogo: jest.fn(),
}));

jest.mock("../../utils/response.util", () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

jest.mock("../../utils/upload.util", () => ({
  deleteUpload: jest.fn(),
}));

const tenantService = require("../../services/tenant.service");
const tenantUploadService = require("../../services/tenantUpload.service");
const tenantController = require("../../controllers/tenant.controller");
const { success } = require("../../utils/response.util");

const VALID_TENANT_ID = "550e8400-e29b-41d4-a716-446655440001";
const VALID_USER_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("tenant Controller", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    success.mockImplementation((res, data, meta, message, status) => {
      res.status(status || 200).json({ success: true, data, message });
    });
    // error mock: actually call res.status().json() so validation errors work
    const { error } = require("../../utils/response.util");
    error.mockImplementation((res, message, statusCode, details) => {
      res.status(statusCode).json({
        success: false,
        status: statusCode,
        message,
        data: null,
        ...(details ? { details } : {}),
      });
    });
    req = {
      query: {},
      params: {},
      body: {},
      headers: {},
      user: {
        id: VALID_USER_ID,
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe("getAllTenants", () => {
    it("should return paginated tenants", async () => {
      req.query = { page: "1", limit: "10" };
      tenantService.fetchTenants.mockResolvedValue({
        data: { rows: [{ id: "tenant-1", name: "Test" }] },
        meta: { total: 1 },
        message: "Fetch tenants successful",
        status: 200,
      });

      await tenantController.getAllTenants(req, res, next);

      expect(tenantService.fetchTenants).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          limit: 10,
        }),
      );
      expect(success).toHaveBeenCalled();
    });

    it("should filter by status", async () => {
      req.query = { page: "1", limit: "10", status: "ACTIVE" };
      tenantService.fetchTenants.mockResolvedValue({
        data: { rows: [] },
        meta: { total: 0 },
      });

      await tenantController.getAllTenants(req, res, next);

      expect(tenantService.fetchTenants).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "ACTIVE",
        }),
      );
    });

    it("should filter by search term", async () => {
      req.query = { page: "1", limit: "10", find: "test" };
      tenantService.fetchTenants.mockResolvedValue({
        data: { rows: [] },
        meta: { total: 0 },
      });

      await tenantController.getAllTenants(req, res, next);

      expect(tenantService.fetchTenants).toHaveBeenCalledWith(
        expect.objectContaining({
          find: "test",
        }),
      );
    });

    it("should return 400 on validation error", async () => {
      req.query = { page: "-1" };
      tenantService.fetchTenants.mockResolvedValue({
        data: { rows: [] },
        meta: { total: 0 },
      });

      await tenantController.getAllTenants(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("getSpecificTenant", () => {
    it("should return a specific tenant", async () => {
      req.params = { tenantId: VALID_TENANT_ID };
      tenantService.fetchSpecificTenant.mockResolvedValue({
        data: { id: VALID_TENANT_ID, name: "Test Tenant" },
        message: "Fetch tenant successful",
        status: 200,
      });

      await tenantController.getSpecificTenant(req, res, next);

      expect(tenantService.fetchSpecificTenant).toHaveBeenCalledWith(
        VALID_TENANT_ID,
      );
      expect(success).toHaveBeenCalled();
    });

    it("should return 404 when tenant not found", async () => {
      req.params = { tenantId: VALID_TENANT_ID };
      tenantService.fetchSpecificTenant.mockResolvedValue({
        status: 404,
        message: "Tenant not found",
        data: null,
      });

      await tenantController.getSpecificTenant(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          status: 404,
        }),
      );
    });

    it("should return 400 on invalid tenantId", async () => {
      req.params = { tenantId: "not-a-uuid" };

      await tenantController.getSpecificTenant(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("getPublicBranding", () => {
    it("should return public branding", async () => {
      req.headers["x-tenant-id"] = VALID_TENANT_ID;
      tenantService.getPublicBranding.mockResolvedValue({
        id: VALID_TENANT_ID,
        primaryColor: "#000000",
        logo: "logo.png",
      });

      await tenantController.getPublicBranding(req, res, next);

      expect(tenantService.getPublicBranding).toHaveBeenCalledWith(
        VALID_TENANT_ID,
      );
      expect(success).toHaveBeenCalled();
    });

    it("should accept tenantId from query param", async () => {
      req.query = { tenantId: VALID_TENANT_ID };
      tenantService.getPublicBranding.mockResolvedValue({
        id: VALID_TENANT_ID,
        primaryColor: "#000000",
      });

      await tenantController.getPublicBranding(req, res, next);

      expect(tenantService.getPublicBranding).toHaveBeenCalledWith(
        VALID_TENANT_ID,
      );
    });

    it("should return 404 when tenant not found", async () => {
      req.headers["x-tenant-id"] = VALID_TENANT_ID;
      tenantService.getPublicBranding.mockResolvedValue(null);

      await tenantController.getPublicBranding(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          status: 404,
          message: "Tenant not found",
        }),
      );
    });
  });

  describe("createTenant", () => {
    it("should create a tenant", async () => {
      req.body = {
        name: "Test Tenant",
        code: "test",
        description: "Test description",
      };
      tenantService.createTenant.mockResolvedValue({
        data: { id: "tenant-new", name: "Test Tenant" },
        message: "Tenant created successfully",
        status: 201,
      });

      await tenantController.createTenant(req, res, next);

      expect(tenantService.createTenant).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Test Tenant",
          code: "test",
        }),
        VALID_USER_ID,
      );
      expect(success).toHaveBeenCalled();
    });

    it("should handle uploaded logo", async () => {
      req.body = {
        name: "Test Tenant",
        code: "test",
      };
      req.file = { originalname: "logo.png" };
      req.uploadFilename = "logo-uploaded.png";
      tenantService.createTenant.mockResolvedValue({
        data: {
          id: "tenant-new",
          name: "Test Tenant",
          logo: "logo-uploaded.png",
        },
        message: "Tenant created successfully",
        status: 201,
      });

      await tenantController.createTenant(req, res, next);

      expect(tenantService.createTenant).toHaveBeenCalledWith(
        expect.objectContaining({
          logo: "logo-uploaded.png",
        }),
        VALID_USER_ID,
      );
    });

    it("should return 400 on validation error", async () => {
      req.body = { name: "" };

      await tenantController.createTenant(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should clean up uploaded file on error", async () => {
      req.body = {
        name: "Test Tenant",
        code: "test",
      };
      req.file = { originalname: "logo.png" };
      req.uploadFilename = "logo-uploaded.png";
      const mockError = { status: 500, message: "Database error" };
      tenantService.createTenant.mockRejectedValue(mockError);

      await tenantController.createTenant(req, res, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("updateTenant", () => {
    it("should update a tenant", async () => {
      req.params = { tenantId: VALID_TENANT_ID };
      req.body = { name: "Updated Tenant" };
      tenantService.updateTenant.mockResolvedValue({
        data: { id: VALID_TENANT_ID, name: "Updated Tenant" },
        message: "Tenant updated successfully",
        status: 200,
      });

      await tenantController.updateTenant(req, res, next);

      expect(tenantService.updateTenant).toHaveBeenCalledWith(
        VALID_TENANT_ID,
        expect.objectContaining({
          name: "Updated Tenant",
        }),
        VALID_USER_ID,
      );
      expect(success).toHaveBeenCalled();
    });

    it("should return 404 when tenant not found", async () => {
      req.params = { tenantId: VALID_TENANT_ID };
      req.body = { name: "Updated Tenant" };
      tenantService.updateTenant.mockResolvedValue({
        status: 404,
        message: "Tenant not found",
        data: null,
      });

      await tenantController.updateTenant(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should handle uploaded logo update", async () => {
      req.params = { tenantId: VALID_TENANT_ID };
      req.body = { name: "Updated Tenant" };
      req.file = { originalname: "logo.png" };
      req.uploadFilename = "logo-updated.png";
      tenantService.updateTenant.mockResolvedValue({
        data: {
          id: VALID_TENANT_ID,
          name: "Updated Tenant",
          logo: "logo-updated.png",
        },
        message: "Tenant updated successfully",
        status: 200,
      });

      await tenantController.updateTenant(req, res, next);

      expect(tenantService.updateTenant).toHaveBeenCalledWith(
        VALID_TENANT_ID,
        expect.objectContaining({
          logo: "logo-updated.png",
        }),
        VALID_USER_ID,
      );
    });
  });

  describe("deleteTenant", () => {
    it("should delete a tenant", async () => {
      req.query = { tenantId: VALID_TENANT_ID };
      req.body = { deletedBy: VALID_USER_ID };
      tenantService.deleteTenant.mockResolvedValue({
        data: { message: "Tenant deleted successfully" },
        status: 200,
      });

      await tenantController.deleteTenant(req, res, next);

      expect(tenantService.deleteTenant).toHaveBeenCalledWith(
        VALID_TENANT_ID,
        VALID_USER_ID,
      );
      expect(success).toHaveBeenCalled();
    });

    it("should return 404 when tenant not found", async () => {
      req.query = { tenantId: VALID_TENANT_ID };
      req.body = { deletedBy: VALID_USER_ID };
      tenantService.deleteTenant.mockResolvedValue({
        status: 404,
        message: "Tenant not found",
        data: null,
      });

      await tenantController.deleteTenant(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 400 on validation error", async () => {
      req.query = { tenantId: "not-a-uuid" };
      req.body = { deletedBy: VALID_USER_ID };

      await tenantController.deleteTenant(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("getTenantSettings", () => {
    it("should return tenant settings", async () => {
      req.params = { tenantId: VALID_TENANT_ID };
      tenantService.getTenantSettings.mockResolvedValue({
        data: { theme: "dark", language: "en" },
        message: "Fetch tenant settings successful",
        status: 200,
      });

      await tenantController.getTenantSettings(req, res, next);

      expect(tenantService.getTenantSettings).toHaveBeenCalledWith(
        VALID_TENANT_ID,
      );
      expect(success).toHaveBeenCalled();
    });

    it("should return 404 when tenant not found", async () => {
      req.params = { tenantId: VALID_TENANT_ID };
      tenantService.getTenantSettings.mockResolvedValue({
        status: 404,
        message: "Tenant not found",
        data: null,
      });

      await tenantController.getTenantSettings(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 400 on invalid tenantId", async () => {
      req.params = { tenantId: "not-a-uuid" };

      await tenantController.getTenantSettings(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("updateTenantSettings", () => {
    it("should update tenant settings", async () => {
      req.params = { tenantId: VALID_TENANT_ID };
      req.body = { theme: "dark", language: "en" };
      tenantService.updateTenantSettings.mockResolvedValue({
        data: { theme: "dark", language: "en" },
        message: "Tenant settings updated successfully",
        status: 200,
      });

      await tenantController.updateTenantSettings(req, res, next);

      expect(tenantService.updateTenantSettings).toHaveBeenCalledWith(
        VALID_TENANT_ID,
        { theme: "dark", language: "en" },
        VALID_USER_ID,
      );
      expect(success).toHaveBeenCalled();
    });

    it("should return 404 when tenant not found", async () => {
      req.params = { tenantId: VALID_TENANT_ID };
      req.body = { theme: "dark" };
      tenantService.updateTenantSettings.mockResolvedValue({
        status: 404,
        message: "Tenant not found",
        data: null,
      });

      await tenantController.updateTenantSettings(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("getTenantUserCount", () => {
    it("should return tenant user count", async () => {
      req.params = { tenantId: VALID_TENANT_ID };
      tenantService.getTenantUserCount.mockResolvedValue({
        data: { total: 5, active: 4, inactive: 1 },
        message: "Fetch tenant user count successful",
        status: 200,
      });

      await tenantController.getTenantUserCount(req, res, next);

      expect(tenantService.getTenantUserCount).toHaveBeenCalledWith(
        VALID_TENANT_ID,
      );
      expect(success).toHaveBeenCalled();
    });

    it("should return 404 when tenant not found", async () => {
      req.params = { tenantId: VALID_TENANT_ID };
      tenantService.getTenantUserCount.mockResolvedValue({
        status: 404,
        message: "Tenant not found",
        data: null,
      });

      await tenantController.getTenantUserCount(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 400 on invalid tenantId", async () => {
      req.params = { tenantId: "not-a-uuid" };

      await tenantController.getTenantUserCount(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("uploadTenantLogo", () => {
    it("should upload tenant logo", async () => {
      req.body = { tenantId: VALID_TENANT_ID };
      req.file = { originalname: "logo.png" };
      req.uploadFilename = "logo-uploaded.png";
      tenantUploadService.updateTenantLogo.mockResolvedValue({
        data: { logo: "logo-uploaded.png" },
        message: "Tenant logo uploaded successfully",
        status: 200,
      });

      await tenantController.uploadTenantLogo(req, res, next);

      expect(tenantUploadService.updateTenantLogo).toHaveBeenCalledWith(
        VALID_TENANT_ID,
        "logo-uploaded.png",
        VALID_USER_ID,
      );
      expect(success).toHaveBeenCalled();
    });

    it("should return 400 when no file uploaded", async () => {
      req.body = { tenantId: VALID_TENANT_ID };
      req.file = null;

      await tenantController.uploadTenantLogo(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        status: 400,
        message: "No file uploaded",
        data: null,
      });
    });
  });

  describe("removeTenantLogo", () => {
    it("should remove tenant logo", async () => {
      req.body = { tenantId: VALID_TENANT_ID };
      tenantUploadService.removeTenantLogo.mockResolvedValue({
        data: { message: "Tenant logo removed successfully" },
        status: 200,
      });

      await tenantController.removeTenantLogo(req, res, next);

      expect(tenantUploadService.removeTenantLogo).toHaveBeenCalledWith(
        VALID_TENANT_ID,
        VALID_USER_ID,
      );
      expect(success).toHaveBeenCalled();
    });
  });
});
