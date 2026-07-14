jest.mock("amqplib", () => {
  return {
    connect: jest.fn(),
  };
});

jest.mock("../../services/email.service", () => ({
  sendOtpEmail: jest.fn(),
  sendActivationEmail: jest.fn(),
}));

jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("emailQueue.service", () => {
  let mockChannel;
  let mockConnection;
  let amqplib;
  let emailQueueService;
  let sendOtpEmail;
  let sendActivationEmail;
  let logger;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();

    amqplib = require("amqplib");
    const emailService = require("../../services/email.service");
    sendOtpEmail = emailService.sendOtpEmail;
    sendActivationEmail = emailService.sendActivationEmail;
    logger = require("../../middlewares/activityLog.middleware").logger;

    emailQueueService = require("../../services/emailQueue.service");

    const eventHandlers = {};

    mockChannel = {
      assertQueue: jest.fn().mockResolvedValue(true),
      sendToQueue: jest.fn().mockReturnValue(true),
      prefetch: jest.fn(),
      consume: jest.fn(),
      ack: jest.fn(),
      nack: jest.fn(),
      checkQueue: jest.fn().mockResolvedValue({ messageCount: 5 }),
      purgeQueue: jest.fn().mockResolvedValue(true),
      close: jest.fn().mockResolvedValue(true),
      isOpen: true,
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      on: jest.fn((event, handler) => {
        eventHandlers[event] = handler;
      }),
      close: jest.fn().mockImplementation(async () => {
        if (eventHandlers["close"]) {eventHandlers["close"]();}
      }),
      isOpen: true,
      _triggerError: (err) => {
        if (eventHandlers["error"]) {eventHandlers["error"](err);}
      },
    };

    amqplib.connect.mockResolvedValue(mockConnection);
  });

  afterEach(async () => {
    jest.useRealTimers();
    try { await emailQueueService.closeRabbitMQ(); } catch (e) {}
  });

  describe("Queue initialization & RabbitMQ Connection", () => {
    it("should process email queue and initialize", async () => {
      await emailQueueService.processEmailQueue();

      expect(amqplib.connect).toHaveBeenCalled();
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.assertQueue).toHaveBeenCalledWith("email_dlq", expect.any(Object));
      expect(mockChannel.assertQueue).toHaveBeenCalledWith("email_queue", expect.any(Object));
      expect(mockChannel.prefetch).toHaveBeenCalled();
      expect(mockChannel.consume).toHaveBeenCalledWith("email_queue", expect.any(Function));
    });

    it("should handle initialization failure", async () => {
      amqplib.connect.mockRejectedValueOnce(new Error("Connection error"));

      await emailQueueService.processEmailQueue();

      expect(logger.error).toHaveBeenCalledWith("RabbitMQ connection failed", expect.any(Object));
      expect(logger.warn).toHaveBeenCalledWith(
        "Failed to initialize RabbitMQ, email queue worker not started",
        expect.any(Object),
      );
    });

    it("should reuse open connection and channel", async () => {
      await emailQueueService.processEmailQueue(); // First call creates connection & channel
      await emailQueueService.queueActivationEmail({ email: "test@mail.com" }); // Second call reuses

      expect(amqplib.connect).toHaveBeenCalledTimes(1);
      expect(mockConnection.createChannel).toHaveBeenCalledTimes(1);
    });

    it("should handle connection close event", async () => {
      await emailQueueService.processEmailQueue();

      mockConnection.close(); // Triggers close event handlers via our mock

      expect(logger.warn).toHaveBeenCalledWith("RabbitMQ connection closed");

      amqplib.connect.mockResolvedValueOnce({
        ...mockConnection,
        createChannel: jest.fn().mockResolvedValue(mockChannel),
      });
      await emailQueueService.queueActivationEmail({ email: "test@mail.com" });
      expect(amqplib.connect).toHaveBeenCalledTimes(2);
    });

    it("should handle connection error event", async () => {
      await emailQueueService.processEmailQueue();

      mockConnection._triggerError(new Error("Some error"));

      expect(logger.error).toHaveBeenCalledWith("RabbitMQ connection error", expect.any(Object));
    });
  });

  describe("queue emails", () => {
    it("should add activation email to queue", async () => {
      await emailQueueService.queueActivationEmail({
        email: "test@mail.com",
        firstName: "Test",
        lastName: "User",
        activationLink: "link",
      });

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith("email_queue", expect.any(Buffer), expect.any(Object));
    });

    it("should add otp email to queue", async () => {
      await emailQueueService.queueOtpEmail({
        email: "test@mail.com",
        firstName: "Test",
        lastName: "User",
        otp: "123456",
      });

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith("email_queue", expect.any(Buffer), expect.any(Object));
    });

    it("should fallback to direct sending if queue fails", async () => {
      amqplib.connect.mockRejectedValueOnce(new Error("Queue offline"));
      sendActivationEmail.mockResolvedValueOnce(true);

      const result = await emailQueueService.queueActivationEmail({
        email: "test@mail.com",
      });

      expect(result).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith("RabbitMQ unavailable, sending email synchronously");
      expect(sendActivationEmail).toHaveBeenCalled();
    });

    it("should fallback to direct sending and handle direct sending error", async () => {
      amqplib.connect.mockRejectedValueOnce(new Error("Queue offline"));
      sendActivationEmail.mockRejectedValueOnce(new Error("Direct send failed"));

      const result = await emailQueueService.queueActivationEmail({
        email: "test@mail.com",
      });

      expect(result).toBe(true);
      expect(logger.error).toHaveBeenCalledWith("Failed to send email", expect.any(Object));
    });
  });

  describe("process email queue consumer", () => {
    let processJob;

    beforeEach(async () => {
      await emailQueueService.processEmailQueue();
      processJob = mockChannel.consume.mock.calls[0][1];
    });

    it("should handle empty message", async () => {
      await processJob(null);
      expect(mockChannel.ack).not.toHaveBeenCalled();
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it("should drop invalid JSON message", async () => {
      const msg = { content: Buffer.from("invalid json") };
      await processJob(msg);

      expect(logger.error).toHaveBeenCalledWith("Invalid email job data");
      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
    });

    it("should process activation email successfully", async () => {
      sendActivationEmail.mockResolvedValueOnce(true);
      const job = { type: "activation", data: { email: "a@b.com" } };
      const msg = { content: Buffer.from(JSON.stringify(job)) };

      await processJob(msg);

      expect(sendActivationEmail).toHaveBeenCalledWith(job.data);
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it("should process otp email successfully", async () => {
      sendOtpEmail.mockResolvedValueOnce(true);
      const job = { type: "otp", data: { email: "a@b.com" } };
      const msg = { content: Buffer.from(JSON.stringify(job)) };

      await processJob(msg);

      expect(sendOtpEmail).toHaveBeenCalledWith(job.data);
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it("should handle unknown job type", async () => {
      const job = { type: "unknown", data: { email: "a@b.com" } };
      const msg = { content: Buffer.from(JSON.stringify(job)) };

      await processJob(msg);

      expect(logger.warn).toHaveBeenCalledWith("Unknown email job type", { type: "unknown" });
      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
    });

    it("should handle email sending failure and retry", async () => {
      sendActivationEmail.mockRejectedValueOnce(new Error("Send failed"));
      const job = { id: "1", type: "activation", data: { email: "a@b.com" }, retries: 0, maxRetries: 3 };
      const msg = { content: Buffer.from(JSON.stringify(job)) };

      await processJob(msg);

      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
      expect(mockChannel.sendToQueue).not.toHaveBeenCalled();

      jest.runAllTimers();

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith("email_queue", expect.any(Buffer), expect.any(Object));

      const retryJobBuf = mockChannel.sendToQueue.mock.calls[0][1];
      const retryJob = JSON.parse(retryJobBuf.toString());
      expect(retryJob.retries).toBe(1);
    });

    it("should not retry if max retries reached", async () => {
      sendActivationEmail.mockRejectedValueOnce(new Error("Send failed"));
      const job = { id: "1", type: "activation", data: { email: "a@b.com" }, retries: 3, maxRetries: 3 };
      const msg = { content: Buffer.from(JSON.stringify(job)) };

      await processJob(msg);

      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
      jest.runAllTimers();

      expect(mockChannel.sendToQueue).not.toHaveBeenCalled();
    });

    it("should handle successful send returning false", async () => {
      sendActivationEmail.mockResolvedValueOnce(false);
      const job = { type: "activation", data: { email: "a@b.com" }, retries: 0, maxRetries: 3 };
      const msg = { content: Buffer.from(JSON.stringify(job)) };

      await processJob(msg);

      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
    });
  });

  describe("getQueueStats", () => {
    it("should return queue stats", async () => {
      const stats = await emailQueueService.getQueueStats();
      expect(stats.emailQueueMessages).toBe(5);
      expect(stats.dlqMessages).toBe(5);
      expect(stats.status).toBe("connected");
    });

    it("should return error stats if check fails", async () => {
      amqplib.connect.mockRejectedValueOnce(new Error("DB Error"));
      const stats = await emailQueueService.getQueueStats();
      expect(stats.status).toBe("error");
      expect(stats.emailQueueMessages).toBe(0);
    });
  });

  describe("clearQueue", () => {
    it("should purge queue", async () => {
      await emailQueueService.processEmailQueue();
      const result = await emailQueueService.clearQueue();
      expect(mockChannel.purgeQueue).toHaveBeenCalledWith("email_queue");
      expect(result).toBe(true);
    });

    it("should handle clearQueue error", async () => {
      amqplib.connect.mockRejectedValueOnce(new Error("DB Error"));
      const result = await emailQueueService.clearQueue();
      expect(result).toBe(false);
    });
  });

  describe("closeRabbitMQ", () => {
    it("should handle close error gracefully", async () => {
      await emailQueueService.processEmailQueue();
      mockConnection.close.mockRejectedValueOnce(new Error("Close error"));

      await emailQueueService.closeRabbitMQ();

      expect(logger.error).toHaveBeenCalledWith("Error closing RabbitMQ connection", expect.any(Object));
    });
  });
});
