jest.mock("../../services/workflow.service", () => ({
  getWorkflows: jest.fn(),
  getWorkflowById: jest.fn(),
  createWorkflow: jest.fn(),
  updateWorkflow: jest.fn(),
  deleteWorkflow: jest.fn(),
  getPendingTasks: jest.fn(),
  submitAction: jest.fn(),
}));

jest.mock("../../utils/response.util", () => ({
  success: jest.fn(),
  error: jest.fn(),
  successResponse: jest.fn((res, status, message, data) => {
    res.status(status).json({ success: true, status, message, data });
  }),
}));

const workflowController = require("../../controllers/workflow.controller");
const workflowService = require("../../services/workflow.service");

describe("workflow Controller", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      params: {},
      body: {},
      query: {},
      user: { id: "user-1" },
      tenant: { id: "tenant-1" },
    };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    next = jest.fn();
  });

  describe("getWorkflows", () => {
    it("should return workflows", async () => {
      workflowService.getWorkflows.mockResolvedValue([]);
      await workflowController.getWorkflows(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should handle errors", async () => {
      workflowService.getWorkflows.mockRejectedValue(new Error("err"));
      await workflowController.getWorkflows(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("getWorkflowById", () => {
    it("should return workflow by id", async () => {
      workflowService.getWorkflowById.mockResolvedValue({ id: "wf-1" });
      req.params = { id: "wf-1" };
      await workflowController.getWorkflowById(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("createWorkflow", () => {
    it("should create workflow", async () => {
      workflowService.createWorkflow.mockResolvedValue({ id: "wf-1" });
      req.body = { name: "Test" };
      await workflowController.createWorkflow(req, res, next);
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe("updateWorkflow", () => {
    it("should update workflow", async () => {
      workflowService.updateWorkflow.mockResolvedValue({ id: "wf-1" });
      req.params = { id: "wf-1" };
      req.body = { name: "Updated" };
      await workflowController.updateWorkflow(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("deleteWorkflow", () => {
    it("should delete workflow", async () => {
      workflowService.deleteWorkflow.mockResolvedValue(true);
      req.params = { id: "wf-1" };
      await workflowController.deleteWorkflow(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("getPendingTasks", () => {
    it("should return pending tasks", async () => {
      workflowService.getPendingTasks.mockResolvedValue([]);
      await workflowController.getPendingTasks(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("submitAction", () => {
    it("should submit action", async () => {
      workflowService.submitAction.mockResolvedValue({ message: "done", status: "approved" });
      req.params = { instanceId: "inst-1" };
      req.body = { action: "approve" };
      await workflowController.submitAction(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
  });
});