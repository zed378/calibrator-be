const { Roles } = require("../models");
const { MenuGroup, RoleMenuPermission } = require("../models");
const { logger } = require("../middlewares/activityLog.middleware");
const { Op } = require("sequelize");

/**
 * Get or create menu group by slug
 */
function getMenuGroupId(slug) {
  const ids = {
    "home": "a0000000-0000-0000-0000-000000000000",
    "dashboard": "a0000000-0000-0000-0000-000000000001",
    "account": "a0000000-0000-0000-0000-000000000002",
    "management": "a0000000-0000-0000-0000-000000000003",
    "security": "a0000000-0000-0000-0000-000000000004",
    "profile": "a0000000-0000-0000-0000-000000000005",
    "warehouse": "a0000000-0000-0000-0000-000000000006",
    "equipment": "a0000000-0000-0000-0000-000000000007",
    "change-password": "a0000000-0000-0000-0000-000000000101",
    "profile-page": "a0000000-0000-0000-0000-000000000102",
    "menu-groups": "a0000000-0000-0000-0000-000000000201",
    "tenants": "a0000000-0000-0000-0000-000000000202",
    "roles": "a0000000-0000-0000-0000-000000000203",
    "users": "a0000000-0000-0000-0000-000000000204",
    "calibration": "a0000000-0000-0000-0000-000000000301",
    "certificate": "a0000000-0000-0000-0000-000000000302",
    "permissions": "a0000000-0000-0000-0000-000000000401",
    "sessions": "a0000000-0000-0000-0000-000000000402",
    "user-permissions": "a0000000-0000-0000-0000-000000000403",
    "notifications": "a0000000-0000-0000-0000-000000000103",
    "vendors": "a0000000-0000-0000-0000-000000000205",
    "billing": "a0000000-0000-0000-0000-000000000206",
    "audit": "a0000000-0000-0000-0000-000000000207",
    "api-keys": "a0000000-0000-0000-0000-000000000208",
    "webhooks": "a0000000-0000-0000-0000-000000000209",
    "attachments": "a0000000-0000-0000-0000-000000000210",
    "content": "a0000000-0000-0000-0000-000000000211",
    "maintenance": "a0000000-0000-0000-0000-000000000303",
    "calibration-scheduler": "a0000000-0000-0000-0000-000000000304",
    "reports": "a0000000-0000-0000-0000-000000000305",
    "feature-flags": "a0000000-0000-0000-0000-000000000212",
    "tenant-lifecycle": "a0000000-0000-0000-0000-000000000213",
    "data-retention": "a0000000-0000-0000-0000-000000000214",
    "oidc": "a0000000-0000-0000-0000-000000000215",
    "webauthn": "a0000000-0000-0000-0000-000000000216",
    "network-security": "a0000000-0000-0000-0000-000000000217",
    "scim": "a0000000-0000-0000-0000-000000000218",
  };
  // Fallback MUST be a valid UUID — the last segment needs 12 hex chars.
  return (
    ids[slug] ||
    `a0000000-0000-0000-0000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`
  );
}

/**
 * Seed menu groups
 */
async function seedMenuGroups() {
  logger.info("Seeding menu groups...");

  const menuData = [
    // Parent Groups
    { name: "Home", slug: "home", icon: "Home", sortOrder: 0, is_active: true },
    {
      name: "Dashboard",
      slug: "dashboard",
      icon: "LayoutGrid",
      sortOrder: 1,
      is_active: true,
    },
    {
      name: "Account",
      slug: "account",
      icon: "User",
      sortOrder: 2,
      is_active: true,
    },
    {
      name: "Management",
      slug: "management",
      icon: "Settings",
      sortOrder: 3,
      is_active: true,
    },
    {
      name: "Equipment",
      slug: "equipment",
      icon: "Wrench",
      sortOrder: 4,
      is_active: true,
    },
    {
      name: "Security",
      slug: "security",
      icon: "Shield",
      sortOrder: 5,
      is_active: true,
    },
    {
      name: "Warehouse",
      slug: "warehouse",
      icon: "Warehouse",
      sortOrder: 6,
      is_active: true,
    },

    // Children under Account (parent slug: "account")
    {
      name: "Change Password",
      slug: "change-password",
      icon: "Key",
      sortOrder: 0,
      is_active: true,
      parentSlug: "account",
    },
    {
      name: "Profile",
      slug: "profile-page",
      icon: "User",
      sortOrder: 1,
      is_active: true,
      parentSlug: "account",
    },
    {
      name: "Notifications",
      slug: "notifications",
      icon: "Bell",
      sortOrder: 2,
      is_active: true,
      parentSlug: "account",
    },

    // Children under Management (parent slug: "management")
    {
      name: "Menu Group Assignment",
      slug: "menu-groups",
      icon: "LayoutGrid",
      sortOrder: 0,
      is_active: true,
      parentSlug: "management",
    },
    {
      name: "Tenants",
      slug: "tenants",
      icon: "Building2",
      sortOrder: 1,
      is_active: true,
      parentSlug: "management",
    },
    {
      name: "Roles",
      slug: "roles",
      icon: "Shield",
      sortOrder: 2,
      is_active: true,
      parentSlug: "management",
    },
    {
      name: "Users",
      slug: "users",
      icon: "Users",
      sortOrder: 3,
      is_active: true,
      parentSlug: "management",
    },
    {
      name: "Vendors",
      slug: "vendors",
      icon: "Truck",
      sortOrder: 4,
      is_active: true,
      parentSlug: "management",
    },
    {
      name: "Billing",
      slug: "billing",
      icon: "CreditCard",
      sortOrder: 5,
      is_active: true,
      parentSlug: "management",
    },
    {
      name: "Audit Logs",
      slug: "audit",
      icon: "ScrollText",
      sortOrder: 6,
      is_active: true,
      parentSlug: "management",
    },
    {
      name: "API Keys",
      slug: "api-keys",
      icon: "KeyRound",
      sortOrder: 7,
      is_active: true,
      parentSlug: "management",
    },
    {
      name: "Webhooks",
      slug: "webhooks",
      icon: "Webhook",
      sortOrder: 8,
      is_active: true,
      parentSlug: "management",
    },
    {
      name: "Files & Documents",
      slug: "attachments",
      icon: "FileText",
      sortOrder: 9,
      is_active: true,
      parentSlug: "management",
    },
    {
      name: "Blog & News",
      slug: "content",
      icon: "Newspaper",
      sortOrder: 10,
      is_active: true,
      parentSlug: "management",
    },
    {
      name: "Feature Flags",
      slug: "feature-flags",
      icon: "ToggleLeft",
      sortOrder: 11,
      is_active: true,
      parentSlug: "management",
    },
    {
      name: "Tenant Lifecycle",
      slug: "tenant-lifecycle",
      icon: "ArrowLeftRight",
      sortOrder: 12,
      is_active: true,
      parentSlug: "management",
    },
    {
      name: "Data Retention",
      slug: "data-retention",
      icon: "Trash2",
      sortOrder: 13,
      is_active: true,
      parentSlug: "management",
    },
    {
      name: "OIDC Provider",
      slug: "oidc",
      icon: "Lock",
      sortOrder: 0,
      is_active: true,
      parentSlug: "security",
    },
    {
      name: "WebAuthn",
      slug: "webauthn",
      icon: "Fingerprint",
      sortOrder: 1,
      is_active: true,
      parentSlug: "security",
    },
    {
      name: "Network Security",
      slug: "network-security",
      icon: "Network",
      sortOrder: 2,
      is_active: true,
      parentSlug: "security",
    },
    {
      name: "SCIM Provisioning",
      slug: "scim",
      icon: "Users",
      sortOrder: 3,
      is_active: true,
      parentSlug: "security",
    },

    // Children under Equipment (parent slug: "equipment")
    {
      name: "Calibration Devices",
      slug: "calibration",
      icon: "Monitor",
      sortOrder: 0,
      is_active: true,
      parentSlug: "equipment",
    },
    {
      name: "Calibration & Certificates",
      slug: "certificate",
      icon: "Key",
      sortOrder: 1,
      is_active: true,
      parentSlug: "equipment",
    },
    {
      name: "Maintenance",
      slug: "maintenance",
      icon: "Wrench",
      sortOrder: 2,
      is_active: true,
      parentSlug: "equipment",
    },
    {
      name: "Calibration Scheduler",
      slug: "calibration-scheduler",
      icon: "CalendarClock",
      sortOrder: 3,
      is_active: true,
      parentSlug: "equipment",
    },
    {
      name: "Reports",
      slug: "reports",
      icon: "BarChart3",
      sortOrder: 4,
      is_active: true,
      parentSlug: "equipment",
    },

    // Children under Security (parent slug: "security")
    {
      name: "Role Permissions",
      slug: "permissions",
      icon: "Key",
      sortOrder: 0,
      is_active: true,
      parentSlug: "security",
    },
    {
      name: "User Permissions",
      slug: "user-permissions",
      icon: "Users",
      sortOrder: 1,
      is_active: true,
      parentSlug: "security",
    },
    {
      name: "Session Management",
      slug: "sessions",
      icon: "Database",
      sortOrder: 2,
      is_active: true,
      parentSlug: "security",
    },
  ];

  // Deprecated menu groups removed from the sidebar. Cleaned up on every
  // seeding run so existing databases lose them too.
  // - "Table Permission" (legacy table permission menu) — removed per
  //   product decision. NOTE: the "permissions" slug (Role Permissions)
  //   is KEPT — it is re-seeded above as "Role Permissions".
  // Collect per-item errors so one bad row never aborts the whole seeding,
  // and the migration response pinpoints exactly what failed.
  const itemErrors = [];
  const describeError = (err) => {
    const details = Array.isArray(err.errors)
      ? err.errors.map((e) => `${e.path}: ${e.message}`).join(", ")
      : "";
    return details ? `${err.message} (${details})` : err.message;
  };

  const deprecated = await MenuGroup.findAll({
    where: {
      [Op.or]: [
        { slug: { [Op.in]: ["table-permission", "table-permissions"] } },
        { name: { [Op.in]: ["Table Permission", "Table Permissions"] } },
      ],
    },
  });
  for (const group of deprecated) {
    try {
      await RoleMenuPermission.destroy({ where: { menuGroupId: group.id } });
      await group.destroy();
      logger.info(`Removed deprecated menu group: ${group.name} (${group.slug})`);
    } catch (err) {
      itemErrors.push(`remove "${group.slug}": ${describeError(err)}`);
    }
  }

  /**
   * Create-or-update one menu group row. If the create collides on the
   * hard-coded primary key (e.g. the id already belongs to another row),
   * retry once letting the DB generate a fresh UUID.
   */
  const upsertGroup = async (groupData, parentId = null) => {
    const group = await MenuGroup.findOne({ where: { slug: groupData.slug } });
    if (group) {
      await group.update({
        icon: groupData.icon,
        parentId,
        sortOrder: groupData.sortOrder,
        isActive: groupData.is_active,
      });
      return;
    }

    const payload = {
      name: groupData.name,
      slug: groupData.slug,
      icon: groupData.icon,
      parentId,
      sortOrder: groupData.sortOrder,
      isActive: groupData.is_active,
    };
    try {
      await MenuGroup.create({ id: getMenuGroupId(groupData.slug), ...payload });
    } catch (err) {
      // Retry without a fixed id (PK collision or invalid id in older data)
      logger.warn(
        `Create with fixed id failed for "${groupData.slug}" (${err.message}); retrying with generated id`,
      );
      await MenuGroup.create(payload);
    }
    logger.info(`Created menu group: ${groupData.name}`);
  };

  // First pass: Create parent groups
  for (const groupData of menuData.filter((g) => !g.parentSlug)) {
    try {
      await upsertGroup(groupData, null);
    } catch (err) {
      itemErrors.push(`parent "${groupData.slug}": ${describeError(err)}`);
    }
  }

  // Second pass: Create child groups (sub-menus / items)
  for (const groupData of menuData.filter((g) => g.parentSlug)) {
    try {
      const parent = await MenuGroup.findOne({
        where: { slug: groupData.parentSlug },
      });
      if (!parent) {
        itemErrors.push(
          `child "${groupData.slug}": parent not found (${groupData.parentSlug})`,
        );
        continue;
      }
      await upsertGroup(groupData, parent.id);
    } catch (err) {
      itemErrors.push(`child "${groupData.slug}": ${describeError(err)}`);
    }
  }

  if (itemErrors.length > 0) {
    // Surface exactly which items failed — callers report this message.
    throw new Error(`Menu seeding issues: ${itemErrors.join("; ")}`);
  }

  logger.info("Menu groups seeding completed.");
}

/**
 * Seed role menu permissions (simplified RBAC - read/write)
 * Note: Handled by migration.service.js but kept here for fallback and test compliance.
 */
async function seedRoleMenuPermissions() {
  logger.info("Seeding role menu permissions...");

  const roleAssignments = [
    {
      roleName: "SUPERADMIN",
      groupSlugs: [
        "home",
        "dashboard",
        "account",
        "management",
        "security",
        "warehouse",
        "equipment",
        "change-password",
        "profile-page",
        "menu-groups",
        "tenants",
        "roles",
        "users",
        "calibration",
        "certificate",
        "permissions",
        "user-permissions",
        "sessions",
        "notifications",
        "vendors",
        "billing",
        "audit",
        "api-keys",
        "webhooks",
        "maintenance",
        "calibration-scheduler",
        "reports",
        "content",
        "feature-flags",
        "tenant-lifecycle",
        "data-retention",
        "oidc",
        "webauthn",
        "network-security",
        "scim",
      ],
    },
    {
      roleName: "HEALTHCARE ADMIN",
      groupSlugs: [
        "home",
        "dashboard",
        "account",
        "management",
        "warehouse",
        "equipment",
        "change-password",
        "profile-page",
        "notifications",
        "tenants",
        "roles",
        "users",
        "vendors",
        "billing",
        "calibration",
        "certificate",
        "maintenance",
        "reports",
        "feature-flags",
        "tenant-lifecycle",
        "data-retention",
        "oidc",
        "webauthn",
        "network-security",
        "scim",
      ],
    },
    {
      roleName: "CALIBRATOR ADMIN",
      groupSlugs: [
        "home",
        "dashboard",
        "account",
        "management",
        "warehouse",
        "equipment",
        "change-password",
        "profile-page",
        "notifications",
        "tenants",
        "roles",
        "users",
        "vendors",
        "calibration",
        "certificate",
        "maintenance",
        "calibration-scheduler",
        "reports",
        "feature-flags",
        "tenant-lifecycle",
        "data-retention",
      ],
    },
    {
      roleName: "USER",
      groupSlugs: [
        "home",
        "dashboard",
        "account",
        "change-password",
        "profile-page",
        "notifications",
      ],
    },
  ];

  for (const assignment of roleAssignments) {
    const role = await Roles.findOne({
      where: { name: assignment.roleName },
    });

    if (!role) {
      logger.warn(`Role not found: ${assignment.roleName}, skipping...`);
      continue;
    }

    for (const slug of assignment.groupSlugs) {
      const group = await MenuGroup.findOne({
        where: { slug },
      });

      if (!group) {
        logger.warn(`Menu group not found: ${slug}, skipping...`);
        continue;
      }

      const existing = await RoleMenuPermission.findOne({
        where: {
          roleId: role.id,
          menuGroupId: group.id,
        },
      });

      if (!existing) {
        await RoleMenuPermission.create({
          roleId: role.id,
          menuGroupId: group.id,
          permissionType: "read",
        });
      }
    }
  }

  logger.info("Role menu permissions seeded.");
}

/**
 * Seed all: menu groups + role permissions
 */
async function seedAll() {
  await seedMenuGroups();
  await seedRoleMenuPermissions();
  logger.info("All seeding completed successfully.");
}

module.exports = {
  seedMenuGroups,
  seedRoleMenuPermissions,
  seedAll,
};
