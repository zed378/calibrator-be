const { AppError } = require("../../utils/appError.util");

const mockSopDocument = {
  count: jest.fn(),
  create: jest.fn(),
  findAndCountAll: jest.fn(),
  findOne: jest.fn(),
};

const mockSopTrainingAcknowledgment = {
  bulkCreate: jest.fn(),
  findOne: jest.fn(),
};

const mockUser = {
  findAll: jest.fn(),
};

const mockModels = {
  SopDocument: mockSopDocument,
  SopTrainingAcknowledgment: mockSopTrainingAcknowledgment,
  User: mockUser,
};

jest.mock("../../models", () => mockModels);
jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const sopService = require("../../services/sop.service");

describe("sop.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createDocument", () => {
    it("should create SOP document with formatted number", async () => {
      mockSopDocument.count.mockResolvedValue(5);
      mockSopDocument.create.mockImplementation((data) =>
        Promise.resolve({ id: "sop-1", ...data }),
      );

      const result = await sopService.createDocument("tenant-1", "user-1", {
        title: "Test SOP",
        version: "1.1",
        contentUrl: "https://example.com/sop",
        requiresTraining: false,
      });

      expect(mockSopDocument.count).toHaveBeenCalledWith({
        where: { tenantId: "tenant-1" },
      });
      expect(mockSopDocument.create).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        authorId: "user-1",
        documentNumber: "SOP-0006",
        title: "Test SOP",
        version: "1.1",
        contentUrl: "https://example.com/sop",
        requiresTraining: false,
        status: "DRAFT",
      });
      expect(result.id).toBe("sop-1");
    });
  });

  describe("getDocuments", () => {
    it("should return paginated list of documents", async () => {
      mockSopDocument.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [{ id: "sop-1", title: "SOP 1" }],
      });

      const result = await sopService.getDocuments("tenant-1", 1, 10, "PUBLISHED");

      expect(mockSopDocument.findAndCountAll).toHaveBeenCalledWith({
        where: { tenantId: "tenant-1", status: "PUBLISHED" },
        limit: 10,
        offset: 0,
        include: [
          {
            model: mockUser,
            as: "author",
            attributes: ["id", "firstName", "lastName"],
          },
        ],
        order: [["createdAt", "DESC"]],
      });
      expect(result.total).toBe(1);
      expect(result.documents).toHaveLength(1);
    });
  });

  describe("publishDocument", () => {
    it("should publish SOP and create bulk training acknowledgments if required", async () => {
      const mockDoc = {
        id: "sop-1",
        requiresTraining: true,
        status: "DRAFT",
        save: jest.fn().mockResolvedValue(true),
      };
      mockSopDocument.findOne.mockResolvedValue(mockDoc);
      mockUser.findAll.mockResolvedValue([
        { id: "user-1" },
        { id: "user-2" },
      ]);

      const result = await sopService.publishDocument("tenant-1", "sop-1");

      expect(mockSopDocument.findOne).toHaveBeenCalledWith({
        where: { id: "sop-1", tenantId: "tenant-1" },
      });
      expect(mockDoc.status).toBe("PUBLISHED");
      expect(mockDoc.publishedDate).toBeDefined();
      expect(mockDoc.save).toHaveBeenCalled();
      expect(mockUser.findAll).toHaveBeenCalledWith({
        where: { tenantId: "tenant-1" },
      });
      expect(mockSopTrainingAcknowledgment.bulkCreate).toHaveBeenCalledWith([
        { tenantId: "tenant-1", documentId: "sop-1", userId: "user-1", status: "PENDING" },
        { tenantId: "tenant-1", documentId: "sop-1", userId: "user-2", status: "PENDING" },
      ]);
      expect(result.id).toBe("sop-1");
    });

    it("should throw 404 AppError if document not found", async () => {
      mockSopDocument.findOne.mockResolvedValue(null);

      await expect(
        sopService.publishDocument("tenant-1", "sop-1"),
      ).rejects.toThrow("Document not found");
    });
  });

  describe("acknowledgeTraining", () => {
    it("should complete training acknowledgment if found", async () => {
      const mockAck = {
        tenantId: "tenant-1",
        userId: "user-1",
        documentId: "sop-1",
        status: "PENDING",
        save: jest.fn().mockResolvedValue(true),
      };
      mockSopTrainingAcknowledgment.findOne.mockResolvedValue(mockAck);

      const result = await sopService.acknowledgeTraining("tenant-1", "user-1", "sop-1");

      expect(mockSopTrainingAcknowledgment.findOne).toHaveBeenCalledWith({
        where: { tenantId: "tenant-1", userId: "user-1", documentId: "sop-1" },
      });
      expect(mockAck.status).toBe("COMPLETED");
      expect(mockAck.acknowledgedAt).toBeDefined();
      expect(mockAck.save).toHaveBeenCalled();
      expect(result.status).toBe("COMPLETED");
    });

    it("should throw 404 AppError if training acknowledgment not found", async () => {
      mockSopTrainingAcknowledgment.findOne.mockResolvedValue(null);

      await expect(
        sopService.acknowledgeTraining("tenant-1", "user-1", "sop-1"),
      ).rejects.toThrow("Training acknowledgment not found");
    });
  });
});
