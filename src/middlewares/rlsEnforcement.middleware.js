const { db } = require("../config");
const { tenantStorage } = require("./tenantContext.middleware");
const { logger } = require("./activityLog.middleware");
const { models } = require("../models");

/**
 * @deprecated DO NOT WIRE THIS INTO THE REQUEST PIPELINE.
 *
 * This middleware sets `app.current_tenant` with a SESSION-level `SET` (not
 * `SET LOCAL`). Under a transaction-mode connection pooler (PgBouncer / RDS
 * Proxy) the value persists on the recycled backend and the NEXT request on that
 * connection inherits the previous tenant's context — a cross-tenant data leak.
 *
 * The correct, transaction-scoped implementation lives in
 * `tenantContext.middleware.js` (`setupPostgresRLS`), which uses parameterized
 * `set_config('app.current_tenant', $1, true)` bound to the request transaction.
 * That is the middleware wired via `auth`. Only `initializePostgresRLS` (below)
 * is imported in production; this function is retained solely for its unit tests
 * and must not be added to the app middleware chain.
 */
const rlsEnforcementMiddleware = async (req, res, next) => {
  if (db.getDialect() !== "postgres") {
    return next();
  }

  const context = tenantStorage.getStore();
  if (!context) {
    return next();
  }

  try {
    // Use a transaction to set session-level variables that persist
    // for the duration of the request handling
    await db.transaction(async (t) => {
      const settingValue = context.isSuperAdmin
        ? "SUPER_ADMIN"
        : context.tenantId || "";

      // Use SET (session-level) instead of SET LOCAL (transaction-level)
      // This ensures RLS settings persist beyond transaction commit
      // The transaction is needed because SET commands must be inside a transaction
      // when autocommit is off, but the session-level setting outlives it
      // Escape single quotes to prevent SQL injection
      const escapedValue = settingValue.replace(/'/g, "''");

      await db.query(`SET app.current_tenant = '${escapedValue}'`, {
        transaction: t,
      });

      await db.query(`SET app.enable_rls = 'on'`, { transaction: t });

      // Don't wrap in Promise - just call next() and let the transaction commit
      // The session-level settings will persist for subsequent queries in this request
      next();
    });
  } catch (err) {
    logger.error("RLS enforcement failed", {
      error: err.message,
      tenantId: context.tenantId,
    });
    if (!res.headersSent) {
      next(err);
    }
  }
};

/**
 * Initialize native Postgres Row-Level Security on all tenant-scoped tables.
 *
 * Call once after db.sync() during startup.
 */
const initializePostgresRLS = async () => {
  if (db.getDialect() !== "postgres") {
    logger.info("RLS initialization skipped: not using Postgres");
    return;
  }

  for (const modelName in models) {
    const model = models[modelName];
    let tenantKey = null;
    if (model.rawAttributes.tenantId) {
      tenantKey = model.rawAttributes.tenantId.field || "tenantId";
    } else if (model.rawAttributes.tenant_id) {
      tenantKey = model.rawAttributes.tenant_id.field || "tenant_id";
    }

    if (!tenantKey) {
      continue;
    }

    const tableName = model.tableName;

    try {
      await db.query(`ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`);
      await db.query(`ALTER TABLE "${tableName}" FORCE ROW LEVEL SECURITY;`);

      await db.query(
        `DROP POLICY IF EXISTS tenant_isolation_policy ON "${tableName}";`,
      );

      await db.query(
        `
        CREATE POLICY tenant_isolation_policy ON "${tableName}"
        USING (
          current_setting('app.current_tenant', true) = '' OR
          current_setting('app.current_tenant', true) = 'SUPER_ADMIN' OR
          "${tenantKey}"::text = current_setting('app.current_tenant', true)
        );
      `,
      );

      logger.info(`RLS policy applied to ${tableName}`);
    } catch (err) {
      logger.warn(`RLS setup skipped for ${tableName}: ${err.message}`);
    }
  }

  logger.info("Postgres RLS initialization completed");
};

module.exports = {
  rlsEnforcementMiddleware,
  initializePostgresRLS,
};
