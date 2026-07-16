/**
 * Tests for ai.service.js
 *
 * Covers: getAiConfig, processCertificateOcr, generateEmbedding, queryDocuments
 */

jest.mock("../../config", () => ({
  Sequelize: { useCLS: jest.fn() },
}));

jest.mock("../../models", () => ({
  TenantSettings: {
    findAll: jest.fn(),
  },
}));

/**
 * Mock AppError to ensure constructor is available
 */
jest.mock("../../utils/appError.util", () => {
  class AppError extends Error {
    constructor(status, message) {
      super(message);
      this.name = "AppError";
      this.status = status;
    }
  }
  return { AppError };
});

jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("axios", () => ({
  post: jest.fn(),
}));

const axios = require("axios");
const { TenantSettings } = require("../../models");
const aiService = require("../../services/ai.service");

describe("ai.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
  });

  // ================================================================
  describe("getAiConfig", () => {
    it("should throw when tenantId is missing", async () => {
      await expect(aiService.getAiConfig(null)).rejects.toThrow(
        "tenantId is required to fetch AI config",
      );
    });

    it("should fetch tenant AI settings and build config", async () => {
      TenantSettings.findAll.mockResolvedValueOnce([
        { key: "ai_api_key", value: "sk-test-key" },
        { key: "ai_base_url", value: "https://custom.ai.com" },
        { key: "ai_vendor", value: "anthropic" },
      ]);

      const result = await aiService.getAiConfig("tenant-1");

      expect(result.apiKey).toBe("sk-test-key");
      expect(result.baseUrl).toBe("https://custom.ai.com");
      expect(result.vendor).toBe("anthropic");
      expect(TenantSettings.findAll).toHaveBeenCalledWith({
        where: {
          tenantId: "tenant-1",
          key: ["ai_api_key", "ai_base_url", "ai_vendor"],
        },
      });
    });

    it("should fallback to env vars when no tenant settings", async () => {
      TenantSettings.findAll.mockResolvedValueOnce([]);
      process.env.OPENAI_API_KEY = "env-key";
      process.env.OPENAI_BASE_URL = "https://env-url.com";

      const result = await aiService.getAiConfig("tenant-1");

      expect(result.apiKey).toBe("env-key");
      expect(result.baseUrl).toBe("https://env-url.com");
      expect(result.vendor).toBe("openai");
    });
  });

  // ================================================================
  describe("processCertificateOcr", () => {
    it("should return null when API key is not configured", async () => {
      TenantSettings.findAll.mockResolvedValueOnce([]);

      const result = await aiService.processCertificateOcr(
        "tenant-1",
        Buffer.from("file"),
        "image/png",
      );

      expect(result).toBeNull();
    });

    it("should call the vision API and return parsed JSON", async () => {
      TenantSettings.findAll.mockResolvedValueOnce([
        { key: "ai_api_key", value: "sk-key" },
        { key: "ai_base_url", value: "https://api.openai.com/v1" },
        { key: "ai_vendor", value: "openai" },
      ]);
      axios.post.mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: '{"certificateNumber":"C-001","status":"PASS"}',
              },
            },
          ],
        },
      });

      const result = await aiService.processCertificateOcr(
        "tenant-1",
        Buffer.from("test-image"),
        "image/png",
      );

      expect(result).toEqual({ certificateNumber: "C-001", status: "PASS" });
      expect(axios.post).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.objectContaining({
          model: "gpt-4o",
          response_format: { type: "json_object" },
        }),
        expect.any(Object),
      );
    });

    it("should return null on API failure without throwing", async () => {
      TenantSettings.findAll.mockResolvedValueOnce([
        { key: "ai_api_key", value: "sk-key" },
        { key: "ai_base_url", value: "https://api.openai.com/v1" },
        { key: "ai_vendor", value: "openai" },
      ]);
      axios.post.mockRejectedValueOnce(new Error("API timeout"));

      const result = await aiService.processCertificateOcr(
        "tenant-1",
        Buffer.from("test"),
        "image/jpeg",
      );

      expect(result).toBeNull();
    });
  });

  // ================================================================
  describe("generateEmbedding", () => {
    it("should return null when API key is missing", async () => {
      TenantSettings.findAll.mockResolvedValueOnce([]);

      const result = await aiService.generateEmbedding("tenant-1", "some text");

      expect(result).toBeNull();
    });

    it("should call the embeddings API and return vector", async () => {
      TenantSettings.findAll.mockResolvedValueOnce([
        { key: "ai_api_key", value: "sk-key" },
        { key: "ai_base_url", value: "https://api.openai.com/v1" },
        { key: "ai_vendor", value: "openai" },
      ]);
      axios.post.mockResolvedValueOnce({
        data: { data: [{ embedding: [0.1, 0.2, 0.3] }] },
      });

      const result = await aiService.generateEmbedding(
        "tenant-1",
        "hello world",
      );

      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it("should return null on error", async () => {
      TenantSettings.findAll.mockResolvedValueOnce([
        { key: "ai_api_key", value: "sk-key" },
        { key: "ai_base_url", value: "https://api.openai.com/v1" },
        { key: "ai_vendor", value: "openai" },
      ]);
      axios.post.mockRejectedValueOnce(new Error("rate limited"));

      const result = await aiService.generateEmbedding("tenant-1", "text");

      expect(result).toBeNull();
    });
  });

  // ================================================================
  describe("queryDocuments", () => {
    it("should return null when API key is missing", async () => {
      TenantSettings.findAll.mockResolvedValueOnce([]);

      const result = await aiService.queryDocuments(
        "tenant-1",
        "what is calibration?",
      );

      expect(result).toBeNull();
    });

    it("should embed the question and call LLM with context", async () => {
      TenantSettings.findAll
        .mockResolvedValueOnce([
          { key: "ai_api_key", value: "sk-key" },
          { key: "ai_base_url", value: "https://api.openai.com/v1" },
          { key: "ai_vendor", value: "openai" },
        ])
        .mockResolvedValueOnce([
          { key: "ai_api_key", value: "sk-key" },
          { key: "ai_base_url", value: "https://api.openai.com/v1" },
          { key: "ai_vendor", value: "openai" },
        ]);
      // generateEmbedding calls axios.post first, then queryDocuments calls it again
      axios.post
        .mockResolvedValueOnce({
          data: { data: [{ embedding: [0.1, 0.2] }] },
        })
        .mockResolvedValueOnce({
          data: {
            choices: [
              { message: { content: "Calibration is the process..." } },
            ],
          },
        });

      const result = await aiService.queryDocuments(
        "tenant-1",
        "what is calibration?",
      );

      expect(result).toBe("Calibration is the process...");
      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it("should return null when embedding fails", async () => {
      TenantSettings.findAll
        .mockResolvedValueOnce([
          { key: "ai_api_key", value: "sk-key" },
          { key: "ai_base_url", value: "https://api.openai.com/v1" },
          { key: "ai_vendor", value: "openai" },
        ])
        .mockResolvedValueOnce([
          { key: "ai_api_key", value: "sk-key" },
          { key: "ai_base_url", value: "https://api.openai.com/v1" },
          { key: "ai_vendor", value: "openai" },
        ]);
      axios.post.mockRejectedValueOnce(new Error("embedding failed"));

      const result = await aiService.queryDocuments("tenant-1", "question");

      expect(result).toBeNull();
    });
  });
});
