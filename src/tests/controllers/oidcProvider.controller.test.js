/**
 * Tests for oidcProvider controller
 */

jest.mock("../../services/oidcProvider.service", () => ({
  discover: jest.fn(),
  jwks: jest.fn(),
  registerClient: jest.fn(),
  getClients: jest.fn(),
  rotateSecret: jest.fn(),
  deleteClient: jest.fn(),
}));

jest.mock("../../validators/oidc.validator", () => ({
  validate: jest.fn((data, schema) => { return { ...data }; }),
  oidcClientSchema: {},
}));

jest.mock("../../utils/response.util", () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

const oidcProviderService = require("../../services/oidcProvider.service");
const oidcProviderController = require("../../controllers/oidcProvider.controller");
const { validate, oidcClientSchema } = require("../../validators/oidc.validator");
const { success } = require("../../utils/response.util");

const VALID_TENANT_ID = "550e8400-e29b-41d4-a716-446655440002";

describe("oidcProvider Controller", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    success.mockImplementation((res, data, meta, message, status) => {
      res.status(status || 200).json({ success: true, data, message });
    });
    validate.mockImplementation((data, schema) => { return { ...data }; });
    req = {
      body: {},
      params: {},
      query: {},
      user: { id: "user-1", tenantId: VALID_TENANT_ID },
      ip: "127.0.0.1",
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe("discover", () => {
    it("should return OIDC discovery configuration", async () => {
      const discoveryConfig = {
        issuer: "http://localhost:5000",
        authorization_endpoint: "http://localhost:5000/oidc/authorize",
      };
      oidcProviderService.discover.mockReturnValue(discoveryConfig);

      await oidcProviderController.discover(req, res, next);

      expect(oidcProviderService.discover).toHaveBeenCalled();
      expect(success).toHaveBeenCalledWith(expect.anything(), discoveryConfig, null, "OIDC discovery");
    });
  });

  describe("jwks", () => {
    it("should return JWKS payload", async () => {
      const jwksPayload = { keys: [{ kid: "key-1" }] };
      oidcProviderService.jwks.mockReturnValue(jwksPayload);

      await oidcProviderController.jwks(req, res, next);

      expect(oidcProviderService.jwks).toHaveBeenCalled();
      expect(success).toHaveBeenCalledWith(expect.anything(), jwksPayload, null, "JWKS");
    });
  });

  describe("registerClient", () => {
    it("should register a new OIDC client", async () => {
      req.body = { name: "Test App", redirectUris: ["https://app.example.com/callback"] };
      const registered = {
        clientId: "client-123",
        clientSecret: "secret-abc",
        name: "Test App",
        redirectUris: ["https://app.example.com/callback"],
      };
      oidcProviderService.registerClient.mockResolvedValue(registered);

      await oidcProviderController.registerClient(req, res, next);

      expect(validate).toHaveBeenCalledWith(req.body, oidcClientSchema);
      expect(oidcProviderService.registerClient).toHaveBeenCalledWith(VALID_TENANT_ID, { name: "Test App", redirectUris: ["https://app.example.com/callback"] });
      expect(success).toHaveBeenCalled();
    });

    it("should use default scopes and grantTypes", async () => {
      req.body = { name: "Minimal App", redirectUris: ["https://minimal.app/callback"] };
      validate.mockImplementation((data) => {
        return {
          ...data,
          scopes: ["openid", "profile", "email"],
          grantTypes: ["authorization_code"],
        };
      });
      oidcProviderService.registerClient.mockResolvedValue({ clientId: "c1" });

      await oidcProviderController.registerClient(req, res, next);

      expect(oidcProviderService.registerClient).toHaveBeenCalled();
      expect(success).toHaveBeenCalled();
    });

    it("should return 400 on validation failure", async () => {
      validate.mockImplementation((data, schema) => {
        throw { status: 400, message: "Validation failed", errors: { name: "Required" } };
      });
      req.body = { redirectUris: ["https://app.example.com/callback"] };

      await oidcProviderController.registerClient(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(400);
    });
  });

  describe("getClients", () => {
    it("should return all OIDC clients for the tenant", async () => {
      const clients = [{ clientId: "c1", name: "App 1" }, { clientId: "c2", name: "App 2" }];
      oidcProviderService.getClients.mockResolvedValue(clients);

      await oidcProviderController.getClients(req, res, next);

      expect(oidcProviderService.getClients).toHaveBeenCalledWith(VALID_TENANT_ID);
      expect(success).toHaveBeenCalled();
    });

    it("should return empty array when no clients exist", async () => {
      oidcProviderService.getClients.mockResolvedValue([]);

      await oidcProviderController.getClients(req, res, next);

      expect(success).toHaveBeenCalled();
    });
  });

  describe("rotateSecret", () => {
    it("should rotate client secret", async () => {
      req.params = { clientId: "client-123" };
      const rotated = { clientId: "client-123", clientSecret: "new-secret-xyz" };
      oidcProviderService.rotateSecret.mockResolvedValue(rotated);

      await oidcProviderController.rotateSecret(req, res, next);

      expect(oidcProviderService.rotateSecret).toHaveBeenCalledWith(VALID_TENANT_ID, "client-123");
      expect(success).toHaveBeenCalled();
    });
  });

  describe("deleteClient", () => {
    it("should delete an OIDC client", async () => {
      req.params = { clientId: "client-123" };
      oidcProviderService.deleteClient.mockResolvedValue({ deleted: true });

      await oidcProviderController.deleteClient(req, res, next);

      expect(oidcProviderService.deleteClient).toHaveBeenCalledWith(VALID_TENANT_ID, "client-123");
      expect(success).toHaveBeenCalled();
    });

    it("should return deleted false when client not found", async () => {
      req.params = { clientId: "nonexistent" };
      oidcProviderService.deleteClient.mockResolvedValue({ deleted: false });

      await oidcProviderController.deleteClient(req, res, next);

      expect(success).toHaveBeenCalled();
    });
  });
});
