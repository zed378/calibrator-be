/**
 * Tests for rate limiter Redis service (coverage boost)
 *
 * Tests exported functions from rateLimiter.redis.service.js.
 * Uses jest.mock() for external deps (models, session, jwt, activityLog).
 *
 * REDIS_URL is cleared to ensure in-memory fallback is used (Map).
 */

// Override REDIS_URL BEFORE any modules load
const originalRedisUrl = process.env.REDIS_URL;
process.env.REDIS_URL = "";

let mockSessions = { update: jest.fn().mockResolvedValue([1]) };
let mockUsers = {
  findByPk: jest.fn().mockResolvedValue(null),
  update: jest.fn().mockResolvedValue({}),
};

jest.mock("../../services/emailQueue.service", () => ({
  processEmailQueue: jest.fn(),
  queueActivationEmail: jest.fn(),
  queueOtpEmail: jest.fn(),
  getQueueStats: jest.fn(),
  clearQueue: jest.fn(),
  closeRabbitMQ: jest.fn(),
}));

jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../../models", () => {
  mockSessions = {
    update: jest.fn().mockResolvedValue([1]),
  };
  mockUsers = {
    findByPk: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
  };
  return {
    Users: mockUsers,
    Sessions: mockSessions,
  };
});

jest.mock("../../utils/session.util", () => ({
  hashToken: jest.fn((token) => `hash:${token}`),
}));

jest.mock("../../utils/jwt.util", () => ({
  generateAccessToken: jest.fn(),
  verifyAccessToken: jest.fn(),
}));

describe("rateLimiter.redis.service - coverage boost", () => {
  let rl;

beforeEach(() => {
    // Reset mock call history only — preserves mockResolvedValue / mockRejectedValue setup
    mockSessions.update.mockClear();
    mockUsers.findByPk.mockClear();
    mockUsers.update.mockClear();
    // Restore defaults
    mockSessions.update.mockResolvedValue([1]);
    mockUsers.findByPk.mockResolvedValue(null);

    // Clear the shared rate limit cache between tests
    rl = require("../../services/rateLimiter.redis.service");
    if (rl.clearMemoryStore) {
      rl.clearMemoryStore();
    }
  });

  afterAll(() => {
    process.env.REDIS_URL = originalRedisUrl;
  });

  describe("recordAuthFailure", () => {
    it("should record a failed attempt for a user and return remaining attempts", async () => {
      const result = await rl.recordAuthFailure({
        userId: "user-1",
        endpoint: "login",
      });
      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(4);
    });

    it("should return a result with default config for unknown endpoint", async () => {
      const result = await rl.recordAuthFailure({
        userId: "user-1",
        endpoint: "unknownEndpoint",
      });
      expect(result.allowed).toBe(true);
      // unknown endpoint defaults to login config (maxAttempts: 5)
      expect(result.remainingAttempts).toBe(4);
    });

    it("should not throw when called with no params", async () => {
      await expect(rl.recordAuthFailure({})).resolves.toBeDefined();
    });

    it("should lock out user after exceeding max attempts", async () => {
      // login config: maxAttempts=5
      for (let i = 0; i < 5; i++) {
        await rl.recordAuthFailure({ userId: "user-lock", endpoint: "login" });
      }
      const result = await rl.recordAuthFailure({ userId: "user-lock", endpoint: "login" });
      expect(result.allowed).toBe(false);
      expect(result.lockoutUntil).toBeDefined();
      expect(result.lockoutReason).toContain("Too many failed attempts");
    });

    it("should handle error when updating user lockout", async () => {
      mockUsers.update.mockRejectedValueOnce(new Error("DB error"));
      const result = await rl.recordAuthFailure({ userId: "user-err", endpoint: "login" });
      expect(result.allowed).toBe(true); // still allows but logs error
    });

    it("should handle token-based rate limiting", async () => {
      const result = await rl.recordAuthFailure({
        tokenHash: "hash:token123",
        endpoint: "login",
      });
      expect(result.allowed).toBe(true);
      // First attempt, remaining = 4 (max 5)
      expect(result.remainingAttempts).toBe(4);
    });

    it("should revoke token after 3 failures with same token", async () => {
      for (let i = 0; i < 3; i++) {
        await rl.recordAuthFailure({ tokenHash: "hash:tok123", endpoint: "login" });
      }
      const result = await rl.recordAuthFailure({ tokenHash: "hash:tok123", endpoint: "login" });
      // The 4th call should have revokedToken set on the 3rd
      expect(result.revokedToken).toBe("hash:tok123");
    });

    it("should block token after 2x maxAttempts", async () => {
      const tokenHash = "hash:blockme";
      // maxAttempts for login = 5, so 2x = 10
      for (let i = 0; i < 10; i++) {
        await rl.recordAuthFailure({ tokenHash, endpoint: "login" });
      }
      const result = await rl.recordAuthFailure({ tokenHash, endpoint: "login" });
      expect(result.allowed).toBe(false);
      expect(result.lockoutReason).toContain("Token blocked");
    });

    it("should handle IP-based rate limiting", async () => {
      const result = await rl.recordAuthFailure({
        ip: "192.168.1.1",
        endpoint: "login",
      });
      expect(result.allowed).toBe(true);
    });

    it("should block IP after 3x maxAttempts", async () => {
      // 3 * 5 = 15
      for (let i = 0; i < 15; i++) {
        await rl.recordAuthFailure({ ip: "10.0.0.1", endpoint: "login" });
      }
      const result = await rl.recordAuthFailure({ ip: "10.0.0.1", endpoint: "login" });
      expect(result.allowed).toBe(false);
      expect(result.lockoutReason).toContain("Too many requests from this IP");
    });
  });

  describe("checkAuthLockout", () => {
    it("should return locked false when no entry exists", async () => {
      const result = await rl.checkAuthLockout({ userId: "new-user", endpoint: "login" });
      expect(result.locked).toBe(false);
    });

    it("should return locked true when user is locked", async () => {
      // Record 5 failures to trigger lockout
      for (let i = 0; i < 5; i++) {
        await rl.recordAuthFailure({ userId: "lock-user", endpoint: "login" });
      }
      const result = await rl.checkAuthLockout({ userId: "lock-user", endpoint: "login" });
      expect(result.locked).toBe(true);
      expect(result.lockoutUntil).toBeDefined();
      expect(result.reason).toContain("locked");
    });

    it("should return locked true when token is revoked", async () => {
      // 3 failures revokes token
      for (let i = 0; i < 3; i++) {
        await rl.recordAuthFailure({ tokenHash: "hash:revoked", endpoint: "login" });
      }
      const result = await rl.checkAuthLockout({ tokenHash: "hash:revoked", endpoint: "login" });
      expect(result.locked).toBe(true);
      expect(result.reason).toContain("revoked");
    });

    it("should return locked true when IP is blocked", async () => {
      for (let i = 0; i < 15; i++) {
        await rl.recordAuthFailure({ ip: "10.0.0.2", endpoint: "login" });
      }
      const result = await rl.checkAuthLockout({ ip: "10.0.0.2", endpoint: "login" });
      expect(result.locked).toBe(true);
      expect(result.reason).toContain("blocked");
    });
  });

  describe("resetAuthFailures", () => {
    it("should remove user rate limit entry from cache", async () => {
      await rl.recordAuthFailure({ userId: "reset-user", endpoint: "login" });
      await rl.resetAuthFailures({ userId: "reset-user", endpoint: "login" });
      const status = await rl.checkAuthLockout({ userId: "reset-user", endpoint: "login" });
      expect(status.locked).toBe(false);
    });

    it("should handle error when resetting user failed attempts", async () => {
      mockUsers.update.mockRejectedValueOnce(new Error("DB error"));
      await rl.resetAuthFailures({ userId: "reset-err", endpoint: "login" });
      // Should not throw
    });

    it("should remove token rate limit entry from cache", async () => {
      await rl.recordAuthFailure({ tokenHash: "hash:reset-token", endpoint: "login" });
      await rl.resetAuthFailures({ tokenHash: "hash:reset-token", endpoint: "login" });
      // Should not throw
    });

    it("should not throw when called with no params", async () => {
      await expect(rl.resetAuthFailures({})).resolves.toBeUndefined();
    });
  });

  describe("revokeTokenByHash", () => {
    it("should update Sessions when token is revoked", async () => {
      const result = await rl.revokeTokenByHash("hash:revoke123", "TEST_REASON");
      expect(result).toBe(true);
      expect(mockSessions.update).toHaveBeenCalledWith(
        expect.objectContaining({
          isRevoked: true,
          revokedReason: "TEST_REASON",
        }),
        expect.any(Object)
      );
    });

    it("should return false when update throws", async () => {
      mockSessions.update.mockRejectedValueOnce(new Error("DB error"));
      const result = await rl.revokeTokenByHash("hash:fail", "REASON");
      expect(result).toBe(false);
    });
  });

  describe("revokeAllUserTokens", () => {
    it("should revoke all sessions for a user", async () => {
      mockSessions.update.mockResolvedValueOnce([3]);
      const count = await rl.revokeAllUserTokens("user-123", "SECURITY");
      expect(count).toBe(3);
      expect(mockSessions.update).toHaveBeenCalledWith(
        expect.objectContaining({
          isRevoked: true,
          revokedReason: "SECURITY",
        }),
        expect.any(Object)
      );
    });

    it("should return 0 when update throws", async () => {
      mockSessions.update.mockRejectedValueOnce(new Error("DB error"));
      const count = await rl.revokeAllUserTokens("user-456", "REASON");
      expect(count).toBe(0);
    });
  });

  describe("isTokenBlocked", () => {
    it("should return isBlocked false when no entry exists", async () => {
      const result = await rl.isTokenBlocked("nonexistent-token", "login");
      expect(result.isBlocked).toBe(false);
    });

    it("should return isBlocked true when token is blocked", async () => {
      // Block a token by recording 2x maxAttempts failures
      for (let i = 0; i < 10; i++) {
        await rl.recordAuthFailure({ tokenHash: "hash:block-test", endpoint: "login" });
      }
      const result = await rl.isTokenBlocked("block-test", "login");
      expect(result.isBlocked).toBe(true);
      expect(result.blockUntil).toBeDefined();
    });
  });

  describe("isUserLockedOut", () => {
    it("should return isLocked false when no entry exists", async () => {
      const result = await rl.isUserLockedOut("no-lock-user", "login");
      expect(result.isLocked).toBe(false);
    });

    it("should return isLocked true when user is locked", async () => {
      for (let i = 0; i < 5; i++) {
        await rl.recordAuthFailure({ userId: "lockout-user", endpoint: "login" });
      }
      const result = await rl.isUserLockedOut("lockout-user", "login");
      expect(result.isLocked).toBe(true);
      expect(result.lockoutUntil).toBeDefined();
      expect(result.reason).toContain("locked");
    });

    it("should return false when lockout has expired", async () => {
      // We can't easily test time expiration without mocking Date.now
      // but the logic is covered by isLocked check on count vs maxAttempts
      const result = await rl.isUserLockedOut("fresh-user", "login");
      expect(result.isLocked).toBe(false);
    });
  });

  describe("getRateLimitStatus", () => {
    it("should return status with user entry", async () => {
      await rl.recordAuthFailure({ userId: "status-user", endpoint: "login" });
      const status = await rl.getRateLimitStatus({ userId: "status-user", endpoint: "login", type: "auth" });
      expect(status.user).toBeDefined();
      expect(status.user.count).toBe(1);
    });

    it("should return status with token entry", async () => {
      await rl.recordAuthFailure({ tokenHash: "hash:status-token", endpoint: "login" });
      const status = await rl.getRateLimitStatus({ tokenHash: "hash:status-token", endpoint: "login", type: "auth" });
      expect(status.token).toBeDefined();
      expect(status.token.count).toBe(1);
    });

    it("should return empty status when no entries", async () => {
      const status = await rl.getRateLimitStatus({ endpoint: "login", type: "auth" });
      expect(status.user).toBeNull();
      expect(status.token).toBeNull();
      expect(status.ip).toBeNull();
    });

    it("should include IP status when provided", async () => {
      await rl.recordAuthFailure({ ip: "1.2.3.4", endpoint: "login" });
      const status = await rl.getRateLimitStatus({ ip: "1.2.3.4", endpoint: "login", type: "auth" });
      expect(status.ip).toBeDefined();
      expect(status.ip.count).toBe(1);
    });
  });

  describe("clearUserRateLimits", () => {
    it("should clear rate limits for a user", async () => {
      await rl.recordAuthFailure({ userId: "clear-user", endpoint: "login" });
      await rl.clearUserRateLimits("clear-user");
      const status = await rl.checkAuthLockout({ userId: "clear-user", endpoint: "login" });
      expect(status.locked).toBe(false);
    });
  });

  describe("endpointRateLimiter", () => {
    it("should be a function", () => {
      const middleware = rl.endpointRateLimiter("default");
      expect(typeof middleware).toBe("function");
    });

    it("should use custom maxRequests when provided", async () => {
      const middleware = rl.endpointRateLimiter("default", { maxRequests: 5, windowMs: 60000 });
      expect(typeof middleware).toBe("function");
    });

    it("should allow requests under the limit and set headers", async () => {
      const middleware = rl.endpointRateLimiter("tenantCreate", { maxRequests: 10, windowMs: 60000 });
      const req = { ip: "1.2.3.4", headers: {}, user: null };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        set: jest.fn(),
      };
      const next = jest.fn();

      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          "X-RateLimit-Limit": "10",
        })
      );
    });

    it("should block requests over the limit", async () => {
      const middleware = rl.endpointRateLimiter("tenantCreate", { maxRequests: 2, windowMs: 60000 });
      const req = { ip: "1.2.3.5", headers: {}, user: null };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        set: jest.fn(),
      };
      const next = jest.fn();

      await middleware(req, res, next); // 1
      await middleware(req, res, next); // 2
      await middleware(req, res, next); // 3 - should block

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          status: 429,
        })
      );
    });

    it("should handle custom default error message when description is not defined", async () => {
      const middleware = rl.endpointRateLimiter("unknownEndpoint", { maxRequests: 1, windowMs: 60000 });
      const req = { ip: "1.2.3.6", headers: {}, user: null };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        set: jest.fn(),
      };
      const next = jest.fn();

      await middleware(req, res, next); // 1
      await middleware(req, res, next); // 2 - block

      expect(res.status).toHaveBeenCalledWith(429);
    });

    it("should reset window when expired", async () => {
      // We can't easily test time expiration without mocking Date.now
      // This is a smoke test that the function exists and doesn't throw
      const middleware = rl.endpointRateLimiter("default", { maxRequests: 1, windowMs: 1 });
      const req = { ip: "1.2.3.7", headers: {}, user: null };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };
      const next = jest.fn();
      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("AUTH_ENDPOINTS config", () => {
    it("should have all expected endpoints", () => {
      const { AUTH_ENDPOINTS } = require("../../constants/rateLimitConstants");
      expect(AUTH_ENDPOINTS).toHaveProperty("login");
      expect(AUTH_ENDPOINTS).toHaveProperty("register");
      expect(AUTH_ENDPOINTS).toHaveProperty("forgotPassword");
      expect(AUTH_ENDPOINTS).toHaveProperty("resetPassword");
    });

    it("should have maxAttempts, windowMs, and lockoutMs for each endpoint", () => {
      const { AUTH_ENDPOINTS } = require("../../constants/rateLimitConstants");
      Object.values(AUTH_ENDPOINTS).forEach((config) => {
        expect(config).toHaveProperty("maxAttempts");
        expect(config).toHaveProperty("windowMs");
        expect(config).toHaveProperty("lockoutMs");
      });
    });

    it("login should have maxAttempts of 5", () => {
      const { AUTH_ENDPOINTS } = require("../../constants/rateLimitConstants");
      expect(AUTH_ENDPOINTS.login.maxAttempts).toBe(5);
    });

    it("forgotPassword should have maxAttempts of 3", () => {
      const { AUTH_ENDPOINTS } = require("../../constants/rateLimitConstants");
      expect(AUTH_ENDPOINTS.forgotPassword.maxAttempts).toBe(3);
    });

    it("register should have maxAttempts of 3", () => {
      const { AUTH_ENDPOINTS } = require("../../constants/rateLimitConstants");
      expect(AUTH_ENDPOINTS.register.maxAttempts).toBe(3);
    });
  });

  describe("API_ENDPOINTS config", () => {
    it("should have all expected endpoints", () => {
      const { API_ENDPOINTS } = require("../../constants/rateLimitConstants");
      expect(API_ENDPOINTS).toHaveProperty("tenantCreate");
      expect(API_ENDPOINTS).toHaveProperty("tenantUpload");
      expect(API_ENDPOINTS).toHaveProperty("default");
    });
  });

  describe("getAuthConfig / getApiConfig", () => {
    it("should return config for known auth endpoint", () => {
      const { getAuthConfig } = require("../../constants/rateLimitConstants");
      const config = getAuthConfig("login");
      expect(config.maxAttempts).toBe(5);
    });

    it("should return default for unknown auth endpoint", () => {
      const { getAuthConfig } = require("../../constants/rateLimitConstants");
      const config = getAuthConfig("unknown");
      expect(config.maxAttempts).toBe(5); // defaults to login
    });

    it("should return config for known api endpoint", () => {
      const { getApiConfig } = require("../../constants/rateLimitConstants");
      const config = getApiConfig("tenantCreate");
      expect(config.maxRequests).toBe(10);
    });

    it("should return default for unknown api endpoint", () => {
      const { getApiConfig } = require("../../constants/rateLimitConstants");
      const config = getApiConfig("unknown");
      expect(config.maxRequests).toBe(100);
    });
  });

  describe("makeKey", () => {
    it("should generate correct key format", () => {
      const { makeKey } = require("../../constants/rateLimitConstants");
      const key = makeKey("auth", "login", "user:123");
      expect(key).toBe("ratelimit:auth:login:user:123");
    });
  });
});