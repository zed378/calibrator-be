/**
 * Tests for sso.controller.js
 */

jest.mock("../../services/sso.service", () => ({
  generateAuthnRequest: jest.fn(),
  parseAndVerifyResponse: jest.fn(),
  provisionUser: jest.fn(),
  generateOidcAuthRequest: jest.fn(),
  verifyOidcCallback: jest.fn(),
}));

jest.mock("../../services/tenant.service", () => ({
  getTenantSettings: jest.fn(),
}));

jest.mock("../../models", () => ({
  Tenants: {
    findOne: jest.fn(),
  },
}));

jest.mock("../../utils/jwt.util", () => ({
  generateAccessToken: jest.fn().mockReturnValue("mock-access-token"),
  generateOpaqueRefreshToken: jest.fn().mockReturnValue("mock-refresh-token"),
}));

jest.mock("../../services/session.service", () => ({
  createSession: jest.fn().mockResolvedValue({ id: "session-123" }),
}));

jest.mock("../../utils/response.util", () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

jest.mock("../../utils/appError.util", () => {
  class AppError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  return { AppError };
});

const { Tenants } = require("../../models");
const tenantService = require("../../services/tenant.service");
const ssoService = require("../../services/sso.service");
const ssoController = require("../../controllers/sso.controller");
const { success, error } = require("../../utils/response.util");

describe("sso.controller", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: {},
      query: {},
      params: {},
      ip: "127.0.0.1",
      headers: { "user-agent": "mock-agent" },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      set: jest.fn(),
      send: jest.fn(),
      redirect: jest.fn(),
    };
    next = jest.fn();

    Tenants.findOne.mockResolvedValue({ id: "tenant-1", code: "acme" });
    tenantService.getTenantSettings.mockResolvedValue({
      data: { settings: { sso_enabled: "true", sso_idp_entry_point: "https://idp.com" } },
    });
    ssoService.generateAuthnRequest.mockReturnValue("https://idp.com/redirect");
    ssoService.parseAndVerifyResponse.mockResolvedValue({ email: "user@test.com", firstName: "User", lastName: "Test" });
    ssoService.provisionUser.mockResolvedValue({ id: "user-1", email: "user@test.com" });
    ssoService.generateOidcAuthRequest.mockReturnValue("https://oidc.com/redirect");
    ssoService.verifyOidcCallback.mockResolvedValue({ email: "user@test.com", firstName: "User", lastName: "Test" });

    success.mockImplementation((response, data, meta, message, status) => {
      response.status(status || 200).json({ success: true, data, meta, message });
    });
    error.mockImplementation((response, message, status) => {
      response.status(status || 500).json({ success: false, message });
    });
  });

  describe("ssoLogin", () => {
    it("should generate redirect URL if sso is enabled and valid tenant code is provided", async () => {
      req.body = { tenantCode: "acme" };
      Tenants.findOne.mockResolvedValueOnce({ id: "tenant-1", code: "acme" });
      tenantService.getTenantSettings.mockResolvedValueOnce({
        data: { settings: { sso_enabled: "true", sso_idp_entry_point: "https://idp.com" } },
      });
      ssoService.generateAuthnRequest.mockReturnValueOnce("https://idp.com/redirect");

      await ssoController.ssoLogin(req, res, next);

      expect(success).toHaveBeenCalledWith(res, { redirectUrl: "https://idp.com/redirect" }, null, "SAML redirect URL generated", 200);
    });

    it("should call error response with 404 if tenant is not found", async () => {
      req.body = { tenantCode: "nonexistent" };
      Tenants.findOne.mockResolvedValueOnce(null);

      await ssoController.ssoLogin(req, res, next);

      expect(error).toHaveBeenCalledWith(res, "Tenant not found", 404, expect.any(String));
    });

    it("should call error response with 400 if SSO is not enabled", async () => {
      req.body = { tenantCode: "acme" };
      Tenants.findOne.mockResolvedValueOnce({ id: "tenant-1", code: "acme" });
      tenantService.getTenantSettings.mockResolvedValueOnce({
        data: { settings: { sso_enabled: "false" } },
      });

      await ssoController.ssoLogin(req, res, next);

      expect(error).toHaveBeenCalledWith(res, "SSO is not enabled for this tenant", 400, expect.any(String));
    });

    it("should call error response with 400 if SSO entry point is not configured", async () => {
      req.body = { tenantCode: "acme" };
      Tenants.findOne.mockResolvedValueOnce({ id: "tenant-1", code: "acme" });
      tenantService.getTenantSettings.mockResolvedValueOnce({
        data: { settings: { sso_enabled: "true" } },
      });

      await ssoController.ssoLogin(req, res, next);

      expect(error).toHaveBeenCalledWith(res, "SSO entry point is not configured for this tenant", 400, expect.any(String));
    });

    it("should generate redirect URL when sso_enabled is boolean true", async () => {
      req.body = { tenantCode: "acme" };
      Tenants.findOne.mockResolvedValueOnce({ id: "tenant-1", code: "acme" });
      tenantService.getTenantSettings.mockResolvedValueOnce({
        data: { settings: { sso_enabled: true, sso_idp_entry_point: "https://idp.com" } },
      });
      ssoService.generateAuthnRequest.mockReturnValueOnce("https://idp.com/redirect");

      await ssoController.ssoLogin(req, res, next);

      expect(success).toHaveBeenCalledWith(res, { redirectUrl: "https://idp.com/redirect" }, null, "SAML redirect URL generated", 200);
    });
  });

  describe("ssoCallback", () => {
    it("should process assertion and redirect to frontend with tokens", async () => {
      req.body = { SAMLResponse: "base64-resp", RelayState: "acme" };
      Tenants.findOne.mockResolvedValueOnce({ id: "tenant-1", code: "acme" });
      tenantService.getTenantSettings.mockResolvedValueOnce({
        data: { settings: { sso_enabled: "true" } },
      });
      ssoService.parseAndVerifyResponse.mockResolvedValueOnce({
        email: "user@acme.com",
        firstName: "User",
        lastName: "A",
      });
      ssoService.provisionUser.mockResolvedValueOnce({
        id: "user-1",
        email: "user@acme.com",
      });

      await ssoController.ssoCallback(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining("sso-callback?token=mock-access-token&refreshToken=mock-refresh-token"),
      );
    });

    it("should call error response with 400 if tenantCode is not provided", async () => {
      req.body = { SAMLResponse: "base64" };

      await ssoController.ssoCallback(req, res, next);

      expect(error).toHaveBeenCalledWith(res, "Tenant identifier (RelayState or URL parameter) is required", 400, expect.any(String));
    });

    it("should call error response with 404 if tenant is not found", async () => {
      req.body = { SAMLResponse: "base64-resp", RelayState: "acme" };
      Tenants.findOne.mockResolvedValueOnce(null);

      await ssoController.ssoCallback(req, res, next);

      expect(error).toHaveBeenCalledWith(res, "Tenant not found", 404, expect.any(String));
    });

    it("should call error response with 400 if SSO is not enabled", async () => {
      req.body = { SAMLResponse: "base64-resp", RelayState: "acme" };
      Tenants.findOne.mockResolvedValueOnce({ id: "tenant-1", code: "acme" });
      tenantService.getTenantSettings.mockResolvedValueOnce({
        data: { settings: { sso_enabled: "false" } },
      });

      await ssoController.ssoCallback(req, res, next);

      expect(error).toHaveBeenCalledWith(res, "SSO is not enabled for this tenant", 400, expect.any(String));
    });

    it("should extract tenantCode from params when both params and RelayState are present", async () => {
      req.body = { SAMLResponse: "base64-resp", RelayState: "wrong" };
      req.params = { tenantCode: "acme" };
      Tenants.findOne.mockResolvedValueOnce({ id: "tenant-1", code: "acme" });
      tenantService.getTenantSettings.mockResolvedValueOnce({
        data: { settings: { sso_enabled: "true" } },
      });
      ssoService.parseAndVerifyResponse.mockResolvedValueOnce({ email: "user@acme.com" });
      ssoService.provisionUser.mockResolvedValueOnce({ id: "user-1", email: "user@acme.com" });

      await ssoController.ssoCallback(req, res, next);

      expect(Tenants.findOne).toHaveBeenCalledWith({ where: { code: "acme" } });
      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining("sso-callback"));
    });
  });

  describe("ssoMetadata", () => {
    it("should return XML metadata", async () => {
      req.params = { tenantCode: "acme" };
      Tenants.findOne.mockResolvedValueOnce({ id: "tenant-1", code: "acme" });
      tenantService.getTenantSettings.mockResolvedValueOnce({
        data: { settings: { sso_enabled: "true" } },
      });

      await ssoController.ssoMetadata(req, res, next);

      expect(res.set).toHaveBeenCalledWith("Content-Type", "application/xml");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining("<EntityDescriptor"));
    });

    it("should call error response with 400 if tenant code is missing", async () => {
      await ssoController.ssoMetadata(req, res, next);

      expect(error).toHaveBeenCalledWith(res, "Tenant code is required", 400, expect.any(String));
    });

    it("should call error response with 404 if tenant is not found", async () => {
      req.params = { tenantCode: "nonexistent" };
      Tenants.findOne.mockResolvedValueOnce(null);

      await ssoController.ssoMetadata(req, res, next);

      expect(error).toHaveBeenCalledWith(res, "Tenant not found", 404, expect.any(String));
    });

    it("should return XML metadata when tenantCode is provided via query", async () => {
      req.query = { tenantCode: "acme" };
      Tenants.findOne.mockResolvedValueOnce({ id: "tenant-1", code: "acme" });
      tenantService.getTenantSettings.mockResolvedValueOnce({
        data: { settings: { sso_enabled: "true" } },
      });

      await ssoController.ssoMetadata(req, res, next);

      expect(res.set).toHaveBeenCalledWith("Content-Type", "application/xml");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining("<EntityDescriptor"));
    });
  });

  describe("oidcLogin", () => {
    it("should generate OIDC redirect URL if configured and valid tenant", async () => {
      req.body = { tenantCode: "acme" };
      Tenants.findOne.mockResolvedValueOnce({ id: "tenant-1", code: "acme" });
      tenantService.getTenantSettings.mockResolvedValueOnce({
        data: { settings: { sso_enabled: "true", oidc_client_id: "client-123" } },
      });
      ssoService.generateOidcAuthRequest.mockReturnValueOnce("https://oidc.com/auth");

      await ssoController.oidcLogin(req, res, next);

      expect(success).toHaveBeenCalledWith(res, { redirectUrl: "https://oidc.com/auth" }, null, "OIDC redirect URL generated", 200);
    });

    it("should call error with 404 if tenant is not found", async () => {
      req.body = { tenantCode: "nonexistent" };
      Tenants.findOne.mockResolvedValueOnce(null);

      await ssoController.oidcLogin(req, res, next);

      expect(error).toHaveBeenCalledWith(res, "Tenant not found", 404, expect.any(String));
    });

    it("should call error with 400 if SSO is not enabled", async () => {
      req.body = { tenantCode: "acme" };
      Tenants.findOne.mockResolvedValueOnce({ id: "tenant-1", code: "acme" });
      tenantService.getTenantSettings.mockResolvedValueOnce({
        data: { settings: { sso_enabled: "false" } },
      });

      await ssoController.oidcLogin(req, res, next);

      expect(error).toHaveBeenCalledWith(res, "SSO is not enabled for this tenant", 400, expect.any(String));
    });

    it("should call error with 400 if OIDC client ID is not configured", async () => {
      req.body = { tenantCode: "acme" };
      Tenants.findOne.mockResolvedValueOnce({ id: "tenant-1", code: "acme" });
      tenantService.getTenantSettings.mockResolvedValueOnce({
        data: { settings: { sso_enabled: "true" } },
      });

      await ssoController.oidcLogin(req, res, next);

      expect(error).toHaveBeenCalledWith(res, "OIDC is not configured for this tenant", 400, expect.any(String));
    });
  });

  describe("oidcCallback", () => {
    it("should verify callback and redirect to frontend with tokens", async () => {
      req.body = { code: "auth-code", state: "tenant_acme" };
      req.params = { tenantCode: "acme" };
      Tenants.findOne.mockResolvedValueOnce({ id: "tenant-1", code: "acme" });
      tenantService.getTenantSettings.mockResolvedValueOnce({
        data: { settings: { sso_enabled: "true", oidc_redirect_uri: "https://app.com/callback" } },
      });
      ssoService.verifyOidcCallback.mockResolvedValueOnce({
        email: "user@acme.com",
        firstName: "User",
        lastName: "A",
      });
      ssoService.provisionUser.mockResolvedValueOnce({
        id: "user-1",
        email: "user@acme.com",
      });

      await ssoController.oidcCallback(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining("sso-callback?token=mock-access-token&refreshToken=mock-refresh-token"),
      );
    });

    it("should call error with 400 if tenantCode and code are not provided", async () => {
      req.body = {};

      await ssoController.oidcCallback(req, res, next);

      expect(error).toHaveBeenCalledWith(res, "Tenant identifier and authorization code are required", 400, expect.any(String));
    });

    it("should call error with 404 if tenant is not found", async () => {
      req.body = { code: "auth-code", state: "tenant_acme" };
      Tenants.findOne.mockResolvedValueOnce(null);

      await ssoController.oidcCallback(req, res, next);

      expect(error).toHaveBeenCalledWith(res, "Tenant not found", 404, expect.any(String));
    });

    it("should call error with 400 if SSO is not enabled", async () => {
      req.body = { code: "auth-code", state: "tenant_acme" };
      Tenants.findOne.mockResolvedValueOnce({ id: "tenant-1", code: "acme" });
      tenantService.getTenantSettings.mockResolvedValueOnce({
        data: { settings: { sso_enabled: "false" } },
      });

      await ssoController.oidcCallback(req, res, next);

      expect(error).toHaveBeenCalledWith(res, "SSO is not enabled for this tenant", 400, expect.any(String));
    });

    it("should extract tenantCode from state when params is not provided", async () => {
      req.body = { code: "auth-code", state: "tenant_acme" };
      Tenants.findOne.mockResolvedValueOnce({ id: "tenant-1", code: "acme" });
      tenantService.getTenantSettings.mockResolvedValueOnce({
        data: { settings: { sso_enabled: "true", oidc_redirect_uri: "https://app.com/callback" } },
      });
      ssoService.verifyOidcCallback.mockResolvedValueOnce({ email: "user@acme.com" });
      ssoService.provisionUser.mockResolvedValueOnce({ id: "user-1", email: "user@acme.com" });

      await ssoController.oidcCallback(req, res, next);

      expect(Tenants.findOne).toHaveBeenCalledWith({ where: { code: "acme" } });
      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining("sso-callback"));
    });
  });
});
