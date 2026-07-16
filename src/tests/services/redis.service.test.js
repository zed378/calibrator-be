/**
 * Tests for redis.service.js
 */

let mockConnected = true;
let mockStatus = "ready";
let mockOnErrorCallback = null;

const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockGet = jest.fn().mockResolvedValue(null);
const mockSet = jest.fn().mockResolvedValue("OK");
const mockSetex = jest.fn().mockResolvedValue("OK");
const mockDel = jest.fn().mockResolvedValue(1);
const mockScan = jest.fn().mockResolvedValue(["0", []]);
const mockEval = jest.fn().mockResolvedValue(1);
const mockQuit = jest.fn().mockResolvedValue(undefined);
const mockOn = jest.fn().mockImplementation((event, callback) => {
  if (event === "error") {
    mockOnErrorCallback = callback;
  }
});
const mockOnce = jest.fn();

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    get: mockGet,
    set: mockSet,
    setex: mockSetex,
    del: mockDel,
    scan: mockScan,
    eval: mockEval,
    quit: mockQuit,
    on: mockOn,
    once: mockOnce,
    get connected() {
      return mockConnected;
    },
    get status() {
      return mockStatus;
    },
  }));
});

jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

describe("redis.service", () => {
  let redisService;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockConnected = true;
    mockStatus = "ready";
    mockOnErrorCallback = null;
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue("OK");
    mockSetex.mockResolvedValue("OK");
    mockDel.mockResolvedValue(1);
    mockScan.mockResolvedValue(["0", []]);
    mockEval.mockResolvedValue(1);
    mockQuit.mockResolvedValue(undefined);

    redisService = require("../../services/redis.service");
  });

  describe("initRedis", () => {
    it("should initialize Redis connection successfully when not already connected", async () => {
      mockConnected = false;
      const client = await redisService.initRedis();
      expect(client).toBeDefined();
      expect(mockConnect).toHaveBeenCalled();
    });

    it("should return client immediately if already connected", async () => {
      mockConnected = true;
      const client = await redisService.initRedis();
      expect(client).toBeDefined();
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("should resolve when client status is connecting and triggers ready event", async () => {
      mockConnected = false;
      mockStatus = "connecting";
      
      let readyCallback;
      mockOnce.mockImplementation((event, callback) => {
        if (event === "ready") {
          readyCallback = callback;
        }
      });

      const initPromise = redisService.initRedis();
      
      // Yield control to the event loop to let initRedis advance past connect()
      await new Promise(resolve => setImmediate(resolve));
      
      expect(readyCallback).toBeDefined();
      readyCallback();

      const client = await initPromise;
      expect(client).toBeDefined();
    });

    it("should log error and return null when connect throws", async () => {
      mockConnected = false;
      mockConnect.mockRejectedValue(new Error("Connect failed"));

      const client = await redisService.initRedis();
      expect(client).toBeNull();
      const { logger } = require("../../middlewares/activityLog.middleware");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "Redis Initialization Failed",
          message: "Connect failed",
        })
      );
    });
  });

  describe("getRedisConnection and configurations", () => {
    it("should return the cached connection if already initialized", () => {
      const conn1 = redisService.getRedisConnection();
      const conn2 = redisService.getRedisConnection();
      expect(conn1).toBe(conn2);
    });

    it("should configure retryStrategy properly", () => {
      redisService.getRedisConnection();
      const mockRedisConstructor = require("ioredis");
      const options = mockRedisConstructor.mock.calls[0][1];
      expect(options.retryStrategy).toBeDefined();
      expect(options.retryStrategy(2)).toBe(400);
      expect(options.retryStrategy(5)).toBeNull();
    });
  });

  describe("getRedisConnection error listener", () => {
    it("should trigger error callback and log redis connection errors", () => {
      // Trigger connection initialization to register the error listener
      redisService.getRedisConnection();
      
      expect(mockOnErrorCallback).toBeDefined();
      expect(typeof mockOnErrorCallback).toBe("function");
      
      mockOnErrorCallback(new Error("Some Redis Error"));

      const { logger } = require("../../middlewares/activityLog.middleware");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "Redis Connection Error",
          message: "Some Redis Error",
        })
      );
    });
  });

  describe("get", () => {
    it("should return null if client is not connected", async () => {
      mockConnected = false;
      const result = await redisService.get("key");
      expect(result).toBeNull();
    });

    it("should return parsed JSON object if JSON string is cached", async () => {
      mockGet.mockResolvedValue(JSON.stringify({ a: 1 }));
      const result = await redisService.get("key");
      expect(result).toEqual({ a: 1 });
    });

    it("should return raw string if not JSON string", async () => {
      mockGet.mockResolvedValue("raw_value");
      const result = await redisService.get("key");
      expect(result).toBe("raw_value");
    });

    it("should return null and log error if client.get throws", async () => {
      mockGet.mockRejectedValue(new Error("GET failed"));
      const result = await redisService.get("key");
      expect(result).toBeNull();
      const { logger } = require("../../middlewares/activityLog.middleware");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "Redis GET Error",
          message: "GET failed",
        })
      );
    });
  });

  describe("set", () => {
    it("should return false if client is not connected", async () => {
      mockConnected = false;
      const result = await redisService.set("key", "value");
      expect(result).toBe(false);
    });

    it("should set string values directly", async () => {
      const result = await redisService.set("key", "value", 100);
      expect(result).toBe(true);
      expect(mockSetex).toHaveBeenCalledWith("key", 100, "value");
    });

    it("should serialize objects to JSON strings before setting", async () => {
      const result = await redisService.set("key", { a: 1 });
      expect(result).toBe(true);
      expect(mockSetex).toHaveBeenCalledWith("key", 300, JSON.stringify({ a: 1 }));
    });

    it("should return false and log error if setex throws", async () => {
      mockSetex.mockRejectedValue(new Error("SET failed"));
      const result = await redisService.set("key", "value");
      expect(result).toBe(false);
      const { logger } = require("../../middlewares/activityLog.middleware");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "Redis SET Error",
          message: "SET failed",
        })
      );
    });
  });

  describe("del", () => {
    it("should return false if client is not connected", async () => {
      mockConnected = false;
      const result = await redisService.del("key");
      expect(result).toBe(false);
    });

    it("should delete key and return true", async () => {
      const result = await redisService.del("key");
      expect(result).toBe(true);
      expect(mockDel).toHaveBeenCalledWith("key");
    });

    it("should return false and log error if client.del throws", async () => {
      mockDel.mockRejectedValue(new Error("DEL failed"));
      const result = await redisService.del("key");
      expect(result).toBe(false);
      const { logger } = require("../../middlewares/activityLog.middleware");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "Redis DEL Error",
          message: "DEL failed",
        })
      );
    });
  });

  describe("delPattern", () => {
    it("should return 0 if client is not connected", async () => {
      mockConnected = false;
      const result = await redisService.delPattern("pattern:*");
      expect(result).toBe(0);
    });

    it("should scan and delete matching keys sequentially", async () => {
      mockScan
        .mockResolvedValueOnce(["123", ["k1", "k2"]])
        .mockResolvedValueOnce(["0", ["k3"]]);

      const result = await redisService.delPattern("pattern:*");
      expect(result).toBe(3);
      expect(mockDel).toHaveBeenCalledTimes(2);
      expect(mockDel).toHaveBeenNthCalledWith(1, "k1", "k2");
      expect(mockDel).toHaveBeenNthCalledWith(2, "k3");
    });

    it("should return 0 and log error if scan throws", async () => {
      mockScan.mockRejectedValue(new Error("SCAN failed"));
      const result = await redisService.delPattern("pattern:*");
      expect(result).toBe(0);
      const { logger } = require("../../middlewares/activityLog.middleware");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "Redis DEL Pattern Error",
          message: "SCAN failed",
        })
      );
    });
  });

  describe("acquireLock", () => {
    it("should return null if client is not connected", async () => {
      mockConnected = false;
      const result = await redisService.acquireLock("lockKey");
      expect(result).toBeNull();
    });

    it("should return lockId if lock is successfully acquired (returns OK)", async () => {
      mockSet.mockResolvedValue("OK");
      const result = await redisService.acquireLock("lockKey", 5000);
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      expect(mockSet).toHaveBeenCalledWith(
        "lock:lockKey",
        result,
        "EX",
        5,
        "NX"
      );
    });

    it("should return null if lock acquisition fails (does not return OK)", async () => {
      mockSet.mockResolvedValue(null);
      const result = await redisService.acquireLock("lockKey");
      expect(result).toBeNull();
    });

    it("should return null and log error if set throws", async () => {
      mockSet.mockRejectedValue(new Error("Lock SET failed"));
      const result = await redisService.acquireLock("lockKey");
      expect(result).toBeNull();
      const { logger } = require("../../middlewares/activityLog.middleware");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "Redis Lock Error",
          message: "Lock SET failed",
        })
      );
    });
  });

  describe("releaseLock", () => {
    it("should return false if client is not connected", async () => {
      mockConnected = false;
      const result = await redisService.releaseLock("lockKey", "id-123");
      expect(result).toBe(false);
    });

    it("should return true if eval script successfully releases the lock", async () => {
      mockEval.mockResolvedValue(1);
      const result = await redisService.releaseLock("lockKey", "id-123");
      expect(result).toBe(true);
      expect(mockEval).toHaveBeenCalled();
    });

    it("should return false if eval script returns 0 (lock not owned by this ID)", async () => {
      mockEval.mockResolvedValue(0);
      const result = await redisService.releaseLock("lockKey", "id-123");
      expect(result).toBe(false);
    });

    it("should return false and log error if eval throws", async () => {
      mockEval.mockRejectedValue(new Error("EVAL failed"));
      const result = await redisService.releaseLock("lockKey", "id-123");
      expect(result).toBe(false);
      const { logger } = require("../../middlewares/activityLog.middleware");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "Redis Unlock Error",
          message: "EVAL failed",
        })
      );
    });
  });

  describe("cacheKeys", () => {
    it("should generate correct key strings for various resource types", () => {
      expect(redisService.cacheKeys.user("user-123")).toBe("user:user-123");
      expect(redisService.cacheKeys.userByEmail("test@example.com")).toBe("user:email:test@example.com");
      expect(redisService.cacheKeys.userByUsername("testuser")).toBe("user:username:testuser");
      expect(redisService.cacheKeys.tenant("tenant-456")).toBe("tenant:tenant-456");
      expect(redisService.cacheKeys.tenantByCode("TNT")).toBe("tenant:code:TNT");
      expect(redisService.cacheKeys.tenantSettings("tenant-456")).toBe("tenant:settings:tenant-456");
      expect(redisService.cacheKeys.role("role-789")).toBe("role:role-789");
      expect(redisService.cacheKeys.permissions("role-789")).toBe("permissions:role:role-789");
      expect(redisService.cacheKeys.userPermissions("user-123")).toBe("permissions:user:user-123");
      expect(redisService.cacheKeys.session("sessionHash")).toBe("session:sessionHash");
      expect(redisService.cacheKeys.rateLimit("192.168.1.1")).toBe("ratelimit:192.168.1.1");
      expect(redisService.cacheKeys.lock("resourceName")).toBe("lock:resourceName");
    });
  });

  describe("closeRedis", () => {
    it("should quit and close Redis connection", async () => {
      // Initialize internal connection
      await redisService.initRedis();
      
      await redisService.closeRedis();
      expect(mockQuit).toHaveBeenCalled();
      const { logger } = require("../../middlewares/activityLog.middleware");
      expect(logger.info).toHaveBeenCalledWith("Redis connection closed");
    });

    it("should log error if quit fails", async () => {
      await redisService.initRedis();
      mockQuit.mockRejectedValue(new Error("Quit failed"));

      await redisService.closeRedis();
      const { logger } = require("../../middlewares/activityLog.middleware");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "Redis Close Error",
          message: "Quit failed",
        })
      );
    });
  });
});
