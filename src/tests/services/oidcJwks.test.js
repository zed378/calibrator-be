/**
 * Tests for OIDC JWKS Service
 */

jest.mock("axios", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));
jest.mock("jsonwebtoken", () => ({
  decode: jest.fn(),
  verify: jest.fn(),
}));
jest.mock("jwk-to-pem", () => jest.fn().mockReturnValue("mock-pem-key"));
jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const oidcJwks = require("../../services/oidcJwks");
const { AppError } = require("../../utils/appError.util");
const axios = require("axios");
const jwt = require("jsonwebtoken");

describe("oidcJwks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.get.mockReset();
    axios.post.mockReset();
    jwt.decode.mockReset();
    jwt.verify.mockReset();
    oidcJwks.clearCache();
  });

  describe("verifyIdToken", () => {
    it("should throw error when idToken is missing", async () => {
      await expect(
        oidcJwks.verifyIdToken(null, "https://issuer.com", "client-1"),
      ).rejects.toThrow("id_token is required");
    });

    it("should throw error when issuer is missing", async () => {
      await expect(
        oidcJwks.verifyIdToken("token", null, "client-1"),
      ).rejects.toThrow("OIDC issuer URL is required");
    });

    it("should throw error when clientId is missing", async () => {
      await expect(
        oidcJwks.verifyIdToken("token", "https://issuer.com", null),
      ).rejects.toThrow("OIDC client ID is required");
    });

    it("should throw error when idToken format is invalid", async () => {
      jwt.decode.mockReturnValue(null);

      await expect(
        oidcJwks.verifyIdToken(
          "invalid-token",
          "https://issuer.com",
          "client-1",
        ),
      ).rejects.toThrow("Invalid id_token format");
    });

    it("should throw error for unsupported algorithm", async () => {
      jwt.decode.mockReturnValue({
        header: { kid: "key-1", alg: "HS256" },
      });

      await expect(
        oidcJwks.verifyIdToken("token", "https://issuer.com", "client-1"),
      ).rejects.toThrow("Unsupported or insecure JWT algorithm");
    });

    it("should verify token with valid RS256 algorithm", async () => {
      const decodedToken = {
        sub: "user-1",
        email: "user@example.com",
        given_name: "John",
        family_name: "Doe",
      };

      jwt.decode.mockReturnValue({
        header: { kid: "key-1", alg: "RS256" },
      });

      axios.get.mockResolvedValueOnce({
        data: {
          keys: [
            {
              kid: "key-1",
              alg: "RS256",
              kty: "RSA",
              n: "modulus",
              e: "exponent",
            },
          ],
        },
      });

      jwt.verify.mockReturnValue(decodedToken);

      const result = await oidcJwks.verifyIdToken(
        "valid-token",
        "https://issuer.com",
        "client-1",
      );

      expect(result).toEqual(decodedToken);
      expect(axios.get).toHaveBeenCalledWith(
        "https://issuer.com/.well-known/jwks.json",
        expect.any(Object),
      );
    });

    it("should verify token with ES256 algorithm", async () => {
      const decodedToken = { sub: "user-1" };

      jwt.decode.mockReturnValue({
        header: { kid: "key-1", alg: "ES256" },
      });

      axios.get.mockResolvedValueOnce({
        data: {
          keys: [
            { kid: "key-1", alg: "ES256", kty: "EC", n: "curve", e: "point" },
          ],
        },
      });

      jwt.verify.mockReturnValue(decodedToken);

      const result = await oidcJwks.verifyIdToken(
        "token",
        "https://issuer.com",
        "client-1",
      );

      expect(result).toEqual(decodedToken);
    });

    it("should throw error when kid is missing from JWT header", async () => {
      jwt.decode.mockReturnValue({ header: { alg: "RS256" } });

      axios.get.mockResolvedValueOnce({
        data: {
          keys: [
            {
              kid: "key-1",
              alg: "RS256",
              kty: "RSA",
              n: "modulus",
              e: "exponent",
            },
          ],
        },
      });

      await expect(
        oidcJwks.verifyIdToken("token", "https://issuer.com", "client-1"),
      ).rejects.toThrow("JWT missing 'kid' header");
    });

    it("should throw error when no matching key found for kid", async () => {
      jwt.decode.mockReturnValue({
        header: { kid: "unknown-key", alg: "RS256" },
      });

      axios.get.mockResolvedValueOnce({
        data: {
          keys: [
            {
              kid: "key-1",
              alg: "RS256",
              kty: "RSA",
              n: "modulus",
              e: "exponent",
            },
          ],
        },
      });

      await expect(
        oidcJwks.verifyIdToken("token", "https://issuer.com", "client-1"),
      ).rejects.toThrow(
        "No matching public key found for JWT with kid: unknown-key",
      );
    });

    it("should use cached JWKS on subsequent calls", async () => {
      const decodedToken = { sub: "user-1" };

      jwt.decode.mockReturnValue({
        header: { kid: "key-1", alg: "RS256" },
      });

      axios.get.mockResolvedValueOnce({
        data: {
          keys: [
            {
              kid: "key-1",
              alg: "RS256",
              kty: "RSA",
              n: "modulus",
              e: "exponent",
            },
          ],
        },
      });

      jwt.verify.mockReturnValue(decodedToken);

      // First call - fetches JWKS
      await oidcJwks.verifyIdToken("token-1", "https://issuer.com", "client-1");

      // Second call - should use cache
      await oidcJwks.verifyIdToken("token-2", "https://issuer.com", "client-1");

      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it("should throw TokenExpiredError as AppError", async () => {
      jwt.decode.mockReturnValue({
        header: { kid: "key-1", alg: "RS256" },
      });

      axios.get.mockResolvedValueOnce({
        data: {
          keys: [
            {
              kid: "key-1",
              alg: "RS256",
              kty: "RSA",
              n: "modulus",
              e: "exponent",
            },
          ],
        },
      });

      const TokenExpiredError = new Error("token expired");
      TokenExpiredError.name = "TokenExpiredError";
      jwt.verify.mockImplementationOnce(() => {
        throw TokenExpiredError;
      });

      await expect(
        oidcJwks.verifyIdToken("token", "https://issuer.com", "client-1"),
      ).rejects.toThrow("id_token has expired");
    });

    it("should throw JsonWebTokenError as AppError", async () => {
      jwt.decode.mockReturnValue({
        header: { kid: "key-1", alg: "RS256" },
      });

      axios.get.mockResolvedValueOnce({
        data: {
          keys: [
            {
              kid: "key-1",
              alg: "RS256",
              kty: "RSA",
              n: "modulus",
              e: "exponent",
            },
          ],
        },
      });

      const JsonWebTokenError = new Error("invalid token");
      JsonWebTokenError.name = "JsonWebTokenError";
      jwt.verify.mockImplementationOnce(() => {
        throw JsonWebTokenError;
      });

      await expect(
        oidcJwks.verifyIdToken("token", "https://issuer.com", "client-1"),
      ).rejects.toThrow("Invalid id_token signature");
    });
  });

  describe("verifyOidcCallback", () => {
    it("should throw error when no id_token returned", async () => {
      axios.post.mockResolvedValueOnce({ data: {} });

      await expect(
        oidcJwks.verifyOidcCallback(
          "auth-code",
          {},
          "http://localhost/callback",
        ),
      ).rejects.toThrow("No id_token returned from token endpoint");
    });

    it("should return user info from decoded token", async () => {
      const decodedToken = {
        email: "USER@Example.com",
        preferred_username: null,
        upn: null,
        given_name: "John",
        name: "John Doe",
        family_name: "Doe",
        nonce: "nonce-123",
        auth_time: 1234567890,
        acr: "urn:mace:incommon:iap:silver",
        amr: ["pwd"],
        sub: "user-123",
      };

      axios.post.mockResolvedValueOnce({
        data: { id_token: "valid-token" },
      });

      jwt.decode.mockReturnValue({
        header: { kid: "key-1", alg: "RS256" },
      });

      axios.get.mockResolvedValueOnce({
        data: {
          keys: [
            {
              kid: "key-1",
              alg: "RS256",
              kty: "RSA",
              n: "modulus",
              e: "exponent",
            },
          ],
        },
      });

      jwt.verify.mockReturnValue(decodedToken);

      const ssoSettings = {
        oidc_client_id: "client-1",
        oidc_client_secret: "secret",
        oidc_authority: "https://login.microsoftonline.com/common/oauth2/v2.0",
      };

      const result = await oidcJwks.verifyOidcCallback(
        "auth-code",
        ssoSettings,
        "http://localhost/callback",
      );

      expect(result.email).toBe("user@example.com");
      expect(result.firstName).toBe("John");
      expect(result.lastName).toBe("Doe");
      expect(result.nonce).toBe("nonce-123");
      expect(result.sub).toBe("user-123");
    });

    it("should use default values when name fields are missing", async () => {
      const decodedToken = {
        email: "test@example.com",
      };

      axios.post.mockResolvedValueOnce({
        data: { id_token: "valid-token" },
      });

      jwt.decode.mockReturnValue({
        header: { kid: "key-1", alg: "RS256" },
      });

      axios.get.mockResolvedValueOnce({
        data: {
          keys: [
            {
              kid: "key-1",
              alg: "RS256",
              kty: "RSA",
              n: "modulus",
              e: "exponent",
            },
          ],
        },
      });

      jwt.verify.mockReturnValue(decodedToken);

      const ssoSettings = {
        oidc_client_id: "client-1",
        oidc_client_secret: "secret",
      };

      const result = await oidcJwks.verifyOidcCallback(
        "auth-code",
        ssoSettings,
        "http://localhost/callback",
      );

      expect(result.email).toBe("test@example.com");
      expect(result.firstName).toBe("SSO");
      expect(result.lastName).toBe("User");
    });

    it("should throw AppError on OIDC verification failure", async () => {
      axios.post.mockResolvedValueOnce({
        data: { id_token: "invalid-token" },
      });

      jwt.decode.mockReturnValue({
        header: { kid: "key-1", alg: "RS256" },
      });

      axios.get.mockRejectedValueOnce(new Error("Network error"));

      const ssoSettings = {
        oidc_client_id: "client-1",
        oidc_client_secret: "secret",
        oidc_authority: "https://login.microsoftonline.com/common/oauth2/v2.0",
      };

      await expect(
        oidcJwks.verifyOidcCallback(
          "auth-code",
          ssoSettings,
          "http://localhost/callback",
        ),
      ).rejects.toThrow("Failed to fetch IdP public keys");
    });
  });

  describe("getJwksInfo", () => {
    it("should return JWKS metadata", async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          keys: [
            {
              kid: "key-1",
              alg: "RS256",
              use: "sig",
              key_ops: ["verify"],
              kty: "RSA",
            },
            {
              kid: "key-2",
              alg: "ES256",
              use: "sig",
              kty: "EC",
            },
          ],
        },
      });

      const result = await oidcJwks.getJwksInfo("https://issuer.com");

      expect(result.issuer).toBe("https://issuer.com");
      expect(result.keyCount).toBe(2);
      expect(result.keys).toHaveLength(2);
      expect(result.keys[0]).toEqual({
        kid: "key-1",
        alg: "RS256",
        use: "sig",
        keyOps: ["verify"],
      });
    });
  });

  describe("clearCache", () => {
    it("should clear the JWKS cache", () => {
      oidcJwks.clearCache();
      const stats = oidcJwks.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe("getCacheStats", () => {
    it("should return cache statistics", () => {
      const stats = oidcJwks.getCacheStats();
      expect(stats).toHaveProperty("size");
      expect(stats).toHaveProperty("ttl");
      expect(typeof stats.size).toBe("number");
      expect(typeof stats.ttl).toBe("number");
    });
  });
});
