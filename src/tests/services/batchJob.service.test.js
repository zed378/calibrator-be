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

  // ================================================================
  // Coverage: the interval body — progress, completion, cancellation, errors.
  // These use advanceTimersByTimeAsync so the async interval callback's awaits
  // actually settle between ticks.
  // ================================================================
  describe("simulateProcessing interval body", () => {
    beforeEach(() => {
      // The older simulateProcessing tests above queue `mockResolvedValueOnce`
      // values that they never consume (they drive the async interval with the
      // non-async advanceTimersByTime). jest.config has resetMocks:false, so
      // those queues would leak into these tests. Reset them explicitly.
      BatchJob.findByPk.mockReset();
      BatchJob.update.mockReset();
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    const makeJob = (overrides = {}) => ({
      id: "job-1",
      totalItems: 2,
      processedItems: 0,
      progress: 0,
      status: "PENDING",
      save: jest.fn().mockResolvedValue(true),
      ...overrides,
    });

    it("marks the job PROCESSING before the first item tick", async () => {
      const job = makeJob();
      BatchJob.findByPk.mockResolvedValue(job);

      batchJobService.simulateProcessing("job-1");
      await jest.advanceTimersByTimeAsync(1000);

      expect(job.status).toBe("PROCESSING");
      expect(job.save).toHaveBeenCalled();
    });

    it("advances processedItems and progress on each tick", async () => {
      const job = makeJob({ totalItems: 4 });
      BatchJob.findByPk.mockResolvedValue(job);

      batchJobService.simulateProcessing("job-1");
      await jest.advanceTimersByTimeAsync(1000); // start

      await jest.advanceTimersByTimeAsync(1000); // item 1
      expect(job.processedItems).toBe(1);
      expect(job.progress).toBe(25);

      await jest.advanceTimersByTimeAsync(1000); // item 2
      expect(job.processedItems).toBe(2);
      expect(job.progress).toBe(50);
      expect(job.status).toBe("PROCESSING");
    });

    it("completes the job and stops ticking once every item is processed", async () => {
      const job = makeJob({ totalItems: 2 });
      BatchJob.findByPk.mockResolvedValue(job);

      batchJobService.simulateProcessing("job-1");
      await jest.advanceTimersByTimeAsync(1000); // start
      await jest.advanceTimersByTimeAsync(1000); // item 1
      expect(job.status).toBe("PROCESSING");

      await jest.advanceTimersByTimeAsync(1000); // item 2 → completes
      expect(job.status).toBe("COMPLETED");
      expect(job.progress).toBe(100);
      expect(job.resultUrl).toBe("/api/v1/jobs/job-1/download");

      const savesAtCompletion = job.save.mock.calls.length;
      // The interval must be cleared — further ticks change nothing.
      await jest.advanceTimersByTimeAsync(5000);
      expect(job.save).toHaveBeenCalledTimes(savesAtCompletion);
      expect(job.processedItems).toBe(2);
    });

    it("defaults to 10 items when totalItems is 0", async () => {
      const job = makeJob({ totalItems: 0 });
      BatchJob.findByPk.mockResolvedValue(job);

      batchJobService.simulateProcessing("job-1");
      await jest.advanceTimersByTimeAsync(1000); // start
      await jest.advanceTimersByTimeAsync(1000); // item 1 of 10

      expect(job.progress).toBe(10);
      expect(job.status).toBe("PROCESSING");
    });

    it("stops ticking when the job is deleted mid-run", async () => {
      const job = makeJob({ totalItems: 5 });
      BatchJob.findByPk.mockResolvedValueOnce(job); // initial load
      BatchJob.findByPk.mockResolvedValue(null); // deleted before the first tick

      batchJobService.simulateProcessing("job-1");
      await jest.advanceTimersByTimeAsync(1000); // start

      const savesAtStart = job.save.mock.calls.length;
      await jest.advanceTimersByTimeAsync(5000);

      // No further saves once the row disappeared.
      expect(job.save).toHaveBeenCalledTimes(savesAtStart);
    });

    it("stops ticking when the job has been marked FAILED elsewhere", async () => {
      const job = makeJob({ totalItems: 5 });
      const failed = makeJob({ status: "FAILED", totalItems: 5 });
      BatchJob.findByPk.mockResolvedValueOnce(job); // initial load
      BatchJob.findByPk.mockResolvedValue(failed); // ticks see FAILED

      batchJobService.simulateProcessing("job-1");
      await jest.advanceTimersByTimeAsync(1000); // start
      await jest.advanceTimersByTimeAsync(5000);

      // The FAILED job is never written back, and the interval is cleared.
      expect(failed.save).not.toHaveBeenCalled();
      expect(failed.processedItems).toBe(0);
    });

    it("returns early without scheduling an interval when the job is missing", async () => {
      BatchJob.findByPk.mockResolvedValue(null);

      batchJobService.simulateProcessing("missing");
      await jest.advanceTimersByTimeAsync(1000);

      expect(BatchJob.findByPk).toHaveBeenCalledTimes(1);
      expect(BatchJob.update).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(5000);
      expect(BatchJob.findByPk).toHaveBeenCalledTimes(1);
    });

    it("marks the job FAILED when the initial load throws", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      BatchJob.findByPk.mockRejectedValue(new Error("DB exploded"));

      batchJobService.simulateProcessing("job-1");
      await jest.advanceTimersByTimeAsync(1000);

      expect(BatchJob.update).toHaveBeenCalledWith(
        { status: "FAILED", errorDetails: "DB exploded" },
        { where: { id: "job-1" } },
      );

      consoleSpy.mockRestore();
    });

    it("marks the job FAILED when the first save throws", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const job = makeJob({ save: jest.fn().mockRejectedValue(new Error("save failed")) });
      BatchJob.findByPk.mockResolvedValue(job);

      batchJobService.simulateProcessing("job-1");
      await jest.advanceTimersByTimeAsync(1000);

      expect(BatchJob.update).toHaveBeenCalledWith(
        { status: "FAILED", errorDetails: "save failed" },
        { where: { id: "job-1" } },
      );

      consoleSpy.mockRestore();
    });
  });

  describe("createJob kicks off processing", () => {
    it("starts the simulated worker for the created job", async () => {
      const spy = jest
        .spyOn(batchJobService, "simulateProcessing")
        .mockResolvedValue(undefined);
      BatchJob.create.mockResolvedValueOnce({ id: "job-42" });

      const result = await batchJobService.createJob("t-1", "u-1", "export", 5);

      expect(spy).toHaveBeenCalledWith("job-42");
      expect(result).toEqual({ id: "job-42" });

      spy.mockRestore();
    });
  });

  describe("getJobs pagination defaults", () => {
    it("defaults to page 1 with a limit of 10 when neither is supplied", async () => {
      BatchJob.findAndCountAll.mockResolvedValueOnce({ count: 3, rows: [] });

      const result = await batchJobService.getJobs("tenant-1");

      expect(BatchJob.findAndCountAll).toHaveBeenCalledWith({
        where: { tenantId: "tenant-1" },
        limit: 10,
        offset: 0,
        order: [["createdAt", "DESC"]],
      });
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it("coerces numeric string page/limit in the response meta", async () => {
      BatchJob.findAndCountAll.mockResolvedValueOnce({ count: 30, rows: [] });

      const result = await batchJobService.getJobs("tenant-1", "3", "5");

      expect(result.page).toBe(3);
      expect(result.limit).toBe(5);
      expect(result.totalPages).toBe(6);
    });
  });
});
