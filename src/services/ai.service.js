const { AppError } = require("../utils/appError.util");
const { logger } = require("../middlewares/activityLog.middleware");
const axios = require("axios");
const { TenantSettings } = require("../models");

/**
 * AI Service for OCR and RAG capabilities.
 * Fetches API keys and config from TenantSettings.
 */
class AiService {
  /**
   * Helper to retrieve AI config for a tenant
   */
  async getAiConfig(tenantId) {
    if (!tenantId) {
      throw new AppError(400, "tenantId is required to fetch AI config");
    }

    const settings = await TenantSettings.findAll({
      where: {
        tenantId,
        key: ['ai_api_key', 'ai_base_url', 'ai_vendor']
      }
    });

    const configMap = settings.reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {});

    // Fallbacks to env vars if not set in DB (optional, but good for backward compat)
    return {
      apiKey: configMap.ai_api_key || process.env.OPENAI_API_KEY,
      baseUrl: configMap.ai_base_url || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      vendor: configMap.ai_vendor || "openai"
    };
  }

  /**
   * Process an uploaded certificate PDF/Image using Vision AI (OCR).
   * Extracts key-value pairs like Certificate Number, Calibration Date, etc.
   * 
   * @param {string} tenantId 
   * @param {Buffer} fileBuffer - The file data
   * @param {string} mimeType - The MIME type (e.g., application/pdf, image/jpeg)
   * @returns {Promise<Object|null>} Extracted metadata or null if AI is disabled/fails
   */
  async processCertificateOcr(tenantId, fileBuffer, mimeType) {
    const config = await this.getAiConfig(tenantId);

    if (!config.apiKey) {
      logger.warn("OCR requested but AI API Key is not configured for tenant. Skipping OCR.");
      return null;
    }

    try {
      const base64Data = fileBuffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64Data}`;

      const response = await axios.post(
        `${config.baseUrl}/chat/completions`,
        {
          model: "gpt-4o", // Vision capable model
          messages: [
            {
              role: "system",
              content: "You are an expert at extracting data from calibration certificates. Return ONLY a JSON object with keys: certificateNumber, calibrationDate, dueDate, vendorName, deviceSerialNumber, status(PASS/FAIL)."
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract the data from this calibration certificate." },
                { type: "image_url", image_url: { url: dataUrl } }
              ]
            }
          ],
          response_format: { type: "json_object" }
        },
        {
          headers: {
            "Authorization": `Bearer ${config.apiKey}`,
            "Content-Type": "application/json"
          }
        }
      );

      const content = response.data.choices[0].message.content;
      return JSON.parse(content);
    } catch (error) {
      logger.error("OCR extraction failed", { error: error.message, details: error.response?.data });
      // Return null instead of throwing to prevent backend interruption
      return null;
    }
  }

  /**
   * Generate vector embeddings for a document chunk.
   * 
   * @param {string} tenantId
   * @param {string} text - The text to embed
   * @returns {Promise<number[]|null>} The vector embedding or null if AI is disabled/fails
   */
  async generateEmbedding(tenantId, text) {
    const config = await this.getAiConfig(tenantId);

    if (!config.apiKey) {
      logger.warn("Embedding requested but AI API Key is not configured for tenant.");
      return null;
    }

    try {
      const response = await axios.post(
        `${config.baseUrl}/embeddings`,
        {
          model: "text-embedding-3-small",
          input: text
        },
        {
          headers: {
            "Authorization": `Bearer ${config.apiKey}`,
            "Content-Type": "application/json"
          }
        }
      );

      return response.data.data[0].embedding;
    } catch (error) {
      logger.error("Embedding generation failed", { error: error.message });
      return null;
    }
  }

  /**
   * RAG Query: Ask a question over a specific tenant's knowledge base.
   * 
   * @param {string} tenantId 
   * @param {string} question 
   * @returns {Promise<string|null>} The answer or null if AI is disabled/fails
   */
  async queryDocuments(tenantId, question) {
    const config = await this.getAiConfig(tenantId);
    
    if (!config.apiKey) {
      logger.warn("RAG query requested but AI API Key is not configured for tenant.");
      return null;
    }

    // 1. Embed the question
    const queryVector = await this.generateEmbedding(tenantId, question);
    if (!queryVector) {
      return null;
    }

    // 2. Perform vector search in Postgres (pgvector)
    // NOTE: This assumes the `Post` or `SopDocument` table has an `embedding` vector column
    // and an IVFFlat or HNSW index. We simulate the DB call here.
    
    // const { db } = require('../config');
    // const results = await db.query(`
    //   SELECT content, 1 - (embedding <=> $1::vector) as similarity
    //   FROM "SopDocuments"
    //   WHERE "tenantId" = $2
    //   ORDER BY embedding <=> $1::vector LIMIT 5
    // `, { bind: [JSON.stringify(queryVector), tenantId] });
    
    // 3. Construct prompt with context and call LLM
    const contextStr = "Simulated document context matching the query...";

    try {
      const response = await axios.post(
        `${config.baseUrl}/chat/completions`,
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant. Use the provided document context to answer the user's question."
            },
            {
              role: "user",
              content: `Context:\n${contextStr}\n\nQuestion: ${question}`
            }
          ]
        },
        {
          headers: {
            "Authorization": `Bearer ${config.apiKey}`,
            "Content-Type": "application/json"
          }
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error("RAG completion failed", { error: error.message });
      return null;
    }
  }
}

module.exports = new AiService();
