/**
 * Tests for the metered-billing service methods added to make the module
 * functional (the tenant-facing billing API consumed by the controller).
 */
jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../config", () => ({
  db: {
    getDialect: () => "sqlite",
    QueryTypes: { SELECT: "SELECT" },
    Sequelize: { Op: { gte: "gte", lte: "lte", ne: "ne" }, fn: jest.fn(), col: jest.fn() },
    query: jest.fn(),
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
  withCircuitBreaker: (name, fn) => fn,
}));
jest.mock("../../models", () => ({
  UsageMetric: { findAll: jest.fn().mockResolvedValue([]), findOrCreate: jest.fn() },
  UsageAlert: { findAll: jest.fn(), create: jest.fn(), findOne: jest.fn() },
  Invoice: { findAndCountAll: jest.fn() },
  Tenant: { findByPk: jest.fn() },
}));

const svc = require("../../services/meteredBilling.service");
const { UsageAlert, Invoice, Tenant } = require("../../models");

describe("meteredBilling.service new methods", () => {
  beforeEach(() => jest.clearAllMocks());

  it("getTenantUsage returns a metrics snapshot", async () => {
    const res = await svc.getTenantUsage("t-1");
    expect(res.tenantId).toBe("t-1");
    expect(res.metrics).toHaveProperty("api_calls");
  });

  it("getBillingHistory paginates invoices", async () => {
    Invoice.findAndCountAll.mockResolvedValueOnce({ count: 2, rows: [{ id: "i1" }] });
    const res = await svc.getBillingHistory("t-1", 1, 20);
    expect(res.meta).toEqual({ total: 2, page: 1, limit: 20, totalPages: 1 });
    expect(res.rows).toHaveLength(1);
  });

  describe("estimateCost", () => {
    it("computes cost from the rate card × quantity", async () => {
      const res = await svc.estimateCost("t-1", { api_calls: 1000 }, 2);
      // 0.0001 * 1000 * 2 = 0.2
      expect(res.total).toBe(0.2);
      expect(res.lineItems[0]).toMatchObject({ metric: "api_calls", quantity: 2000 });
    });
    it("400s when metrics is not an object", async () => {
      await expect(svc.estimateCost("t-1", null, 1)).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("getPlanDetails", () => {
    it("returns plan limits + overage pricing", async () => {
      Tenant.findByPk.mockResolvedValueOnce({
        plan: "professional",
        limitSeats: 25,
        limitStorageMb: 10240,
        billingCycle: "monthly",
      });
      const res = await svc.getPlanDetails("t-1");
      expect(res.plan).toBe("professional");
      expect(res.limits.api_calls).toBe(100000);
      expect(res.overagePricing).toHaveProperty("calibrations");
    });
    it("404s when the tenant is missing", async () => {
      Tenant.findByPk.mockResolvedValueOnce(null);
      await expect(svc.getPlanDetails("t-1")).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("usage alerts", () => {
    it("lists alerts", async () => {
      UsageAlert.findAll.mockResolvedValueOnce([{ id: "a1" }]);
      expect(await svc.getUsageAlerts("t-1")).toEqual([{ id: "a1" }]);
    });
    it("creates an alert", async () => {
      UsageAlert.create.mockResolvedValueOnce({ id: "a1" });
      await svc.createUsageAlert("t-1", { metricName: "api_calls", threshold: 5000 });
      expect(UsageAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "t-1",
          metricName: "api_calls",
          threshold: 5000,
          comparison: "gte",
          notificationChannels: ["email"],
        }),
      );
    });
    it("400s creating an alert without metricName/threshold", async () => {
      await expect(svc.createUsageAlert("t-1", { threshold: 1 })).rejects.toMatchObject({ status: 400 });
    });
    it("deletes an owned alert", async () => {
      const destroy = jest.fn().mockResolvedValue(true);
      UsageAlert.findOne.mockResolvedValueOnce({ id: "a1", destroy });
      const res = await svc.deleteUsageAlert("t-1", "a1");
      expect(destroy).toHaveBeenCalled();
      expect(res).toEqual({ success: true, id: "a1" });
    });
    it("404s deleting a missing alert", async () => {
      UsageAlert.findOne.mockResolvedValueOnce(null);
      await expect(svc.deleteUsageAlert("t-1", "missing")).rejects.toMatchObject({ status: 404 });
    });
  });

  it("getAnalytics maps the period to days without clobbering the label", async () => {
    const res = await svc.getAnalytics("t-1", "7d");
    expect(res.period).toBe("7d");
    expect(res.days).toBe(7);
    expect(res.metrics).toBeDefined();
  });
});
