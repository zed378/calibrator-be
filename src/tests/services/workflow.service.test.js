const workflowService = require("../../services/workflow.service");
const { Workflow, WorkflowStep, WorkflowInstance, WorkflowAction, db } = require("../../models");
const AppError = require("../../utils/appError.util");

// Mock the models
jest.mock("../../models", () => {
  const SequelizeMock = require("sequelize-mock");
  const dbMock = new SequelizeMock();
  return {
    Workflow: dbMock.define("Workflow"),
    WorkflowStep: dbMock.define("WorkflowStep"),
    WorkflowInstance: dbMock.define("WorkflowInstance"),
    WorkflowAction: dbMock.define("WorkflowAction"),
    Certificate: dbMock.define("Certificate"),
    StockTransfer: dbMock.define("StockTransfer"),
    MaintenanceWorkOrder: dbMock.define("MaintenanceWorkOrder"),
    db: {
      sequelize: {
        transaction: jest.fn(() => ({
          commit: jest.fn(),
          rollback: jest.fn(),
        })),
      },
    },
  };
});

describe("Workflow Service", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("startWorkflow", () => {
    it("should return null if no active workflow exists", async () => {
      Workflow.findOne = jest.fn().mockResolvedValue(null);
      const result = await workflowService.startWorkflow("tenant-1", "Certificate", "resource-1");
      expect(result).toBeNull();
    });

    it("should create a WorkflowInstance if active workflow exists", async () => {
      const mockWorkflow = {
        id: "wf-1",
        steps: [{ id: "step-1", stepOrder: 1, roleId: "role-1" }],
      };
      Workflow.findOne = jest.fn().mockResolvedValue(mockWorkflow);
      WorkflowInstance.create = jest.fn().mockResolvedValue({ id: "instance-1", status: "PENDING" });

      const result = await workflowService.startWorkflow("tenant-1", "Certificate", "resource-1");
      
      expect(result).toBeDefined();
      expect(WorkflowInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          workflowId: "wf-1",
          resourceId: "resource-1",
          status: "PENDING",
          currentStepOrder: 1,
        }),
        expect.any(Object)
      );
    });
  });

  describe("submitAction", () => {
    it("should reject if user does not have the required role", async () => {
      const mockInstance = {
        id: "instance-1",
        status: "PENDING",
        currentStepOrder: 1,
        workflow: {
          id: "wf-1",
          steps: [{ id: "step-1", stepOrder: 1, roleId: "admin-role" }],
        },
        actions: [],
      };
      WorkflowInstance.findOne = jest.fn().mockResolvedValue(mockInstance);

      await expect(
        workflowService.submitAction("tenant-1", "instance-1", { id: "user-1", roleId: "user-role" }, { action: "APPROVED" })
      ).rejects.toThrow("You do not have the required role to approve this step");
    });
  });
});
