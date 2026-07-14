jest.mock("../../models", () => ({
  CalibrationDevice: { findAll: jest.fn() },
  MaintenanceWorkOrder: { findOne: jest.fn() },
}));
jest.mock("../../services/maintenance.service", () => ({ createWorkOrder: jest.fn() }));
jest.mock("../../services/notification.service", () => ({ emitNotification: jest.fn() }));
jest.mock("../../services/webhook.service", () => ({ emitEvent: jest.fn() }));
jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const scheduler = require("../../services/calibrationScheduler.service");
const { CalibrationDevice, MaintenanceWorkOrder } = require("../../models");
const maintenanceService = require("../../services/maintenance.service");
const notificationService = require("../../services/notification.service");
const webhookService = require("../../services/webhook.service");

describe("calibrationScheduler.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    maintenanceService.createWorkOrder.mockResolvedValue({ data: { id: "wo1" } });
    notificationService.emitNotification.mockResolvedValue({ id: "n1" });
    webhookService.emitEvent.mockResolvedValue({ matched: 0 });
  });

  it("creates a work order + notification for a due device with no open WO", async () => {
    CalibrationDevice.findAll.mockResolvedValue([
      { id: "d1", tenantId: "t1", name: "Dev", serialNumber: "s", nextCalibrationDate: new Date("2020-01-01") },
    ]);
    MaintenanceWorkOrder.findOne.mockResolvedValue(null);

    const summary = await scheduler.runCalibrationScan({ tenantId: "t1" });

    expect(summary.scanned).toBe(1);
    expect(summary.workOrdersCreated).toBe(1);
    expect(summary.notificationsCreated).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(maintenanceService.createWorkOrder).toHaveBeenCalled();
    expect(webhookService.emitEvent).toHaveBeenCalledWith(
      "t1",
      "device.overdue",
      expect.objectContaining({ deviceId: "d1" }),
    );
  });

  it("is idempotent — skips a due device that already has an open WO", async () => {
    CalibrationDevice.findAll.mockResolvedValue([
      { id: "d1", tenantId: "t1", name: "Dev", nextCalibrationDate: new Date("2020-01-01") },
    ]);
    MaintenanceWorkOrder.findOne.mockResolvedValue({ id: "existing" });

    const summary = await scheduler.runCalibrationScan({ tenantId: "t1" });

    expect(summary.workOrdersCreated).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(maintenanceService.createWorkOrder).not.toHaveBeenCalled();
  });
});
