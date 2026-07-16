// eslint-disable-next-line no-undef
jest.mock("../../models", () => ({
  Op: {
    between: Symbol("between"),
    lt: Symbol("lt"),
    gte: Symbol("gte"),
    lte: Symbol("lte"),
    in: Symbol("in"),
  },
  Sequelize: {
    fn: jest.fn(),
    col: jest.fn(),
  },
  User: {
    count: jest.fn(),
    findAll: jest.fn(),
  },
  Tenant: {
    count: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(),
  },
  CalibrationDevice: {
    count: jest.fn(),
    findAll: jest.fn(),
  },
  CalibrationRecord: {
    count: jest.fn(),
    findAll: jest.fn(),
  },
  Certificate: {
    count: jest.fn(),
    findAll: jest.fn(),
  },
  Stock: {
    count: jest.fn(),
    sum: jest.fn(),
  },
  Warehouse: {
    count: jest.fn(),
  },
  StockTransfer: {
    count: jest.fn(),
  },
  StockOpname: {
    count: jest.fn(),
  },
  MaintenanceWorkOrder: {
    count: jest.fn(),
  },
}));

const {
  User,
  Tenant,
  CalibrationDevice,
  CalibrationRecord,
  Certificate,
  Stock,
  Warehouse,
  StockTransfer,
  StockOpname,
  MaintenanceWorkOrder,
  Sequelize,
} = require("../../models");
const { getDashboardMetrics } = require("../../services/dashboard.service");

describe("dashboard.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset Sequelize mocks
    Sequelize.fn.mockReset();
    Sequelize.col.mockReset();
  });

  describe("getDashboardMetrics", () => {
    it("should return tenant-scoped metrics when tenantId provided", async () => {
      User.count.mockImplementation(({ where }) => {
        if (where && where.isEmailVerified !== undefined) {
          return Promise.resolve(5);
        }
        return Promise.resolve(10);
      });
      CalibrationDevice.count.mockImplementation(({ where }) => {
        if (where && where.status === "active") {
          return Promise.resolve(3);
        }
        return Promise.resolve(8);
      });
      CalibrationDevice.findAll.mockResolvedValue([]);
      CalibrationRecord.count.mockImplementation(({ where }) => {
        if (where && where.isCompliant !== undefined) {
          return Promise.resolve(7);
        }
        return Promise.resolve(15);
      });
      CalibrationRecord.findAll.mockResolvedValue([]);
      Certificate.count.mockResolvedValue(5);
      Certificate.findAll.mockResolvedValue([]);
      Stock.count.mockResolvedValue(20);
      Stock.sum.mockResolvedValue(500);
      Stock.count.mockImplementation(({ where }) => {
        if (where && where.quantity) {
          return Promise.resolve(3);
        }
        return Promise.resolve(20);
      });
      Warehouse.count.mockResolvedValue(2);
      StockTransfer.count.mockResolvedValue(2);
      StockOpname.count.mockResolvedValue(1);
      MaintenanceWorkOrder.count.mockResolvedValue(3);
      Tenant.findByPk.mockResolvedValue({
        id: "tenant-1",
        name: "Test Tenant",
        code: "TT",
        status: "active",
      });

      const result = await getDashboardMetrics("tenant-1");

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.data.scope).toBe("tenant");
      expect(result.data.users.total).toBe(10);
      expect(result.data.users.verified).toBe(5);
      expect(result.data.devices.total).toBe(8);
      expect(result.data.calibrations.total).toBe(15);
      expect(result.data.calibrations.compliant).toBe(7);
      expect(result.data.tenant).toEqual({
        id: "tenant-1",
        name: "Test Tenant",
        code: "TT",
        status: "active",
      });
    });

    it("should return global metrics when tenantId is null", async () => {
      User.count.mockImplementation(({ where }) => {
        if (where && where.isEmailVerified !== undefined) {
          return Promise.resolve(50);
        }
        return Promise.resolve(100);
      });
      CalibrationDevice.count.mockImplementation(({ where }) => {
        if (where && where.status === "active") {
          return Promise.resolve(30);
        }
        return Promise.resolve(80);
      });
      CalibrationDevice.findAll.mockResolvedValue([]);
      CalibrationRecord.count.mockImplementation(({ where }) => {
        if (where && where.isCompliant !== undefined) {
          return Promise.resolve(70);
        }
        return Promise.resolve(150);
      });
      CalibrationRecord.findAll.mockResolvedValue([]);
      Certificate.count.mockResolvedValue(50);
      Certificate.findAll.mockResolvedValue([]);
      Stock.count.mockResolvedValue(200);
      Stock.sum.mockResolvedValue(5000);
      Stock.count.mockImplementation(({ where }) => {
        if (where && where.quantity) {
          return Promise.resolve(30);
        }
        return Promise.resolve(200);
      });
      Warehouse.count.mockResolvedValue(10);
      StockTransfer.count.mockResolvedValue(20);
      StockOpname.count.mockResolvedValue(5);
      MaintenanceWorkOrder.count.mockResolvedValue(15);

      Tenant.count.mockResolvedValue(5);
      Tenant.count.mockImplementation((opts) => {
        const { where } = opts || {};
        if (where && where.status === "active") {
          return Promise.resolve(4);
        }
        return Promise.resolve(5);
      });
      Tenant.findAll.mockResolvedValue([
        { id: "tenant-1", name: "Tenant 1", code: "T1", status: "active" },
        { id: "tenant-2", name: "Tenant 2", code: "T2", status: "active" },
      ]);
      User.findAll.mockResolvedValue([
        { tenantId: "tenant-1", count: "50" },
        { tenantId: "tenant-2", count: "30" },
      ]);
      CalibrationDevice.findAll.mockResolvedValue([
        { tenantId: "tenant-1", count: "40" },
        { tenantId: "tenant-2", count: "20" },
      ]);

      const result = await getDashboardMetrics();

      expect(result.success).toBe(true);
      expect(result.data.scope).toBe("global");
      expect(result.data.tenants.total).toBe(5);
      expect(result.data.tenants.active).toBe(4);
      expect(result.data.tenantBreakdown).toHaveLength(2);
      expect(result.data.tenantBreakdown[0].users).toBe(50);
      expect(result.data.tenantBreakdown[0].devices).toBe(40);
    });

    it("should calculate compliance rate correctly", async () => {
      User.count.mockResolvedValue(10);
      CalibrationDevice.count.mockResolvedValue(5);
      CalibrationRecord.count.mockImplementation(({ where }) => {
        if (where && where.isCompliant !== undefined) {
          return Promise.resolve(7);
        }
        return Promise.resolve(10);
      });
      CalibrationRecord.findAll.mockResolvedValue([]);
      Certificate.count.mockResolvedValue(0);
      Stock.count.mockResolvedValue(0);
      Stock.sum.mockResolvedValue(0);
      Stock.count.mockResolvedValue(0);
      Warehouse.count.mockResolvedValue(0);
      StockTransfer.count.mockResolvedValue(0);
      StockOpname.count.mockResolvedValue(0);
      MaintenanceWorkOrder.count.mockResolvedValue(0);
      Tenant.findByPk.mockResolvedValue(null);

      const result = await getDashboardMetrics("tenant-1");

      expect(result.data.calibrations.complianceRate).toBe(70);
    });

    it("should return null compliance rate when no calibrations", async () => {
      User.count.mockResolvedValue(10);
      CalibrationDevice.count.mockResolvedValue(5);
      CalibrationRecord.count.mockResolvedValue(0);
      CalibrationRecord.findAll.mockResolvedValue([]);
      Certificate.count.mockResolvedValue(0);
      Stock.count.mockResolvedValue(0);
      Stock.sum.mockResolvedValue(0);
      Stock.count.mockResolvedValue(0);
      Warehouse.count.mockResolvedValue(0);
      StockTransfer.count.mockResolvedValue(0);
      StockOpname.count.mockResolvedValue(0);
      MaintenanceWorkOrder.count.mockResolvedValue(0);
      Tenant.findByPk.mockResolvedValue(null);

      const result = await getDashboardMetrics("tenant-1");

      expect(result.data.calibrations.complianceRate).toBeNull();
    });

    it("should handle tenant not found in tenant scope", async () => {
      User.count.mockResolvedValue(0);
      CalibrationDevice.count.mockResolvedValue(0);
      CalibrationRecord.count.mockResolvedValue(0);
      CalibrationRecord.findAll.mockResolvedValue([]);
      Certificate.count.mockResolvedValue(0);
      Stock.count.mockResolvedValue(0);
      Stock.sum.mockResolvedValue(0);
      Stock.count.mockResolvedValue(0);
      Warehouse.count.mockResolvedValue(0);
      StockTransfer.count.mockResolvedValue(0);
      StockOpname.count.mockResolvedValue(0);
      MaintenanceWorkOrder.count.mockResolvedValue(0);
      Tenant.findByPk.mockResolvedValue(null);

      const result = await getDashboardMetrics("nonexistent");

      expect(result.data.tenant).toBeNull();
    });

    it("should include trends in response", async () => {
      User.count.mockResolvedValue(10);
      CalibrationDevice.count.mockResolvedValue(5);
      CalibrationRecord.count.mockResolvedValue(0);
      CalibrationRecord.findAll.mockResolvedValue([
        { month: "2026-01", count: 5 },
        { month: "2026-02", count: 10 },
      ]);
      Certificate.count.mockResolvedValue(0);
      Certificate.findAll.mockResolvedValue([
        { month: "2026-01", count: 2 },
        { month: "2026-02", count: 4 },
      ]);
      Stock.count.mockResolvedValue(0);
      Stock.sum.mockResolvedValue(0);
      Stock.count.mockResolvedValue(0);
      Warehouse.count.mockResolvedValue(0);
      StockTransfer.count.mockResolvedValue(0);
      StockOpname.count.mockResolvedValue(0);
      MaintenanceWorkOrder.count.mockResolvedValue(0);
      Tenant.findByPk.mockResolvedValue(null);

      const result = await getDashboardMetrics("tenant-1");

      expect(result.data.trends.calibrations).toHaveLength(6);
      expect(result.data.trends.certificates).toHaveLength(6);
    });

    it("should include inventory metrics", async () => {
      User.count.mockResolvedValue(10);
      CalibrationDevice.count.mockResolvedValue(5);
      CalibrationRecord.count.mockResolvedValue(0);
      CalibrationRecord.findAll.mockResolvedValue([]);
      Certificate.count.mockResolvedValue(0);
      Stock.count.mockResolvedValue(20);
      Stock.sum.mockResolvedValue(500);
      Stock.count.mockImplementation(({ where }) => {
        if (where && where.quantity) {
          return Promise.resolve(3);
        }
        return Promise.resolve(20);
      });
      Warehouse.count.mockResolvedValue(2);
      StockTransfer.count.mockResolvedValue(2);
      StockOpname.count.mockResolvedValue(1);
      MaintenanceWorkOrder.count.mockResolvedValue(3);
      Tenant.findByPk.mockResolvedValue(null);

      const result = await getDashboardMetrics("tenant-1");

      expect(result.data.inventory.stockItems).toBe(20);
      expect(result.data.inventory.totalQuantity).toBe(500);
      expect(result.data.inventory.lowStockItems).toBe(3);
      expect(result.data.inventory.warehouses).toBe(2);
      expect(result.data.inventory.pendingTransfers).toBe(2);
      expect(result.data.inventory.openOpnames).toBe(1);
    });

    it("should handle zero totalQuantity", async () => {
      User.count.mockResolvedValue(10);
      CalibrationDevice.count.mockResolvedValue(5);
      CalibrationRecord.count.mockResolvedValue(0);
      CalibrationRecord.findAll.mockResolvedValue([]);
      Certificate.count.mockResolvedValue(0);
      Stock.count.mockResolvedValue(0);
      Stock.sum.mockResolvedValue(null);
      Stock.count.mockResolvedValue(0);
      Warehouse.count.mockResolvedValue(0);
      StockTransfer.count.mockResolvedValue(0);
      StockOpname.count.mockResolvedValue(0);
      MaintenanceWorkOrder.count.mockResolvedValue(0);
      Tenant.findByPk.mockResolvedValue(null);

      const result = await getDashboardMetrics("tenant-1");

      expect(result.data.inventory.totalQuantity).toBe(0);
    });
  });
});
