/**
 * Migration Service - Simplified RBAC
 *
 * Centralized service for database migrations, seeding, and unseeding operations.
 * Uses simplified RBAC with RoleMenuPermission (read/write permissions on menu groups).
 *
 * Architecture:
 * - All roles are global (not tenant-scoped)
 * - Roles have read or write permissions on menu groups via RoleMenuPermission
 * - Users inherit permissions from their assigned role within a tenant
 * - No ABAC (Attribute-Based Access Control) - pure RBAC with simple read/write
 *
 * Usage:
 *   const migrationService = require("../services/migration.service");
 *   const result = await migrationService.seedAll();
 */

const { Op } = require("sequelize");
const {
  Users,
  Roles,
  MenuGroup,
  RoleMenuPermission,
  Warehouse,
  StorageLocation,
  Stock,
  StockTransfer,
  StockAdjustment,
  StockOpname,
  Tenant,
} = require("../models");
const { hashPassword } = require("../utils/password.util");
const { seedMenuGroups } = require("../utils/seedMenuGroups.util");
const {
  ROLE_NAMES,
  ROLE_IDS,
  PASSWORD_SALT_ROUNDS,
  ROLE_MENU_ASSIGNMENTS,
  MENU_SLUGS,
  PROFILE_SUB_ROUTES,
  PERMISSION_TYPES,
  DEFAULT_TENANT,
} = require("../constants");
const { logger } = require("../middlewares/activityLog.middleware");

// ==========================================
// CONSTANTS
// ==========================================

/**
 * Default role definitions (core roles from constants)
 */
const DEFAULT_ROLES = [
  {
    id: ROLE_IDS.SUPER_ADMIN,
    name: "SUPERADMIN",
    description: "System Super Administrator",
    nameToShow: "Super Admin",
    isSystem: true,
    status: "active",
    sortOrder: 0,
  },
  {
    id: ROLE_IDS.HEALTCARE_ADMIN,
    name: "HEALTHCARE ADMIN",
    description: "Healthcare Administrator",
    nameToShow: "Admin Faskes",
    isSystem: true,
    status: "active",
    sortOrder: 1,
  },
  {
    id: ROLE_IDS.CALIBRATOR_ADMIN,
    name: "CALIBRATOR ADMIN",
    description: "Calibrator Administrator",
    nameToShow: "Admin Kalibrator",
    isSystem: true,
    status: "active",
    sortOrder: 2,
  },
  {
    id: ROLE_IDS.USER,
    name: "USER",
    description: "Authenticated User",
    nameToShow: "Normal User",
    isSystem: true,
    status: "active",
    sortOrder: 3,
  },
];

/**
 * Additional role definitions for seeding
 * Contains all application-specific roles beyond the core four
 */
const APPLICATION_ROLES = [
  {
    id: ROLE_IDS.TECHNICIAN,
    name: "TECHNICIAN",
    description: "Technician",
    nameToShow: "Teknisi",
    isSystem: false,
    status: "active",
    sortOrder: 4,
  },
  {
    id: ROLE_IDS.SUPERVISOR,
    name: "SUPERVISOR",
    description: "Supervisor",
    nameToShow: "Penyelia",
    isSystem: false,
    status: "active",
    sortOrder: 5,
  },
  {
    id: ROLE_IDS.ENGINEERING_MANAGER,
    name: "ENGINEERING MANAGER",
    description: "Enginnering Manager",
    nameToShow: "Manajer Teknik",
    isSystem: false,
    status: "active",
    sortOrder: 6,
  },
  {
    id: ROLE_IDS.HEALTHCARE_TECHNICIAN,
    name: "HEALTHCARE TECHNICIAN",
    description: "Healthcare Technician",
    nameToShow: "Teknisi Faskes",
    isSystem: false,
    status: "active",
    sortOrder: 7,
  },
  {
    id: ROLE_IDS.FACILITY_MAINTENANCE,
    name: "FACILITY MAINTENANCE",
    description: "Facility Maintainance",
    nameToShow: "IPSRS",
    isSystem: false,
    status: "active",
    sortOrder: 8,
  },
  {
    id: ROLE_IDS.WAREHOUSE_STAFF,
    name: "WAREHOUSE STAFF",
    description: "Warehouse Staff",
    nameToShow: "Gudang",
    isSystem: false,
    status: "active",
    sortOrder: 9,
  },
  {
    id: ROLE_IDS.ROOM_USER,
    name: "ROOM USER",
    description: "Room User",
    nameToShow: "User Ruangan",
    isSystem: false,
    status: "active",
    sortOrder: 10,
  },
];

/**
 * Default system user to seed after roles
 */
const DEFAULT_SYSTEM_USERS = [
  {
    email: "sys@mail.com",
    username: "sys",
    password: "123123",
    firstName: "Super",
    lastName: "System",
    status: "ACTIVE",
    roleId: ROLE_IDS.SUPER_ADMIN,
    tenantId: DEFAULT_TENANT.id,
    isEmailVerified: true,
  },
];

/**
 * Default menu slugs that every role gets
 * Profile menu group contains both profile page and change-password sub-routes
 */
const DEFAULT_MENUS = [MENU_SLUGS.PROFILE, PROFILE_SUB_ROUTES.CHANGE_PASSWORD];

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// ==========================================
// DATABASE OPERATIONS
// ==========================================

/**
 * Drop all seeded tables (truncate)
 * @returns {Promise<Object>} Result of drop operation
 */
async function dropSeededTables() {
  const result = {
    stockTransfersDeleted: 0,
    stockAdjustmentsDeleted: 0,
    stockOpnamesDeleted: 0,
    stocksDeleted: 0,
    storageLocationsDeleted: 0,
    warehousesDeleted: 0,
    usersDeleted: 0,
    roleMenuPermissionsDeleted: 0,
    menuGroupsDeleted: 0,
    rolesDeleted: 0,
    errors: [],
  };

  try {
    // Delete dependent tables first
    result.stockTransfersDeleted = await StockTransfer.destroy({
      where: {},
      force: true,
    });
    logger.info(`Dropped ${result.stockTransfersDeleted} stock transfers`);

    result.stockAdjustmentsDeleted = await StockAdjustment.destroy({
      where: {},
      force: true,
    });
    logger.info(`Dropped ${result.stockAdjustmentsDeleted} stock adjustments`);

    result.stockOpnamesDeleted = await StockOpname.destroy({
      where: {},
      force: true,
    });
    logger.info(`Dropped ${result.stockOpnamesDeleted} stock opnames`);

    result.stocksDeleted = await Stock.destroy({ where: {}, force: true });
    logger.info(`Dropped ${result.stocksDeleted} stocks`);

    result.storageLocationsDeleted = await StorageLocation.destroy({
      where: {},
      force: true,
    });
    logger.info(`Dropped ${result.storageLocationsDeleted} storage locations`);

    result.warehousesDeleted = await Warehouse.destroy({
      where: {},
      force: true,
    });
    logger.info(`Dropped ${result.warehousesDeleted} warehouses`);

    // Delete users (foreign key dependency)
    result.usersDeleted = await Users.destroy({
      where: {},
      force: true,
    });
    logger.info(`Dropped ${result.usersDeleted} users`);

    // Delete tenants
    result.tenantsDeleted = await Tenant.destroy({
      where: {},
      force: true,
    });
    logger.info(`Dropped ${result.tenantsDeleted} tenants`);

    // Delete role menu permissions
    result.roleMenuPermissionsDeleted = await RoleMenuPermission.destroy({
      where: {},
      force: true,
    });
    logger.info(
      `Dropped ${result.roleMenuPermissionsDeleted} role menu permissions`,
    );

    // Delete menu groups
    result.menuGroupsDeleted = await MenuGroup.destroy({
      where: {},
      force: true,
    });
    logger.info(`Dropped ${result.menuGroupsDeleted} menu groups`);

    // Delete roles last
    result.rolesDeleted = await Roles.destroy({
      where: {},
      force: true,
    });
    logger.info(`Dropped ${result.rolesDeleted} roles`);

    return result;
  } catch (error) {
    result.errors.push(`Error dropping tables: ${error.message}`);
    logger.error(`Failed to drop tables: ${error.message}`);
    return result;
  }
}

/**
 * Sync database tables (recreate all tables)
 * @returns {Promise<Object>} Result of sync operation
 */
async function syncTables() {
  const result = {
    synced: false,
    errors: [],
  };

  try {
    const { db } = require("../config");
    await db.sync({ force: true });
    result.synced = true;
    logger.info("All database tables synced successfully");
    return result;
  } catch (error) {
    result.errors.push(`Error syncing tables: ${error.message}`);
    logger.error(`Failed to sync tables: ${error.message}`);
    return result;
  }
}

/**
 * Drop tables, sync, and seed - complete reset and seed operation
 * @returns {Promise<Object>} Complete operation result
 */
async function resetAndSeed() {
  logger.info("=== Starting database reset and seed ===");

  const result = {
    drop: await dropSeededTables(),
  };

  // Sync tables
  result.sync = await syncTables();
  if (!result.sync.synced) {
    logger.error("Table sync failed, aborting seed");
    return result;
  }

  // Step 1: Seed roles first (needed for menu permission assignments)
  result.roles = await seedAllRoles();

  // Step 2: Seed menu groups and assign role permissions (requires roles to exist)
  result.menuGroups = await seedMenuGroupsAndItems();

  // Step 2.5: Seed default tenant (required before users are created)
  await seedDefaultTenant();

  // Step 3: Seed users (last, as they reference roles)
  result.users = await seedUsers();

  logger.info("=== Database reset and seed completed ===");
  return result;
}

// ==========================================
// ROLE SEEDING
// ==========================================

/**
 * Seed default roles (SUPER_ADMIN, TENANT_ADMIN, USER)
 * @returns {Promise<Object>} Result of seeding operation
 */
async function seedDefaultRoles() {
  const result = {
    rolesCreated: 0,
    rolesSkipped: 0,
    errors: [],
  };

  try {
    const existingRoles = await Roles.findAll({
      where: {
        name: {
          [Op.in]: DEFAULT_ROLES.map((r) => r.name),
        },
      },
      paranoid: false,
    });

    const existingNames = new Set(existingRoles.map((r) => r.name));
    const rolesToCreate = DEFAULT_ROLES.filter(
      (r) => !existingNames.has(r.name),
    );

    if (rolesToCreate.length > 0) {
      await Roles.bulkCreate(rolesToCreate, {
        ignoreDuplicates: true,
      });
      result.rolesCreated = rolesToCreate.length;
      for (const role of rolesToCreate) {
        logger.info(`Created role: ${role.name}`);
      }
    }

    result.rolesSkipped = existingRoles.length;
    return result;
  } catch (error) {
    result.errors.push(
      `Fatal error during default roles seeding: ${error.message}`,
    );
    logger.error(`Failed to seed default roles: ${error.message}`);
    return result;
  }
}

/**
 * Seed application-specific roles (HEALTHCARE ADMIN, TECHNICIAN, etc.)
 * @returns {Promise<Object>} Result of seeding operation
 */
async function seedApplicationRoles() {
  const result = {
    rolesCreated: 0,
    rolesSkipped: 0,
    errors: [],
  };

  try {
    const existingRoles = await Roles.findAll({
      where: {
        name: {
          [Op.in]: APPLICATION_ROLES.map((r) => r.name),
        },
      },
      paranoid: false,
    });

    const existingNames = new Set(existingRoles.map((r) => r.name));
    const rolesToCreate = APPLICATION_ROLES.filter(
      (r) => !existingNames.has(r.name),
    );

    if (rolesToCreate.length > 0) {
      await Roles.bulkCreate(rolesToCreate, {
        ignoreDuplicates: true,
      });
      result.rolesCreated = rolesToCreate.length;
      for (const role of rolesToCreate) {
        logger.info(`Created role: ${role.name}`);
      }
    }

    result.rolesSkipped = existingRoles.length;
    return result;
  } catch (error) {
    result.errors.push(
      `Fatal error during application roles seeding: ${error.message}`,
    );
    logger.error(`Failed to seed application roles: ${error.message}`);
    return result;
  }
}

/**
 * Seed all roles (default + application roles)
 * @returns {Promise<Object>} Result of seeding operation
 */
async function seedAllRoles() {
  const defaultRolesResult = await seedDefaultRoles();
  const applicationRolesResult = await seedApplicationRoles();

  return {
    rolesCreated:
      defaultRolesResult.rolesCreated + applicationRolesResult.rolesCreated,
    rolesSkipped:
      defaultRolesResult.rolesSkipped + applicationRolesResult.rolesSkipped,
    errors: [...defaultRolesResult.errors, ...applicationRolesResult.errors],
  };
}

// ==========================================
// MENU GROUP & PERMISSION SEEDING
// ==========================================

/**
 * Seed menu groups and role permissions
 * @returns {Promise<Object>} Result of seeding operation
 */
async function seedMenuGroupsAndItems() {
  const result = {
    menuGroupsCreated: 0,
    menuGroupsSkipped: 0,
    permissionsAssigned: 0,
    errors: [],
  };

  try {
    // Seed menu groups (profile contains change-password as sub-route)
    await seedMenuGroups();
    result.menuGroupsCreated = 7; // 6 original + profile (with change-password sub-route)
    logger.info("Menu groups seeded successfully");

    // Seed role menu permissions using ROLE_MENU_ASSIGNMENTS from constants
    for (const assignment of ROLE_MENU_ASSIGNMENTS) {
      const role = await Roles.findOne({
        where: { name: assignment.roleName },
        paranoid: false,
      });

      if (!role) {
        logger.warn(`Role not found: ${assignment.roleName}`);
        continue;
      }

      // Get menus from the menus object (each has its own permission type)
      const menus = assignment.menus || {};

      for (const [slug, permissionType] of Object.entries(menus)) {
        const menuGroup = await MenuGroup.findOne({
          where: { slug },
        });

        if (!menuGroup) {
          logger.warn(`Menu group not found: ${slug}`);
          continue;
        }

        const existing = await RoleMenuPermission.findOne({
          where: {
            roleId: role.id,
            menuGroupId: menuGroup.id,
          },
        });

        if (!existing) {
          await RoleMenuPermission.create({
            roleId: role.id,
            menuGroupId: menuGroup.id,
            permissionType: permissionType,
          });
          result.permissionsAssigned++;
        } else {
          result.menuGroupsSkipped++;
        }
      }
    }

    logger.info(
      `Role menu permissions seeded: ${result.permissionsAssigned} assigned`,
    );
    return result;
  } catch (error) {
    result.errors.push(`Error seeding menus: ${error.message}`);
    logger.error(`Failed to seed menus: ${error.message}`);
    return result;
  }
}

/**
 * Seed role menu permissions for a specific role
 * @param {string} roleName - Role name
 * @param {string[]} menuSlugs - Array of menu group slugs
 * @param {string} permissionType - "read" or "write"
 * @returns {Promise<Object>} Result of seeding operation
 */
async function seedRoleMenuPermissions(roleName, menuSlugs, permissionType) {
  const result = {
    permissionsAssigned: 0,
    errors: [],
  };

  try {
    const role = await Roles.findOne({
      where: { name: roleName },
      paranoid: false,
    });

    if (!role) {
      logger.warn(`Role not found: ${roleName}`);
      return result;
    }

    for (const slug of menuSlugs) {
      const menuGroup = await MenuGroup.findOne({
        where: { slug },
      });

      if (!menuGroup) {
        logger.warn(`Menu group not found: ${slug}`);
        continue;
      }

      const existing = await RoleMenuPermission.findOne({
        where: {
          roleId: role.id,
          menuGroupId: menuGroup.id,
        },
      });

      if (!existing) {
        await RoleMenuPermission.create({
          roleId: role.id,
          menuGroupId: menuGroup.id,
          permissionType: permissionType,
        });
        result.permissionsAssigned++;
      }
    }

    return result;
  } catch (error) {
    result.errors.push(`Error seeding role menu permissions: ${error.message}`);
    logger.error(`Failed to seed role menu permissions: ${error.message}`);
    return result;
  }
}

/**
 * Seed default tenant
 * @returns {Promise<void>}
 */
async function seedDefaultTenant() {
  try {
    const existing = await Tenant.findOne({
      where: { id: DEFAULT_TENANT.id },
      paranoid: false,
    });

    if (!existing) {
      await Tenant.create(DEFAULT_TENANT);
      logger.info(`Created default tenant: ${DEFAULT_TENANT.name}`);
    }
  } catch (error) {
    logger.error(`Failed to seed default tenant: ${error.message}`);
    throw error;
  }
}

// ==========================================
// USER SEEDING
// ==========================================

/**
 * Seed default system users
 * @returns {Promise<Object>} Result of seeding operation
 */
async function seedUsers() {
  const result = {
    usersCreated: 0,
    usersSkipped: 0,
    errors: [],
  };

  try {
    for (const userData of DEFAULT_SYSTEM_USERS) {
      const hashedPassword = await hashPassword(userData.password);
      const fields = {
        email: userData.email,
        username: userData.username,
        password: hashedPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        status: userData.status,
        roleId: userData.roleId,
        tenantId: userData.tenantId,
        isEmailVerified:
          userData.isEmailVerified !== undefined
            ? userData.isEmailVerified
            : true,
      };

      // Upsert instead of hard-delete + recreate: existing system users may
      // be referenced by other tables (e.g. certificates.created_by), so
      // deleting them violates foreign key constraints. Update in place,
      // restoring a soft-deleted row if needed.
      const existing = await Users.findOne({
        where: { email: userData.email },
        paranoid: false,
      });

      if (existing) {
        if (existing.deletedAt) {
          await existing.restore();
        }
        await existing.update(fields);
        result.usersSkipped++;
        logger.info(`Updated existing system user: ${userData.email}`);
      } else {
        await Users.create(fields);
        result.usersCreated++;
        logger.info(`Created user: ${userData.email}`);
      }
    }

    return result;
  } catch (error) {
    result.errors.push(`Fatal error during users seeding: ${error.message}`);
    logger.error(`Failed to seed users: ${error.message}`);
    return result;
  }
}

// ==========================================
// UNSEEDING
// ==========================================

/**
 * Unseed (delete) seeded roles by name
 * @param {string[]} roleNames - Array of role names to delete
 * @returns {Promise<Object>} Result of unseeding operation
 */
async function unseedRoles(roleNames) {
  const result = {
    rolesDeleted: 0,
    errors: [],
  };

  try {
    const deletedCount = await Roles.destroy({
      where: {
        name: {
          [Op.in]: roleNames,
        },
      },
    });

    result.rolesDeleted = deletedCount;
    return result;
  } catch (error) {
    result.errors.push(`Error deleting roles: ${error.message}`);
    return result;
  }
}

/**
 * Unseed (delete) seeded users by email
 * @param {string[]} emails - Array of user emails to delete
 * @returns {Promise<Object>} Result of unseeding operation
 */
async function unseedUsers(emails) {
  const result = {
    usersDeleted: 0,
    errors: [],
  };

  try {
    const deletedCount = await Users.destroy({
      where: {
        email: {
          [Op.in]: emails,
        },
      },
      force: true,
    });

    result.usersDeleted = deletedCount;
    return result;
  } catch (error) {
    result.errors.push(`Error deleting users: ${error.message}`);
    return result;
  }
}

/**
 * Unseed (delete) all menu groups, items, and related assignments
 * @returns {Promise<Object>} Result of unseeding operation
 */
async function unseedMenuData() {
  const result = {
    roleMenuPermissionsDeleted: 0,
    menuGroupsDeleted: 0,
    errors: [],
  };

  try {
    // 1. Delete role menu permissions
    result.roleMenuPermissionsDeleted = await RoleMenuPermission.destroy({
      where: {},
    });

    // 2. Delete menu groups
    result.menuGroupsDeleted = await MenuGroup.destroy({
      where: {},
    });

    return result;
  } catch (error) {
    result.errors.push(`Error unseeding menu data: ${error.message}`);
    return result;
  }
}

// ==========================================
// COMPLETE SEEDING/UNSEEDING
// ==========================================

/**
 * Seed all database data (roles, menu permissions, users)
 * This is the main entry point for complete database seeding
 * @returns {Promise<Object>} Complete seeding result
 */
async function seedAll() {
  logger.info("=== Starting database seeding ===");

  const result = {
    roles: await seedAllRoles(),
    menuGroups: await seedMenuGroupsAndItems(),
    tenant: await seedDefaultTenant(),
    users: await seedUsers(),
  };

  logger.info("=== Database seeding completed ===");
  return result;
}

/**
 * Complete unseed operation - removes all seeded data in correct order
 * @returns {Promise<Object>} Complete unseeding result
 */
async function unseedAll() {
  const roleNames = [
    ...DEFAULT_ROLES.map((r) => r.name),
    ...APPLICATION_ROLES.map((r) => r.name),
  ];
  const emails = DEFAULT_SYSTEM_USERS.map((u) => u.email);

  const result = {
    // Order matters: delete dependent data first
    menuData: await unseedMenuData(),
    users: await unseedUsers(emails),
    tenants: await Tenant.destroy({
      where: { id: DEFAULT_TENANT.id },
      force: true,
    }),
    roles: await unseedRoles(roleNames),
  };

  return result;
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Database operations
  dropSeededTables,
  syncTables,
  resetAndSeed,

  // Role seeding
  seedDefaultRoles,
  seedApplicationRoles,
  seedAllRoles,

  // Menu group seeding
  seedMenuGroupsAndItems,
  seedRoleMenuPermissions,

  // User seeding
  seedUsers,

  // Complete seeding
  seedAll,

  // Unseeding
  unseedAll,
  unseedRoles,
  unseedUsers,
  unseedMenuData,

  // Constants (for external use if needed)
  DEFAULT_ROLES,
  APPLICATION_ROLES,
  ROLE_MENU_ASSIGNMENTS,
};
