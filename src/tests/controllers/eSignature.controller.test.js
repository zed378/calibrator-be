jest.mock("../../services/eSignature.service", () => ({
  getKeyPairs: jest.fn(),
  generateKeyPair: jest.fn(),
  deleteKeyPair: jest.fn(),
  getWorkflows: jest.fn(),
  createSignatureWorkflow: jest.fn(),
  getWorkflow: jest.fn(),
  updateWorkflow: jest.fn(),
  deleteWorkflow: jest.fn(),
  signDocument: jest.fn(),
  verifySignature: jest.fn(),
  getSignatureHistory: jest.fn(),
  cancelWorkflow: jest.fn(),
  revokeSignature: jest.fn(),
  getStatus: jest.fn(() => ({ enabled: true, algorithm: "RSA" })),
}));

jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../utils/response.util", () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

const eSignatureController = require("../../controllers/eSignature.controller");
const eSignatureService = require("../../services/eSignature.service");
const { success } = require("../../utils/response.util");

describe("eSignature Controller", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    // eSignature uses success(res, data, status, message) or success(res, data, message)
    success.mockImplementation((res, data, ...rest) => {
      let status = 200;
      let message = "success";
      if (typeof rest[0] === "number") { status = rest[0]; message = rest[1] || "success"; }
      else { message = rest[0] || "success"; }
      res.status(status).json({ success: true, data, message });
    });
    req = {
      params: {},
      body: {},
      query: {},
      user: { id: "user-1", tenantId: "tenant-1" },
    };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    next = jest.fn();
  });

  describe("getKeyPairs", () => {
    it("should return key pairs", async () => {
      eSignatureService.getKeyPairs.mockResolvedValue([]);
      await eSignatureController.getKeyPairs(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("createKeyPair", () => {
    it("should create key pair", async () => {
      eSignatureService.generateKeyPair.mockResolvedValue({ publicKey: "key" });
      await eSignatureController.createKeyPair(req, res, next);
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe("deleteKeyPair", () => {
    it("should delete key pair", async () => {
      req.params = { keyPairId: "kp-1" };
      eSignatureService.deleteKeyPair.mockResolvedValue(true);
      await eSignatureController.deleteKeyPair(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("getWorkflows", () => {
    it("should return workflows", async () => {
      eSignatureService.getWorkflows.mockResolvedValue([]);
      await eSignatureController.getWorkflows(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
    it("should filter by status", async () => {
      req.query = { status: "active" };
      eSignatureService.getWorkflows.mockResolvedValue([]);
      await eSignatureController.getWorkflows(req, res, next);
      expect(eSignatureService.getWorkflows).toHaveBeenCalledWith("tenant-1", { status: "active" });
    });
  });

  describe("createWorkflow", () => {
    it("should create workflow", async () => {
      req.body = { documentId: "doc-1", signers: [], subject: "test" };
      eSignatureService.createSignatureWorkflow.mockResolvedValue({ id: "wf-1" });
      await eSignatureController.createWorkflow(req, res, next);
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe("getWorkflow", () => {
    it("should return workflow", async () => {
      req.params = { workflowId: "wf-1" };
      eSignatureService.getWorkflow.mockResolvedValue({ id: "wf-1" });
      await eSignatureController.getWorkflow(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("updateWorkflow", () => {
    it("should update workflow", async () => {
      req.params = { workflowId: "wf-1" };
      req.body = { subject: "updated" };
      eSignatureService.updateWorkflow.mockResolvedValue({ id: "wf-1" });
      await eSignatureController.updateWorkflow(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("deleteWorkflow", () => {
    it("should delete workflow", async () => {
      req.params = { workflowId: "wf-1" };
      eSignatureService.deleteWorkflow.mockResolvedValue(true);
      await eSignatureController.deleteWorkflow(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("signDocument", () => {
    it("should sign document", async () => {
      req.params = { stepId: "step-1" };
      req.body = { authenticationMethod: "biometric" };
      eSignatureService.signDocument.mockResolvedValue({ signatureId: "sig-1" });
      await eSignatureController.signDocument(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("verifySignature", () => {
    it("should verify signature", async () => {
      req.params = { signatureId: "sig-1" };
      eSignatureService.verifySignature.mockResolvedValue({ valid: true });
      await eSignatureController.verifySignature(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("getSignatureHistory", () => {
    it("should return history", async () => {
      req.query = { userId: "user-1" };
      eSignatureService.getSignatureHistory.mockResolvedValue([]);
      await eSignatureController.getSignatureHistory(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("cancelWorkflow", () => {
    it("should cancel workflow", async () => {
      req.params = { workflowId: "wf-1" };
      eSignatureService.cancelWorkflow.mockResolvedValue(true);
      await eSignatureController.cancelWorkflow(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("revokeSignature", () => {
    it("should revoke signature", async () => {
      req.params = { signatureId: "sig-1" };
      req.body = { reason: "erroneous" };
      eSignatureService.revokeSignature.mockResolvedValue(true);
      await eSignatureController.revokeSignature(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("getStatus", () => {
    it("should return status", async () => {
      await eSignatureController.getStatus(req, res, next);
      expect(res.json).toHaveBeenCalled();
    });
  });
});