const { Tenants, Users, Roles, MenuGroups, RoleMenuPermissions } = require("../models");
const { logger } = require("./activityLog.middleware");

/**
 * Audit Logging Middleware
 * Logs role and permission changes for compliance and debugging.
 *
 * Usage:
 *   router.post("/roles", auditAction("role_create", "Role"), createRole);
 *   router.delete("/roles/:id", auditAction("role_delete", "Role"), deleteRole);
 */

const auditAction = (action, resource) => {
  return async (req, res, next) => {
    const start = Date.now();
    const userId = req.user?.id || "anonymous";
    const tenantId = req.user?.tenantId || null;

    // Log the action before it happens
    logger.info(`AUDIT: ${action}`, {
      userId,
      tenantId,
      resource,
      action,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      body: req.body,
      params: req.params,
    });

    // Intercept res.json to log the result after the response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const duration = Date.now() - start;
      logger.info(`AUDIT: ${action} complete`, {
        userId,
        tenantId,
        resource,
        action,
        statusCode: res.statusCode,
        durationMs: duration,
        success: res.statusCode < 400,
        response: body,
      });
      return originalJson(body);
    };

    next();
  };
};

/**
 * Audit middleware that wraps any existing middleware
 * Logs the action before and after the wrapped handler
 */
const withAudit = (action, resource) => (handler) => {
  return async (req, res, next) => {
    const start = Date.now();
    const userId = req.user?.id || "anonymous";
    const tenantId = req.user?.tenantId || null;

    logger.info(`AUDIT START: ${action}`, {
      userId,
      tenantId,
      resource,
      action,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    try {
      await handler(req, res, next);

      const duration = Date.now() - start;
      logger.info(`AUDIT COMPLETE: ${action}`, {
        userId,
        tenantId,
        resource,
        action,
        statusCode: res.statusCode,
        durationMs: duration,
        success: res.statusCode < 400,
      });
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(`AUDIT ERROR: ${action}`, {
        userId,
        tenantId,
        resource,
        action,
        error: error.message,
        durationMs: duration,
      });
      throw error;
    }
  };
};

module.exports = { auditAction, withAudit };
