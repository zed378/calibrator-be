/**
 * Database Models Index — Dynamic Loading Entry Point
 *
 * Architecture:
 * - All models reside in src/models/ as individual files
 * - Each model exports a function that accepts the Sequelize instance and DataTypes
 * - Dynamic directory loading via fs.readdirSync discovers and initializes models
 * - Association methods on each model are called after all models are loaded
 * - Single aggregated db object is exported for dependency injection
 *
 * This pattern enforces:
 * - One model per file (1:1 ratio)
 * - No hard-coded model imports
 * - Centralized model access
 * - Automatic association resolution
 *
 * Models:
 * - Tenant: Organization/entity with plan and settings
 * - User: Individual user accounts within tenants
 * - Role: RBAC roles with CRUD permissions (read/write) on menu groups
 * - MenuGroup: Navigation menu groups that roles can access
 * - RoleMenuPermission: Maps read/write permissions on menu groups to roles
 * - Session: Persistent authentication session records
 * - Warehouse: Physical warehouse locations for a tenant
 * - StorageLocation: Specific storage locations within a warehouse
 * - Stock: Inventory levels per SKU per warehouse location
 * - StockTransfer: Inter-warehouse stock transfers
 * - StockAdjustment: Manual stock adjustments (add/remove)
 * - StockOpname: Periodic inventory counting records
 * - CalibrationDevice: Devices with calibration schedule tracking
 * - CalibrationRecord: Calibration history for devices
 * - TenantBackup: Backup operation records for tenants
 * - TenantSettings: Key-value tenant configuration settings
 * - Certificate: Calibration certificates with digital signatures
 * - Vendor: Third-party calibration labs and parts suppliers
 * - MaintenanceWorkOrder: Maintenance and repair tracking for calibration devices
 * - Notification: System and user-specific alerts and messages
 * - Subscription: Tenant subscription plans and billing cycles
 * - Invoice: Billing invoices linked to subscriptions
 * - AuditLog: Immutable audit trail for FDA 21 CFR Part 11 / ISO 17025 compliance
 * - Workflow: Custom dynamic approval workflows
 * - WorkflowStep: Sequential steps in a custom workflow
 * - WorkflowInstance: Active instances of custom workflows
 * - WorkflowAction: User actions (approvals/rejections) on workflow instances
 * - Risk: Risk assessment and mitigation records
 * - SupplierScorecard: Supplier performance tracking records
 */

const fs = require("fs");
const path = require("path");
const { Sequelize, DataTypes, Op } = require("sequelize");

// Use the shared Sequelize instance from config.
// This ensures all queries use the configured pool, SSL, timezone,
// retry logic, and logging settings instead of Sequelize defaults.
const { db } = require("../config");
const { tenantStorage } = require("../middlewares/tenantContext.middleware");

const models = {};

// Dynamic Loading: Read directory, execute exports, store in models object
const modelFiles = fs
  .readdirSync(__dirname)
  .filter((file) => {
    return (
      file.indexOf(".") !== 0 && file !== "index.js" && file.slice(-3) === ".js"
    );
  })
  .map((file) => require(path.join(__dirname, file)));

modelFiles.forEach((defineModel) => {
  const model = defineModel(db, DataTypes);
  models[model.name] = model;
});

// Association Mapping: Iterate models, execute associate method if exists
Object.keys(models).forEach((modelName) => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// Global Export: Export collective models object for dependency injection
db.sequelize = db;
db.Sequelize = Sequelize;
db.Op = Op;

// ============================================================================
// APPLICATION-LEVEL RLS (ROW-LEVEL SECURITY) / TENANT ISOLATION HOOKS
// ============================================================================
// These hooks intercept every query and automatically inject the tenant ID
// from the AsyncLocalStorage context (set by auth middleware).
// This acts as a defense-in-depth layer across the entire ORM.

function enforceTenantWhere(options, model) {
  const context = tenantStorage.getStore();
  if (!context || context.isSuperAdmin || !context.tenantId) return;

  const tenantKey = model.rawAttributes.tenantId ? 'tenantId' : (model.rawAttributes.tenant_id ? 'tenant_id' : null);
  if (tenantKey) {
    if (!options.where) options.where = {};
    // Prevent overriding if already explicitly queried differently?
    // No, we FORCE the isolation. If they query for a different tenant, it will yield nothing.
    options.where = { ...options.where, [tenantKey]: context.tenantId };
  }
}

function enforceTenantAssignment(instance, model) {
  const context = tenantStorage.getStore();
  if (!context || context.isSuperAdmin || !context.tenantId) return;

  const tenantKey = model.rawAttributes.tenantId ? 'tenantId' : (model.rawAttributes.tenant_id ? 'tenant_id' : null);
  if (tenantKey) {
    instance[tenantKey] = context.tenantId;
  }
}

db.addHook('beforeFind', function(options) {
  enforceTenantWhere(options, this);
});
db.addHook('beforeCount', function(options) {
  enforceTenantWhere(options, this);
});
db.addHook('beforeUpdate', function(instance, options) {
  enforceTenantAssignment(instance, this);
});
db.addHook('beforeCreate', function(instance, options) {
  enforceTenantAssignment(instance, this);
});
db.addHook('beforeDestroy', function(instance, options) {
  const context = tenantStorage.getStore();
  if (!context || context.isSuperAdmin || !context.tenantId) return;
  const tenantKey = this.rawAttributes.tenantId ? 'tenantId' : (this.rawAttributes.tenant_id ? 'tenant_id' : null);
  if (tenantKey && instance[tenantKey] && String(instance[tenantKey]) !== String(context.tenantId)) {
    throw new Error('Security Violation: Attempted to destroy cross-tenant record');
  }
});
db.addHook('beforeBulkUpdate', function(options) {
  enforceTenantWhere(options, this);
});
db.addHook('beforeBulkDestroy', function(options) {
  enforceTenantWhere(options, this);
});

/**
 * Initializes native Postgres Row-Level Security (RLS) on all models with a tenantId.
 * This should be called after db.sync() in index.js.
 */
db.setupPostgresRLS = async function() {
  const dialect = db.getDialect();
  if (dialect !== 'postgres') {
    console.warn(`RLS not supported on dialect: ${dialect}`);
    return;
  }
  
  for (const modelName in models) {
    const model = models[modelName];
    let tenantKey = null;
    if (model.rawAttributes.tenantId) {
      tenantKey = model.rawAttributes.tenantId.field || 'tenantId';
    } else if (model.rawAttributes.tenant_id) {
      tenantKey = model.rawAttributes.tenant_id.field || 'tenant_id';
    }
    
    if (tenantKey) {
      const tableName = model.tableName;
      try {
        await db.query(`ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`);
        // Drop existing policy if it exists to recreate it
        await db.query(`DROP POLICY IF EXISTS tenant_isolation_policy ON "${tableName}";`);
        // Create policy to isolate rows by tenant_id, bypassing for SUPER_ADMIN or when no tenant is set
        await db.query(`
          CREATE POLICY tenant_isolation_policy ON "${tableName}"
          USING (
            current_setting('app.current_tenant', true) = '' OR 
            current_setting('app.current_tenant', true) = 'SUPER_ADMIN' OR
            "${tenantKey}"::text = current_setting('app.current_tenant', true)
          );
        `);
      } catch (err) {
        console.error(`Failed to setup RLS for table ${tableName}:`, err.message);
      }
    }
  }
  console.log('Postgres RLS policies applied to tenant-aware tables.');
};

// Backward compatibility: export both singular and plural names
module.exports = Object.assign(db, {
  // Singular
  Tenant: models.Tenant,
  User: models.User,
  Role: models.Role,
  MenuGroup: models.MenuGroup,
  RoleMenuPermission: models.RoleMenuPermission,
  UserMenuPermission: models.UserMenuPermission,
  AssetFinance: models.AssetFinance,
  Session: models.Session,
  Warehouse: models.Warehouse,
  StorageLocation: models.StorageLocation,
  Stock: models.Stock,
  StockTransfer: models.StockTransfer,
  StockAdjustment: models.StockAdjustment,
  StockOpname: models.StockOpname,
  CalibrationDevice: models.CalibrationDevice,
  CalibrationRecord: models.CalibrationRecord,
  TenantBackup: models.TenantBackup,
  TenantSettings: models.TenantSettings,
  Certificate: models.Certificate,
  Vendor: models.Vendor,
  MaintenanceWorkOrder: models.MaintenanceWorkOrder,
  Notification: models.Notification,
  Subscription: models.Subscription,
  Invoice: models.Invoice,
  AuditLog: models.AuditLog,
  Attachment: models.Attachment,
  Webhook: models.Webhook,
  WebhookDelivery: models.WebhookDelivery,
  ApiKey: models.ApiKey,
  Workflow: models.Workflow,
  WorkflowStep: models.WorkflowStep,
  WorkflowInstance: models.WorkflowInstance,
  WorkflowAction: models.WorkflowAction,
  Post: models.Post,
  Category: models.Category,
  PostCategory: models.PostCategory,

  // Plural (backward compatibility)
  Tenants: models.Tenant,
  Users: models.User,
  Roles: models.Role,
  MenuGroups: models.MenuGroup,
  RoleMenuPermissions: models.RoleMenuPermission,
  UserMenuPermissions: models.UserMenuPermission,
  AssetFinances: models.AssetFinance,
  Sessions: models.Session,
  Warehouses: models.Warehouse,
  StorageLocations: models.StorageLocation,
  Stocks: models.Stock,
  StockTransfers: models.StockTransfer,
  StockAdjustments: models.StockAdjustment,
  StockOpnames: models.StockOpname,
  CalibrationDevices: models.CalibrationDevice,
  CalibrationRecords: models.CalibrationRecord,
  TenantBackups: models.TenantBackup,
  TenantSettingses: models.TenantSettings,
  Certificates: models.Certificate,
  Vendors: models.Vendor,
  MaintenanceWorkOrders: models.MaintenanceWorkOrder,
  Notifications: models.Notification,
  Subscriptions: models.Subscription,
  Invoices: models.Invoice,
  AuditLogs: models.AuditLog,
  Attachments: models.Attachment,
  Webhooks: models.Webhook,
  WebhookDeliveries: models.WebhookDelivery,
  ApiKeys: models.ApiKey,
  Workflows: models.Workflow,
  WorkflowSteps: models.WorkflowStep,
  WorkflowInstances: models.WorkflowInstance,
  WorkflowActions: models.WorkflowAction,
  Posts: models.Post,
  Categories: models.Category,
  PostCategories: models.PostCategory,
  IotReading: models.IotReading,
  IotReadings: models.IotReading,
  ESignatureRecord: models.ESignatureRecord,
  ESignatureRecords: models.ESignatureRecord,
});
