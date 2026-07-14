/**
 * GDPR/CCPA Compliance Controller
 *
 * Handles data subject requests and privacy compliance endpoints.
 */

const { gdprService } = require("../services/gdpr.service");
const { success, error } = require("../utils/response.util");
const { asyncHandler } = require("../utils/controllerWrapper.util");
const { logger } = require("../middlewares/activityLog.middleware");

/**
 * Export all user data (GDPR Article 20 - Data Portability)
 */
exports.exportUserData = asyncHandler(async (req, res) => {
  const { userId, tenantId } = req.user;

  const result = await gdprService.exportUserData(userId, tenantId);

  return success(res, result, "Data export initiated");
});

/**
 * Request data erasure (GDPR Article 17 - Right to Erasure)
 */
exports.requestErasure = asyncHandler(async (req, res) => {
  const { userId, tenantId } = req.user;
  const { reason } = req.body;

  const request = await gdprService.requestErasure(userId, tenantId, reason);

  return success(res, request, 201, "Erasure request submitted");
});

/**
 * Get erasure request status
 */
exports.getErasureStatus = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const { tenantId } = req.user;

  const status = await gdprService.getErasureRequestStatus(tenantId, requestId);

  return success(res, status, "Erasure status retrieved");
});

/**
 * Update consent preferences
 */
exports.updateConsent = asyncHandler(async (req, res) => {
  const { userId, tenantId } = req.user;
  const { categories, consent } = req.body;

  const result = await gdprService.updateConsent(
    userId,
    tenantId,
    categories,
    consent,
  );

  return success(res, result, "Consent preferences updated");
});

/**
 * Get consent history
 */
exports.getConsentHistory = asyncHandler(async (req, res) => {
  const { userId, tenantId } = req.user;

  const history = await gdprService.getConsentHistory(userId, tenantId);

  return success(res, history, "Consent history retrieved");
});

/**
 * Get data processing activities
 */
exports.getProcessingActivities = asyncHandler(async (req, res) => {
  const { userId, tenantId } = req.user;

  const activities = await gdprService.getProcessingActivities(
    userId,
    tenantId,
  );

  return success(res, activities, "Processing activities retrieved");
});

/**
 * Rectify personal data
 */
exports.rectifyData = asyncHandler(async (req, res) => {
  const { userId, tenantId } = req.user;
  const { field, value } = req.body;

  const result = await gdprService.rectifyData(userId, tenantId, field, value);

  return success(res, result, "Data rectified");
});

/**
 * Restrict processing
 */
exports.restrictProcessing = asyncHandler(async (req, res) => {
  const { userId, tenantId } = req.user;
  const { reason } = req.body;

  const result = await gdprService.restrictProcessing(userId, tenantId, reason);

  return success(res, result, "Processing restricted");
});
