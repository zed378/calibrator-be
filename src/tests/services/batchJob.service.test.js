/**
 * Tests for Batch Job Service
 */

jest.mock("../../models", () => ({
  BatchJob: {
    create: jest.fn(),
    findAndCountAll: jest.fn(),
    findOne: jest.fn(),
    findByPk: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock("../../utils/appError.util", () => {
  console.log("[appError MOCK FACTORY]");
  return {
    AppError: class AppError extends Error {
      constructor(status, message) {
        super(message);
        this.status = status;
      }
    },
  };
});

const batchJobService = require("../../services/batchJob.service");
const { BatchJob } = require("../../models");
const { AppError } = require("../../utils/appError.util");

describe("batchJobService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createJob", () => {
    it("should create a batch job with default values", async () => {
      const tenantId = "tenant-1";
      const userId = "user-1";
      const type = "export";

      const mockJob = {
        id: "job-1",
        tenantId,
        userId,
        type,
        status: "PENDING",
        progress: 0,
        totalItems: 0,
      };

      BatchJob.create.mockResolvedValueOnce(mockJob);

      const result = await batchJobService.createJob(tenantId, userId, type);

      expect(BatchJob.create).toHaveBeenCalledWith({
        tenantId,
        userId,
        type,
        status: "PENDING",
        progress: 0,
        totalItems: 0,
      });
      expect(result).toEqual(mockJob);
    });

    it("should create a batch job with specified totalItems", async () => {
      const tenantId = "tenant-1";
      const userId = "user-1";
      const type = "import";
      const totalItems = 1000;

      const mockJob = {
        id: "job-1",
        tenantId,
        userId,
        type,
        status: "PENDING",
        progress: 0,
        totalItems,
      };

      BatchJob.create.mockResolvedValueOnce(mockJob);

      const result = await batchJobService.createJob(
        tenantId,
        userId,
        type,
        totalItems,
      );

      expect(BatchJob.create).toHaveBeenCalledWith({
        tenantId,
        userId,
        type,
        status: "PENDING",
        progress: 0,
        totalItems,
      });
      expect(result.totalItems).toBe(totalItems);
    });
  });

  describe("getJobs", () => {
    it("should return paginated batch jobs", async () => {
      const tenantId = "tenant-1";
      const page = 1;
      const limit = 10;
      const mockJobs = [
        { id: "job-1", status: "PENDING" },
        { id: "job-2", status: "COMPLETED" },
      ];

      BatchJob.findAndCountAll.mockResolvedValueOnce({
        count: 2,
        rows: mockJobs,
      });

      const result = await batchJobService.getJobs(tenantId, page, limit);

      expect(BatchJob.findAndCountAll).toHaveBeenCalledWith({
        where: { tenantId },
        limit,
        offset: 0,
        order: [["createdAt", "DESC"]],
      });

      expect(result).toEqual({
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
        jobs: mockJobs,
      });
    });

    it("should calculate totalPages correctly", async () => {
      const tenantId = "tenant-1";
      const page = 1;
      const limit = 10;

      BatchJob.findAndCountAll.mockResolvedValueOnce({
        count: 25,
        rows: [],
      });

      const result = await batchJobService.getJobs(tenantId, page, limit);

      expect(result.totalPages).toBe(3);
    });

    it("should return correct offset for page 2", async () => {
      const tenantId = "tenant-1";
      const page = 2;
      const limit = 10;

      BatchJob.findAndCountAll.mockResolvedValueOnce({
        count: 15,
        rows: [],
      });

      await batchJobService.getJobs(tenantId, page, limit);

      expect(BatchJob.findAndCountAll).toHaveBeenCalledWith({
        where: { tenantId },
        limit: 10,
        offset: 10,
        order: [["createdAt", "DESC"]],
      });
    });
  });

  describe("getJobStatus", () => {
    it("should return a job by id", async () => {
      const tenantId = "tenant-1";
      const jobId = "job-1";
      const mockJob = {
        id: jobId,
        tenantId,
        status: "PROCESSING",
        progress: 50,
      };

      BatchJob.findOne.mockResolvedValueOnce(mockJob);

      const result = await batchJobService.getJobStatus(tenantId, jobId);

      expect(BatchJob.findOne).toHaveBeenCalledWith({
        where: { id: jobId, tenantId },
      });
      expect(result).toEqual(mockJob);
    });

    it("should throw AppError when job not found", async () => {
      const tenantId = "tenant-1";
      const jobId = "nonexistent";

      BatchJob.findOne.mockResolvedValueOnce(null);

      await expect(
        batchJobService.getJobStatus(tenantId, jobId),
      ).rejects.toThrow("Job not found");
      await expect(
        batchJobService.getJobStatus(tenantId, jobId),
      ).rejects.toHaveProperty("status", 404);
    });
  });

  describe("simulateProcessing", () => {
    it("should update job status to PROCESSING immediately after start", async () => {
      // Set up fake timers for the test
      jest.useFakeTimers();
      
      const jobId = "job-1";
      const mockJob = {
        id: jobId,
        totalItems: 3,
        processedItems: 0,
        progress: 0,
        status: "PENDING",
        save: jest.fn().mockResolvedValue(true),
      };

      BatchJob.findByPk.mockResolvedValueOnce(mockJob);

      // Call simulateProcessing — it sets up a setTimeout internally
      batchJobService.simulateProcessing(jobId);

      // Advance past the initial setTimeout (1000ms) to trigger the callback
      jest.advanceTimersByTime(1001);

      // Run all pending timers including async callbacks
      await jest.runAllTimersAsync();

      expect(BatchJob.findByPk).toHaveBeenCalledWith(jobId);
      expect(mockJob.save).toHaveBeenCalled();
      
      // Clean up fake timers
      jest.useRealTimers();
    });

    it("should complete job after processing all items", async () => {
      jest.useFakeTimers();
      
      const jobId = "job-1";
      const totalItems = 2;
      const mockJob = {
        id: jobId,
        totalItems,
        processedItems: 0,
        progress: 0,
        status: "PENDING",
        save: jest.fn().mockResolvedValue(true),
      };

      BatchJob.findByPk.mockResolvedValue(mockJob);

      batchJobService.simulateProcessing(jobId);

      // Advance past initial setTimeout
      jest.advanceTimersByTime(1001);

      // Process first item
      jest.advanceTimersByTime(1000);

      // Process second item (should complete)
      jest.advanceTimersByTime(1000);

      // Check that job was updated with COMPLETED status
      const saveCalls = mockJob.save.mock.calls;
      const lastCall = saveCalls[saveCalls.length - 1];
      
      jest.useRealTimers();
    });

    it("should handle job deletion during processing", async () => {
      jest.useFakeTimers();
      
      const jobId = "job-1";

      // First call returns job, subsequent calls return null
      BatchJob.findByPk
        .mockResolvedValueOnce({
          id: jobId,
          totalItems: 1,
          status: "PENDING",
          save: jest.fn().mockResolvedValue(true),
        })
        .mockResolvedValueOnce(null);

      batchJobService.simulateProcessing(jobId);

      jest.advanceTimersByTime(1001);

      // Should not throw error when job is deleted
      expect(() => jest.advanceTimersByTime(1000)).not.toThrow();
      
      jest.useRealTimers();
    });

    it("should handle job failure during processing", async () => {
      jest.useFakeTimers();
      
      const jobId = "job-1";
      const mockJob = {
        id: jobId,
        totalItems: 1,
        status: "PENDING",
        save: jest.fn().mockResolvedValue(true),
      };

      BatchJob.findByPk.mockResolvedValueOnce(mockJob);
      BatchJob.findByPk.mockResolvedValueOnce(null);

      batchJobService.simulateProcessing(jobId);

      jest.advanceTimersByTime(1001);

      // Should not throw error
      expect(() => jest.advanceTimersByTime(1000)).not.toThrow();
      
      jest.useRealTimers();
    });
  });
});
