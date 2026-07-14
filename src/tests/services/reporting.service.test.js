jest.mock("../../models", () => ({
  CalibrationDevice: { findAll: jest.fn(), count: jest.fn() },
  CalibrationRecord: { findAll: jest.fn() },
  Certificate: { findAll: jest.fn() },
  MaintenanceWorkOrder: { findAll: jest.fn() },
  Stock: { findAll: jest.fn() },
}));

const reporting = require("../../services/reporting.service");
const { CalibrationDevice, CalibrationRecord, Stock } = require("../../models");

describe("reporting.service", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("toCsv", () => {
    it("builds a CSV and escapes commas/quotes", () => {
      const csv = reporting.toCsv(
        [{ key: "a", label: "A" }, { key: "b", label: "B" }],
        [{ a: "x", b: "y,z" }, { a: 'q"q', b: 1 }],
      );
      const lines = csv.split("\n");
      expect(lines[0]).toBe("A,B");
      expect(lines[1]).toBe('x,"y,z"');
      expect(lines[2]).toBe('"q""q",1');
    });
  });

  describe("getInventory", () => {
    it("summarizes totals and low-stock", async () => {
      Stock.findAll.mockResolvedValue([
        { itemName: "A", sku: "s1", quantity: 10, minQuantity: 2 },
        { itemName: "B", sku: "s2", quantity: 1, minQuantity: 5 },
      ]);
      const r = await reporting.getInventory("t1");
      expect(r.summary).toEqual({ totalItems: 2, totalQuantity: 11, lowStockCount: 1 });
      expect(r.lowStock).toHaveLength(1);
      expect(r.csv.headers.length).toBeGreaterThan(0);
    });
  });

  describe("getCompliance", () => {
    it("computes the compliance rate", async () => {
      CalibrationRecord.findAll.mockResolvedValue([
        { isCompliant: true },
        { isCompliant: true },
        { isCompliant: false },
        { isCompliant: null },
      ]);
      const r = await reporting.getCompliance("t1");
      expect(r.summary).toMatchObject({
        total: 4,
        compliant: 2,
        nonCompliant: 1,
        unknown: 1,
        complianceRate: 50,
      });
    });
  });

  describe("getOverdueDevices", () => {
    it("returns overdue devices with daysOverdue", async () => {
      const now = new Date("2026-01-11T00:00:00Z");
      CalibrationDevice.findAll.mockResolvedValue([
        {
          id: "d1",
          name: "Dev",
          serialNumber: "s",
          category: "c",
          nextCalibrationDate: new Date("2026-01-01T00:00:00Z"),
        },
      ]);
      const r = await reporting.getOverdueDevices("t1", { now });
      expect(r.total).toBe(1);
      expect(r.rows[0].daysOverdue).toBe(10);
    });
  });
});
