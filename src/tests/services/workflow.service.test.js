const mockTransaction = {
  commit: jest.fn().mockResolvedValue(),
  rollback: jest.fn().mockResolvedValue(),
};

const mockWorkflow = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockWorkflowStep = {
  bulkCreate: jest.fn(),
  destroy: jest.fn(),
};

const mockWorkflowInstance = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
};

const mockWorkflowAction = {
  create: jest.fn(),
};

const mockCertificate = {
  findOne: jest.fn(),
};

const mockStockTransfer = {
  findOne: jest.fn(),
};

const mockMaintenanceWorkOrder = {
  findOne: jest.fn(),
};

jest.mock("../../models", () => {
  return {
    Workflow: mockWorkflow,
    WorkflowStep: mockWorkflowStep,
    WorkflowInstance: mockWorkflowInstance,
    WorkflowAction: mockWorkflowAction,
    Certificate: mockCertificate,
    StockTransfer: mockStockTransfer,
    MaintenanceWorkOrder: mockMaintenanceWorkOrder,
    db: {
      sequelize: {
        transaction: jest.fn(() => Promise.resolve(mockTransaction)),
      },
    },
  };
});

jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

const workflowService = require("../../services/workflow.service");
const { Workflow, WorkflowStep, WorkflowInstance, WorkflowAction, Certificate, StockTransfer, MaintenanceWorkOrder } = require("../../models");

describe("Workflow Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.commit.mockClear();
    mockTransaction.rollback.mockClear();
  });

  describe("getWorkflows", () => {
    it("should fetch all workflows for a tenant", async () => {
      const mockList = [{ id: "wf-1" }];
      Workflow.findAll.mockResolvedValue(mockList);

      const result = await workflowService.getWorkflows("tenant-1");
      expect(result).toEqual(mockList);
      expect(Workflow.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-1" },
        })
      );
    });
  });

  describe("getWorkflowById", () => {
    it("should fetch workflow by ID if it exists", async () => {
      const mockWf = { id: "wf-1" };
      Workflow.findOne.mockResolvedValue(mockWf);

      const result = await workflowService.getWorkflowById("tenant-1", "wf-1");
      expect(result).toEqual(mockWf);
    });

    it("should throw NotFoundError if workflow does not exist", async () => {
      Workflow.findOne.mockResolvedValue(null);

      await expect(
        workflowService.getWorkflowById("tenant-1", "wf-1")
      ).rejects.toThrow("Workflow not found");
    });
  });

  describe("createWorkflow", () => {
    it("should create workflow and steps, committing transaction", async () => {
      const mockWf = { id: "wf-1", resourceType: "Certificate" };
      Workflow.update.mockResolvedValue([1]);
      Workflow.create.mockResolvedValue(mockWf);
      WorkflowStep.bulkCreate.mockResolvedValue([]);
      Workflow.findOne.mockResolvedValue(mockWf);

      const data = {
        name: "Test Workflow",
        resourceType: "Certificate",
        isActive: true,
        steps: [
          { stepOrder: 1, roleId: "role-1", requiredApprovals: 2 },
        ],
      };

      const result = await workflowService.createWorkflow("tenant-1", data);
      
      expect(Workflow.update).toHaveBeenCalled();
      expect(Workflow.create).toHaveBeenCalled();
      expect(WorkflowStep.bulkCreate).toHaveBeenCalled();
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(result).toEqual(mockWf);
    });

    it("should rollback transaction on error", async () => {
      Workflow.update.mockRejectedValue(new Error("DB error"));

      await expect(
        workflowService.createWorkflow("tenant-1", { steps: [] })
      ).rejects.toThrow("DB error");
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });
  });

  describe("updateWorkflow", () => {
    it("should update workflow properties and steps", async () => {
      const mockWf = {
        id: "wf-1",
        name: "Old Name",
        isActive: false,
        resourceType: "Certificate",
        save: jest.fn().mockResolvedValue(),
      };
      Workflow.findOne.mockResolvedValue(mockWf);
      Workflow.update.mockResolvedValue([1]);
      WorkflowStep.destroy.mockResolvedValue(1);
      WorkflowStep.bulkCreate.mockResolvedValue([]);

      const data = {
        name: "New Name",
        isActive: true,
        steps: [{ stepOrder: 1, roleId: "role-1" }],
      };

      const result = await workflowService.updateWorkflow("tenant-1", "wf-1", data);
      
      expect(mockWf.name).toBe("New Name");
      expect(mockWf.isActive).toBe(true);
      expect(Workflow.update).toHaveBeenCalled();
      expect(mockWf.save).toHaveBeenCalled();
      expect(WorkflowStep.destroy).toHaveBeenCalled();
      expect(WorkflowStep.bulkCreate).toHaveBeenCalled();
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(result).toEqual(mockWf);
    });

    it("should rollback on update error", async () => {
      const mockWf = {
        id: "wf-1",
        save: jest.fn().mockRejectedValue(new Error("Save failed")),
      };
      Workflow.findOne.mockResolvedValue(mockWf);

      await expect(
        workflowService.updateWorkflow("tenant-1", "wf-1", { name: "New" })
      ).rejects.toThrow("Save failed");
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });
  });

  describe("deleteWorkflow", () => {
    it("should destroy the workflow", async () => {
      const mockWf = { id: "wf-1", destroy: jest.fn().mockResolvedValue() };
      Workflow.findOne.mockResolvedValue(mockWf);

      await workflowService.deleteWorkflow("tenant-1", "wf-1");
      expect(mockWf.destroy).toHaveBeenCalled();
    });
  });

  describe("startWorkflow", () => {
    it("should return null if no active workflow exists", async () => {
      Workflow.findOne.mockResolvedValue(null);
      const result = await workflowService.startWorkflow("tenant-1", "Certificate", "resource-1");
      expect(result).toBeNull();
    });

    it("should create a WorkflowInstance if active workflow exists", async () => {
      const mockWorkflow = {
        id: "wf-1",
        steps: [{ id: "step-1", stepOrder: 1, roleId: "role-1" }],
      };
      Workflow.findOne.mockResolvedValue(mockWorkflow);
      WorkflowInstance.create.mockResolvedValue({ id: "instance-1", status: "PENDING" });

      const result = await workflowService.startWorkflow("tenant-1", "Certificate", "resource-1");
      
      expect(result).toBeDefined();
      expect(WorkflowInstance.create).toHaveBeenCalled();
    });

    it("should log warn and return null when DB query throws error", async () => {
      Workflow.findOne.mockRejectedValue(new Error("Query failed"));

      const result = await workflowService.startWorkflow("tenant-1", "Certificate", "resource-1");
      expect(result).toBeNull();
    });
  });

  describe("getPendingTasks", () => {
    it("should return pending tasks requiring the user's role and not already acted upon", async () => {
      const mockInstances = [
        {
          id: "instance-1",
          status: "PENDING",
          currentStepOrder: 1,
          workflow: {
            steps: [{ id: "step-1", stepOrder: 1, roleId: "admin" }],
          },
          actions: [],
        },
        {
          id: "instance-2",
          status: "PENDING",
          currentStepOrder: 1,
          workflow: {
            steps: [{ id: "step-2", stepOrder: 1, roleId: "admin" }],
          },
          actions: [{ stepId: "step-2", userId: "user-1" }],
        },
        {
          id: "instance-3",
          status: "PENDING",
          currentStepOrder: 1,
          workflow: {
            steps: [{ id: "step-3", stepOrder: 2, roleId: "admin" }], // mismatch currentStepOrder
          },
          actions: [],
        },
      ];

      WorkflowInstance.findAll.mockResolvedValue(mockInstances);

      const user = { id: "user-1", roleId: "admin" };
      const result = await workflowService.getPendingTasks("tenant-1", user);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe("instance-1");
    });
  });

  describe("submitAction", () => {
    it("should throw 404 if instance not found", async () => {
      WorkflowInstance.findOne.mockResolvedValue(null);

      await expect(
        workflowService.submitAction("tenant-1", "instance-1", {}, {})
      ).rejects.toThrow("Workflow instance not found");
    });

    it("should throw 400 if instance status is not PENDING", async () => {
      const mockInstance = { id: "instance-1", status: "APPROVED" };
      WorkflowInstance.findOne.mockResolvedValue(mockInstance);

      await expect(
        workflowService.submitAction("tenant-1", "instance-1", {}, {})
      ).rejects.toThrow("Workflow instance is already APPROVED");
    });

    it("should throw 500 if step configuration is missing", async () => {
      const mockInstance = {
        id: "instance-1",
        status: "PENDING",
        currentStepOrder: 1,
        workflow: { steps: [] },
      };
      WorkflowInstance.findOne.mockResolvedValue(mockInstance);

      await expect(
        workflowService.submitAction("tenant-1", "instance-1", {}, {})
      ).rejects.toThrow("Workflow step configuration error");
    });

    it("should throw 403 if user does not have the required role", async () => {
      const mockInstance = {
        id: "instance-1",
        status: "PENDING",
        currentStepOrder: 1,
        workflow: {
          steps: [{ id: "step-1", stepOrder: 1, roleId: "admin" }],
        },
        actions: [],
      };
      WorkflowInstance.findOne.mockResolvedValue(mockInstance);

      await expect(
        workflowService.submitAction("tenant-1", "instance-1", { roleId: "user" }, {})
      ).rejects.toThrow("You do not have the required role to approve this step");
    });

    it("should throw 400 if user has already acted on this step", async () => {
      const mockInstance = {
        id: "instance-1",
        status: "PENDING",
        currentStepOrder: 1,
        workflow: {
          steps: [{ id: "step-1", stepOrder: 1, roleId: "admin" }],
        },
        actions: [{ stepId: "step-1", userId: "user-1" }],
      };
      WorkflowInstance.findOne.mockResolvedValue(mockInstance);

      await expect(
        workflowService.submitAction("tenant-1", "instance-1", { id: "user-1", roleId: "admin" }, {})
      ).rejects.toThrow("You have already submitted an action for this step");
    });

    it("should process REJECTED action and update resource status", async () => {
      const mockInstance = {
        id: "instance-1",
        status: "PENDING",
        currentStepOrder: 1,
        workflow: {
          resourceType: "Certificate",
          steps: [{ id: "step-1", stepOrder: 1, roleId: "admin" }],
        },
        actions: [],
        resourceId: "res-1",
        save: jest.fn().mockResolvedValue(),
      };
      WorkflowInstance.findOne.mockResolvedValue(mockInstance);
      WorkflowAction.create.mockResolvedValue({});
      
      const mockCert = { id: "res-1", status: "PENDING", save: jest.fn().mockResolvedValue() };
      Certificate.findOne.mockResolvedValue(mockCert);

      const result = await workflowService.submitAction(
        "tenant-1",
        "instance-1",
        { id: "user-1", roleId: "admin" },
        { action: "REJECTED", comments: "Bad" }
      );

      expect(mockInstance.status).toBe("REJECTED");
      expect(mockInstance.save).toHaveBeenCalled();
      expect(mockCert.status).toBe("DRAFT");
      expect(mockCert.save).toHaveBeenCalled();
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(result.status).toBe("REJECTED");
    });

    it("should process APPROVED and advance to next step if not final", async () => {
      const mockInstance = {
        id: "instance-1",
        status: "PENDING",
        currentStepOrder: 1,
        workflow: {
          resourceType: "Certificate",
          steps: [
            { id: "step-1", stepOrder: 1, roleId: "admin", requiredApprovals: 1 },
            { id: "step-2", stepOrder: 2, roleId: "manager", requiredApprovals: 1 },
          ],
        },
        actions: [],
        resourceId: "res-1",
        save: jest.fn().mockResolvedValue(),
      };
      WorkflowInstance.findOne.mockResolvedValue(mockInstance);
      WorkflowAction.create.mockResolvedValue({});

      const result = await workflowService.submitAction(
        "tenant-1",
        "instance-1",
        { id: "user-1", roleId: "admin" },
        { action: "APPROVED" }
      );

      expect(mockInstance.currentStepOrder).toBe(2);
      expect(mockInstance.save).toHaveBeenCalled();
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(result.status).toBe("PENDING");
    });

    it("should process APPROVED, finalize workflow and update resource status (StockTransfer, MaintenanceWorkOrder)", async () => {
      const mockInstance = {
        id: "instance-1",
        status: "PENDING",
        currentStepOrder: 1,
        workflow: {
          resourceType: "StockTransfer",
          steps: [
            { id: "step-1", stepOrder: 1, roleId: "admin", requiredApprovals: 1 },
          ],
        },
        actions: [],
        resourceId: "res-1",
        save: jest.fn().mockResolvedValue(),
      };
      WorkflowInstance.findOne.mockResolvedValue(mockInstance);
      WorkflowAction.create.mockResolvedValue({});

      const mockST = { id: "res-1", status: "Pending", save: jest.fn().mockResolvedValue() };
      StockTransfer.findOne.mockResolvedValue(mockST);

      const result = await workflowService.submitAction(
        "tenant-1",
        "instance-1",
        { id: "user-1", roleId: "admin" },
        { action: "APPROVED" }
      );

      expect(mockInstance.status).toBe("APPROVED");
      expect(mockInstance.save).toHaveBeenCalled();
      expect(mockST.status).toBe("Approved");
      expect(mockST.save).toHaveBeenCalled();
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(result.status).toBe("APPROVED");
    });

    it("should update MaintenanceWorkOrder when approved", async () => {
      const mockInstance = {
        id: "instance-1",
        status: "PENDING",
        currentStepOrder: 1,
        workflow: {
          resourceType: "MaintenanceWorkOrder",
          steps: [
            { id: "step-1", stepOrder: 1, roleId: "admin", requiredApprovals: 1 },
          ],
        },
        actions: [],
        resourceId: "res-1",
        save: jest.fn().mockResolvedValue(),
      };
      WorkflowInstance.findOne.mockResolvedValue(mockInstance);
      WorkflowAction.create.mockResolvedValue({});

      const mockWO = { id: "res-1", status: "Assigned", save: jest.fn().mockResolvedValue() };
      MaintenanceWorkOrder.findOne.mockResolvedValue(mockWO);

      await workflowService.submitAction(
        "tenant-1",
        "instance-1",
        { id: "user-1", roleId: "admin" },
        { action: "APPROVED" }
      );

      expect(mockWO.status).toBe("Completed");
    });

    it("should process APPROVED, finalize workflow and update Certificate status", async () => {
      const mockInstance = {
        id: "instance-1",
        status: "PENDING",
        currentStepOrder: 1,
        workflow: {
          resourceType: "Certificate",
          steps: [
            { id: "step-1", stepOrder: 1, roleId: "admin", requiredApprovals: 1 },
          ],
        },
        actions: [],
        resourceId: "res-1",
        save: jest.fn().mockResolvedValue(),
      };
      WorkflowInstance.findOne.mockResolvedValue(mockInstance);
      WorkflowAction.create.mockResolvedValue({});

      const mockCert = { id: "res-1", status: "PENDING", save: jest.fn().mockResolvedValue() };
      Certificate.findOne.mockResolvedValue(mockCert);

      const result = await workflowService.submitAction(
        "tenant-1",
        "instance-1",
        { id: "user-1", roleId: "admin" },
        { action: "APPROVED" }
      );

      expect(mockInstance.status).toBe("APPROVED");
      expect(mockInstance.save).toHaveBeenCalled();
      expect(mockCert.status).toBe("APPROVED");
      expect(mockCert.approvedById).toBe("user-1");
      expect(mockCert.save).toHaveBeenCalled();
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(result.status).toBe("APPROVED");
    });

    it("should process REJECTED action and update StockTransfer status", async () => {
      const mockInstance = {
        id: "instance-1",
        status: "PENDING",
        currentStepOrder: 1,
        workflow: {
          resourceType: "StockTransfer",
          steps: [{ id: "step-1", stepOrder: 1, roleId: "admin" }],
        },
        actions: [],
        resourceId: "res-1",
        save: jest.fn().mockResolvedValue(),
      };
      WorkflowInstance.findOne.mockResolvedValue(mockInstance);
      WorkflowAction.create.mockResolvedValue({});
      
      const mockST = { id: "res-1", status: "Pending", save: jest.fn().mockResolvedValue() };
      StockTransfer.findOne.mockResolvedValue(mockST);

      await workflowService.submitAction(
        "tenant-1",
        "instance-1",
        { id: "user-1", roleId: "admin" },
        { action: "REJECTED" }
      );

      expect(mockST.status).toBe("Rejected");
    });

    it("should handle missing target resource gracefully during status update", async () => {
      const mockInstance = {
        id: "instance-1",
        status: "PENDING",
        currentStepOrder: 1,
        workflow: {
          resourceType: "Certificate",
          steps: [{ id: "step-1", stepOrder: 1, roleId: "admin" }],
        },
        actions: [],
        resourceId: "res-1",
        save: jest.fn().mockResolvedValue(),
      };
      WorkflowInstance.findOne.mockResolvedValue(mockInstance);
      WorkflowAction.create.mockResolvedValue({});
      
      Certificate.findOne.mockResolvedValue(null);

      const result = await workflowService.submitAction(
        "tenant-1",
        "instance-1",
        { id: "user-1", roleId: "admin" },
        { action: "REJECTED" }
      );

      expect(result.status).toBe("REJECTED");
    });

    it("should rollback transaction on submit error", async () => {
      const mockInstance = {
        id: "instance-1",
        status: "PENDING",
        currentStepOrder: 1,
        workflow: {
          steps: [{ id: "step-1", stepOrder: 1, roleId: "admin" }],
        },
        actions: [],
      };
      WorkflowInstance.findOne.mockResolvedValue(mockInstance);
      WorkflowAction.create.mockRejectedValue(new Error("Insert error"));

      await expect(
        workflowService.submitAction("tenant-1", "instance-1", { id: "user-1", roleId: "admin" }, { action: "APPROVED" })
      ).rejects.toThrow("Insert error");
      
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });
  });
});
