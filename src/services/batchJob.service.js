const { BatchJob } = require("../models");
const { AppError } = require("../utils/appError.util");

// In a real application, you would import a queue publisher (like RabbitMQ channel)
// const { publishToQueue } = require("./rabbitmq.service");

exports.createJob = async (tenantId, userId, type, totalItems = 0) => {
  const job = await BatchJob.create({
    tenantId,
    userId,
    type,
    status: "PENDING",
    progress: 0,
    totalItems,
  });

  // Example: Publish to a message queue for processing
  // publishToQueue("batch-jobs", { jobId: job.id, tenantId, type });

  // For demonstration, we'll kick off processing asynchronously here
  this.simulateProcessing(job.id);

  return job;
};

exports.getJobs = async (tenantId, page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  const { count, rows } = await BatchJob.findAndCountAll({
    where: { tenantId },
    limit,
    offset,
    order: [["createdAt", "DESC"]],
  });

  return {
    total: count,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(count / limit),
    jobs: rows,
  };
};

exports.getJobStatus = async (tenantId, jobId) => {
  const job = await BatchJob.findOne({
    where: { id: jobId, tenantId },
  });

  if (!job) {
    throw new AppError(404, "Job not found");
  }

  return job;
};

// Simple background worker simulation
exports.simulateProcessing = async (jobId) => {
  setTimeout(async () => {
    try {
      const job = await BatchJob.findByPk(jobId);
      if (!job) return;

      job.status = "PROCESSING";
      await job.save();

      // Simulate some work steps
      let processed = 0;
      const total = job.totalItems > 0 ? job.totalItems : 10;
      
      const interval = setInterval(async () => {
        processed += 1;
        
        // Reload job in case it was modified
        const currentJob = await BatchJob.findByPk(jobId);
        if (!currentJob || currentJob.status === "FAILED") {
          clearInterval(interval);
          return;
        }

        currentJob.processedItems = processed;
        currentJob.progress = Math.floor((processed / total) * 100);
        
        if (processed >= total) {
          currentJob.status = "COMPLETED";
          currentJob.resultUrl = "/api/v1/jobs/" + jobId + "/download"; // mock url
          clearInterval(interval);
        }
        
        await currentJob.save();
      }, 1000); // 1 second per item

    } catch (err) {
      console.error("Job Simulation Error:", err);
      BatchJob.update({ status: "FAILED", errorDetails: err.message }, { where: { id: jobId } });
    }
  }, 1000);
};
