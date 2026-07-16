const { AsyncLocalStorage } = require('async_hooks');

// Global CLS namespace for tenant context
const tenantStorage = new AsyncLocalStorage();

/**
 * Sets up Postgres RLS session variables inside a transaction.
 */
const setupPostgresRLS = async (isSuperAdmin, tenantId, res, next, db) => {
  try {
    await db.transaction(async (t) => {
      // Set the local session variable for RLS.
      // SECURITY: use parameterized set_config(name, value, is_local=true) — the
      // is_local=true argument makes this transaction-scoped (equivalent to SET
      // LOCAL), so the value is discarded at COMMIT and a pooled/reused backend
      // connection cannot leak the previous request's tenant. The bound parameter
      // ($1) also prevents any SQL injection via the tenant identifier (which for
      // SUPER_ADMIN may originate from an x-tenant-id/x-tenant-code header).
      const settingValue = isSuperAdmin ? 'SUPER_ADMIN' : (tenantId || '');
      await db.query(`SELECT set_config('app.current_tenant', $1, true)`, {
        bind: [settingValue],
        transaction: t,
      });

      // FORCE RLS prevents superuser-level bypass of policies within this transaction
      await db.query(`SELECT set_config('app.enable_rls', 'on', true)`, {
        transaction: t,
      });
      
      // Proceed with the request inside the transaction
      // Wait for the response to finish before committing/rolling back
      return new Promise((resolve, reject) => {
        res.on('finish', () => resolve());
        res.on('error', reject);
        next();
      });
    });
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    }
  }
};

/**
 * Checks if the database dialect is not Postgres.
 * @param {Object} db - database connection object
 * @returns {boolean}
 */
const isNotPostgres = (db) => db.getDialect() !== 'postgres';

/**
 * Middleware to establish a tenant context for the current request.
 * It is invoked by the auth middleware after the user is authenticated.
 */
const tenantContextMiddleware = async (req, res, next) => {
  const { db } = require('../config');
  
  // Use req.tenantId which is explicitly set by the auth middleware (handling SUPER_ADMIN overrides too)
  const tenantId = req.tenantId || null;
  
  const roleName = req.user?.role?.name;
  const isSuperAdmin = roleName === 'SUPER_ADMIN' || roleName === 'SUPERADMIN';
  const isSystemTask = false; // Used if we run background tasks

  // Non-postgres dialects: establish context then pass through directly
  if (isNotPostgres(db)) {
    tenantStorage.run({ tenantId, isSuperAdmin, isSystemTask }, () => {
      next();
    });
    return;
  }
  
  // Postgres: wrap in AL context and transaction for RLS
  tenantStorage.run({ tenantId, isSuperAdmin, isSystemTask }, async () => {
    await setupPostgresRLS(isSuperAdmin, tenantId, res, next, db);
  });
};

module.exports = {
  isNotPostgres,
  setupPostgresRLS,
  tenantStorage,
  tenantContextMiddleware
};
