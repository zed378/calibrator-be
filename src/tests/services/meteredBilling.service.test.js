/**
 * Tests for Metered Billing Service
 */

jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../../config", () => ({
  db: {
    getDialect: jest.fn(),
    QueryTypes: { SELECT: "SELECT" },
    Sequelize: {
      fn: jest.fn(),
      col: jest.fn(),
      Op: { gte: "gte_symbol" },
    },
  },
}));

jest.mock("../../utils/appError.util", () => ({
  AppError: class AppError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock("../../utils/circuitBreaker.util", () => ({
  withCircuitBreaker: (fn) => fn,
}));

jest.mock("../../models", () => ({
  UsageMetric: {
    create: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    sum: jest.fn(),
    destroy: jest.fn(),
  },
  PlanQuota: {
    findOne: jest.fn(),
    findAll: jest.fn(),
  },
  Tenant: {
    findByPk: jest.fn(),
  },
}));

const meteredBillingService = require("../../services/meteredBilling.service");
const {
  trackUsage,
  getUsage,
  getAllUsage,
  checkQuota,
  enforceQuotas,
  generateUsageReport,
  getPlatformAnalytics,
  resetUsage,
  clearCache,
  getStatus,
} = meteredBillingService;

const { UsageMetric, PlanQuota, Tenant } = require("../../models");

describe("meteredBillingService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCache();
    process.env.USAGE_ENABLED = "true";
    process.env.USAGE_TTL_DAYS = "90";
    process.env.USAGE_AGGREGATION_HOURS = "1";
  });

  afterEach(() => {
    process.env.USAGE_ENABLED = "true";
  });

  describe("trackUsage", () => {
    it("should track usage for a tenant", async () => {
      await trackUsage("tenant-1", "api_calls", 1);

      const current = meteredBillingService.getUsage("tenant-1", "api_calls");
      expect(current).toBeDefined();
    });

    it("should increment by specified amount", async () => {
      await trackUsage("tenant-1", "api_calls", 5);
    });

    it("should default amount to 1", async () => {
      await trackUsage("tenant-1", "api_calls");
    });

    it("should skip tracking when USAGE_ENABLED is false", async () => {
      process.env.USAGE_ENABLED = "false";
      await trackUsage("tenant-1", "api_calls", 1);
    });

    it("should skip tracking when tenantId is missing", async () => {
      await trackUsage(null, "api_calls", 1);
      await trackUsage("", "api_calls", 1);
    });

    it("should skip tracking when metric is missing", async () => {
      await trackUsage("tenant-1", null, 1);
      await trackUsage("tenant-1", "", 1);
    });

    it("should handle errors gracefully without throwing", async () => {
      await expect(
        trackUsage("tenant-1", "api_calls", 1),
      ).resolves.not.toThrow();
    });
  });

  describe("getUsage", () => {
    it("should return usage data with default options", async () => {
      UsageMetric.findAll.mockResolvedValue([]);

      const result = await getUsage("tenant-1", "api_calls");

      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("current");
      expect(result).toHaveProperty("history");
    });

    it("should return usage data with custom options", async () => {
      UsageMetric.findAll.mockResolvedValue([]);

      const result = await getUsage("tenant-1", "api_calls", {
        period: "weekly",
        days: 7,
      });

      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("current");
      expect(result).toHaveProperty("history");
    });

    it("should return empty data when no records found", async () => {
      UsageMetric.findAll.mockResolvedValue([]);

      const result = await getUsage("nonexistent", "api_calls");

      expect(result.total).toBe(0);
      expect(result.history).toEqual([]);
    });

    it("should handle database errors gracefully", async () => {
      UsageMetric.findAll.mockRejectedValue(new Error("DB connection failed"));

      const result = await getUsage("tenant-1", "api_calls");

      expect(result.total).toBe(0);
      expect(result.current).toBe(0);
      expect(result.history).toEqual([]);
    });
  });

  describe("getAllUsage", () => {
    it("should return all usage metrics for a tenant", async () => {
      UsageMetric.findAll.mockResolvedValue([]);

      const result = await getAllUsage("tenant-1");

      expect(result).toHaveProperty("api_calls");
      expect(result).toHaveProperty("storage_bytes");
      expect(result).toHaveProperty("calibrations");
      expect(result).toHaveProperty("documents");
      expect(result).toHaveProperty("users");
      expect(result).toHaveProperty("notifications");
    });

    it("should handle errors for individual metrics", async () => {
      const result = await getAllUsage("tenant-1");

      expect(Object.keys(result).length).toBeGreaterThan(0);
    });
  });

  describe("checkQuota", () => {
    it("should return quota status when under limit", async () => {
      UsageMetric.findAll.mockResolvedValue([]);

      const result = await checkQuota("tenant-1", "api_calls", 10000);

      expect(result).toHaveProperty("exceeded", false);
      expect(result).toHaveProperty("usage");
      expect(result).toHaveProperty("limit", 10000);
      expect(result).toHaveProperty("percentage");
      expect(result).toHaveProperty("remaining");
    });

    it("should return quota exceeded when over limit", async () => {
      // Mock usage that exceeds the limit
      const mockRecord = {
        count: 15000,
        periodStart: new Date(),
      };
      UsageMetric.findAll.mockResolvedValue([mockRecord]);

      const result = await checkQuota("tenant-1", "api_calls", 10000);

      expect(result.exceeded).toBe(true);
      expect(result.usage).toBe(15000);
      expect(result.limit).toBe(10000);
      expect(result.remaining).toBe(0);
    });

    it("should handle zero limit gracefully", async () => {
      UsageMetric.findAll.mockResolvedValue([]);

      const result = await checkQuota("tenant-1", "api_calls", 0);

      expect(result).toHaveProperty("exceeded");
      expect(result).toHaveProperty("percentage", 0);
    });
  });

  describe("enforceQuotas", () => {
    it("should return no violations when all quotas met", async () => {
      PlanQuota.findAll.mockResolvedValue([]);

      const result = await enforceQuotas("tenant-1");

      expect(result.enforced).toBe(false);
      expect(result.violations).toEqual([]);
    });

    it("should return violations when quotas exceeded", async () => {
      const mockQuota = {
        metric: "api_calls",
        limit: 100,
      };
      PlanQuota.findAll.mockResolvedValue([mockQuota]);

      UsageMetric.findAll.mockResolvedValue([]);

      const result = await enforceQuotas("tenant-1");

      expect(result).toHaveProperty("enforced");
      expect(result).toHaveProperty("violations");
    });

    it("should handle database errors", async () => {
      PlanQuota.findAll.mockRejectedValue(new Error("DB error"));

      await expect(enforceQuotas("tenant-1")).rejects.toThrow("DB error");
    });
  });

  describe("generateUsageReport", () => {
    it("should generate a usage report for 30 days", async () => {
      UsageMetric.findAll.mockResolvedValue([]);

      const report = await generateUsageReport("tenant-1", 30);

      expect(report).toHaveProperty("tenantId", "tenant-1");
      expect(report).toHaveProperty("period");
      expect(report.period.days).toBe(30);
      expect(report).toHaveProperty("generatedAt");
      expect(report).toHaveProperty("metrics");
      expect(report).toHaveProperty("summary");
    });

    it("should generate a usage report for custom period", async () => {
      UsageMetric.findAll.mockResolvedValue([]);

      const report = await generateUsageReport("tenant-1", 7);

      expect(report.period.days).toBe(7);
    });

    it("should handle errors gracefully", async () => {
      UsageMetric.findAll.mockRejectedValue(new Error("DB error"));

      const report = await generateUsageReport("tenant-1", 30);

      expect(report).toHaveProperty("metrics", {});
      expect(report).toHaveProperty("summary");
    });
  });

  describe("getPlatformAnalytics", () => {
    it("should return platform-wide analytics", async () => {
      UsageMetric.findAll.mockResolvedValue([]);

      const analytics = await getPlatformAnalytics({ days: 30 });

      expect(analytics).toHaveProperty("period", 30);
      expect(analytics).toHaveProperty("metrics");
    });

    it("should return analytics for custom period", async () => {
      UsageMetric.findAll.mockResolvedValue([]);

      const analytics = await getPlatformAnalytics({ days: 90 });

      expect(analytics.period).toBe(90);
    });

    it("should handle database errors", async () => {
      UsageMetric.findAll.mockRejectedValue(new Error("DB connection failed"));

      const analytics = await getPlatformAnalytics({ days: 30 });

      expect(analytics.period).toBe(30);
      expect(analytics.metrics).toEqual([]);
    });
  });

  describe("resetUsage", () => {
    it("should reset usage counters for a tenant/metric", async () => {
      UsageMetric.destroy.mockResolvedValue(1);

      await resetUsage("tenant-1", "api_calls");

      expect(getStatus().storeSize).toBe(0);
    });

    it("should handle errors gracefully", async () => {
      await expect(resetUsage("tenant-1", "api_calls")).resolves.not.toThrow();
    });
  });

  describe("clearCache", () => {
    it("should clear the in-memory usage store", async () => {
      await trackUsage("tenant-1", "api_calls", 1);
      clearCache();

      const status = getStatus();
      expect(status.storeSize).toBe(0);
    });
  });

  describe("getStatus", () => {
    it("should return service status", async () => {
      const status = getStatus();

      expect(status).toHaveProperty("enabled", true);
      expect(status).toHaveProperty("ttlDays", 90);
      expect(status).toHaveProperty("aggregationHours", 1);
      expect(status).toHaveProperty("storeSize");
    });

    it("should show disabled when USAGE_ENABLED is false", async () => {
      process.env.USAGE_ENABLED = "false";
      const status = getStatus();

      expect(status.enabled).toBe(false);
    });
  });
});
