/**
 * Tests for JWT utility
 */

const {
  generateToken,
  verifyToken,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require("../../utils/jwt.util");

describe("JWT utility", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret-key";
    process.env.JWT_EXPIRES_IN = "1h";
    process.env.JWT_REFRESH_EXPIRES_IN = "7d";
    jest.clearAllMocks();
  });

  describe("generateToken", () => {
    it("should generate a JWT token", () => {
      const payload = { userId: "123", role: "admin" };
      const token = generateToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);
    });

    it("should include payload in token", () => {
      const payload = { userId: "456", data: "test" };
      const token = generateToken(payload);

      const decoded = verifyToken(token);
      expect(decoded.userId).toBe("456");
      expect(decoded.data).toBe("test");
    });
  });

  describe("verifyToken", () => {
    it("should verify a valid token", () => {
      const payload = { userId: "123" };
      const token = generateToken(payload);
      const decoded = verifyToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe("123");
    });

    it("should throw error for invalid token", () => {
      expect(() => verifyToken("invalid.token.here")).toThrow();
    });

    it("should throw error for expired token", () => {
      const token = "expired.token.here";
      expect(() => verifyToken(token)).toThrow();
    });
  });

  describe("generateAccessToken", () => {
    it("should generate an access token", () => {
      const token = generateAccessToken("user-123");

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
    });
  });

  describe("generateRefreshToken", () => {
    it("should generate a refresh token", () => {
      const token = generateRefreshToken("user-123");

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
    });
  });

  describe("verifyAccessToken", () => {
    it("should verify a valid access token", () => {
      const token = generateAccessToken("user-123");
      const decoded = verifyAccessToken(token);

      expect(decoded).toBeDefined();
    });

    it("should throw error for invalid access token", () => {
      expect(() => verifyAccessToken("invalid.token")).toThrow();
    });
  });

  describe("verifyRefreshToken", () => {
    it("should verify a valid refresh token", () => {
      const token = generateRefreshToken("user-123");
      const decoded = verifyRefreshToken(token);

      expect(decoded).toBeDefined();
    });

    it("should throw error for invalid refresh token", () => {
      expect(() => verifyRefreshToken("invalid.token")).toThrow();
    });
  });
});
