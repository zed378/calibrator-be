const { AsyncLocalStorage } = require('async_hooks');

// Global CLS namespace for tenant context
const tenantStorage = new AsyncLocalStorage();

/**
 * Middleware to establish a tenant context for the current request.
 * It is invoked by the auth middleware after the user is authenticated.
 */
const tenantContextMiddleware = async (req, res, next) => {
  // Use req.tenantId which is explicitly set by the auth middleware (handling SUPER_ADMIN overrides too)
  const tenantId = req.tenantId || null;
  
  const roleName = req.user?.role?.name;
  const isSuperAdmin = roleName === 'SUPER_ADMIN' || roleName === 'SUPERADMIN';
  const isSystemTask = false; // Used if we run background tasks

  tenantStorage.run({ tenantId, isSuperAdmin, isSystemTask }, async () => {
    // If we have a tenant context, and we are using Postgres, wrap the request in a transaction
    // to enforce Postgres Row-Level Security via session variables
    const { db } = require('../config');
    if (db.getDialect() === 'postgres') {
      try {
        await db.transaction(async (t) => {
          // Set the local session variable for RLS
          const settingValue = isSuperAdmin ? 'SUPER_ADMIN' : (tenantId || '');
          await db.query(`SET LOCAL app.current_tenant = '${settingValue}';`, { transaction: t });
          
          // FORCE RLS prevents superuser-level bypass of policies within this transaction
          await db.query(`SET LOCAL app.enable_rls = 'on';`, { transaction: t });
          
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
    } else {
      next();
    }
  });
};

module.exports = {
  tenantStorage,
  tenantContextMiddleware
};
