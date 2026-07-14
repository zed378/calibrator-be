/**
 * Custom Domains Service
 *
 * Manages per-tenant custom domains (vanity subdomains, CNAME records, TLS certificates).
 * Handles tenant resolution by hostname and domain verification.
 *
 * Usage:
 *   const { addDomain, resolveTenantByDomain } = require('./services/customDomains.service');
 *   await addDomain(tenantId, 'app.example.com');
 *   const tenant = await resolveTenantByDomain('app.example.com');
 */

const { logger } = require("../middlewares/activityLog.middleware");
const { AppError } = require("../utils/appError.util");
const { db } = require("../config");

// ==========================================
// CONFIGURATION
// ==========================================

const CUSTOM_DOMAINS_ENABLED = () => process.env.CUSTOM_DOMAINS_ENABLED === "true";
const DEFAULT_SUBDOMAIN = () => process.env.DEFAULT_SUBDOMAIN || "app";
const DNS_CHECK_INTERVAL = () => parseInt(process.env.DNS_CHECK_INTERVAL) || 300; // 5 min
const TLS_AUTO_PROVISION = () => process.env.TLS_AUTO_PROVISION === "true";

// ==========================================
// DOMAIN VERIFICATION
// ==========================================

/**
 * Verify domain ownership via DNS TXT record
 * @param {string} domain - Domain to verify
 * @returns {Promise<{verified: boolean, record: string}>}
 */
exports.verifyDomain = async (domain) => {
  if (!CUSTOM_DOMAINS_ENABLED()) {
    return { verified: false, reason: "Custom domains disabled" };
  }

  const verificationToken = generateVerificationToken(domain);

  try {
    // In production, use DNS lookup to verify TXT record
    // For now, simulate verification
    const verified = await checkDnsTxtRecord(domain, verificationToken);

    return {
      verified,
      record: verified ? verificationToken : null,
      dnsRecord: {
        type: "CNAME",
        name: `_domain_verify.${domain}`,
        value: verificationToken,
      },
    };
  } catch (err) {
    logger.error("Domain verification failed", {
      domain,
      error: err.message,
    });
    return { verified: false, reason: err.message };
  }
};

/**
 * Check DNS TXT record for verification
 */
async function checkDnsTxtRecord(domain, expectedToken) {
  // In production, use dns.resolveTxt() from Node.js dns module
  // const dns = require('dns');
  // const records = await dns.resolveTxt(`_domain_verify.${domain}`);
  // return records.some((r) => r.includes(expectedToken));

  // Simulated for now
  logger.debug("DNS TXT check simulated", { domain });
  return true;
}

/**
 * Generate verification token for domain
 */
function generateVerificationToken(domain) {
  const crypto = require("crypto");
  return crypto.randomBytes(16).toString("hex");
}

// ==========================================
// DOMAIN MANAGEMENT
// ==========================================

/**
 * Add a custom domain to a tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} domain - Domain (e.g., 'app.example.com')
 * @param {string} type - Domain type (custom, subdomain)
 * @returns {Promise<{domain: string, status: string}>}
 */
exports.addDomain = async (tenantId, domain, type = "custom") => {
  if (!CUSTOM_DOMAINS_ENABLED()) {
    throw new AppError(400, "Custom domains are disabled");
  }

  if (!tenantId || !domain) {
    throw new AppError(400, "tenantId and domain are required");
  }

  // Validate domain format
  if (!isValidDomain(domain)) {
    throw new AppError(400, "Invalid domain format");
  }

  // Check if domain already exists
  const existing = await exports.getDomainByDomain(domain);
  if (existing) {
    throw new AppError(409, "Domain already assigned to another tenant");
  }

  try {
    let domainRecord;

    if (db.getDialect() === "postgres") {
      const result = await db.query(
        `INSERT INTO "CustomDomains" ("tenantId", domain, domain_type, status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING *`,
        {
          replacements: [tenantId, domain, type, "pending_verification"],
          type: db.QueryTypes.SELECT,
        },
      );
      domainRecord = result[0];
    } else {
      const { CustomDomain } = require("../models");
      domainRecord = await CustomDomain.create({
        tenantId,
        domain,
        domainType: type,
        status: "pending_verification",
      });
    }

    // Send verification email
    await sendDomainVerificationEmail(tenantId, domain);

    logger.info("Custom domain added", {
      tenantId,
      domain,
      type,
    });

    return {
      domain: domainRecord.domain,
      status: domainRecord.status,
      verification: getDnsVerificationInstructions(domain),
    };
  } catch (err) {
    logger.error("Failed to add domain", {
      tenantId,
      domain,
      error: err.message,
    });
    throw new AppError(500, "Failed to add domain");
  }
};

/**
 * Remove a custom domain from a tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} domain - Domain to remove
 */
exports.removeDomain = async (tenantId, domain) => {
  if (!tenantId || !domain) {
    throw new AppError(400, "tenantId and domain are required");
  }

  try {
    if (db.getDialect() === "postgres") {
      await db.query(
        `UPDATE "CustomDomains" SET status = $1, "updatedAt" = NOW()
         WHERE "tenantId" = $2 AND domain = $3 AND status != $4`,
        { replacements: ["deleted", tenantId, domain, "deleted"] },
      );
    } else {
      const { CustomDomain } = require("../models");
      await CustomDomain.update(
        { status: "deleted" },
        { where: { tenantId, domain } },
      );
    }

    logger.info("Custom domain removed", { tenantId, domain });
    return { success: true };
  } catch (err) {
    logger.error("Failed to remove domain", {
      tenantId,
      domain,
      error: err.message,
    });
    throw new AppError(500, "Failed to remove domain");
  }
};

/**
 * Get domain by domain name
 */
exports.getDomainByDomain = async (domain) => {
  try {
    if (db.getDialect() === "postgres") {
      const result = await db.query(
        `SELECT * FROM "CustomDomains" WHERE domain = $1 AND status = $2`,
        { replacements: [domain, "active"], type: db.QueryTypes.SELECT },
      );
      return result[0] || null;
    } else {
      const { CustomDomain } = require("../models");
      return await CustomDomain.findOne({
        where: { domain, status: "active" },
      });
    }
  } catch (err) {
    logger.error("Failed to get domain", { domain, error: err.message });
    return null;
  }
};

// ==========================================
// TENANT RESOLUTION
// ==========================================

/**
 * Resolve tenant by hostname/domain
 * @param {string} hostname - Request hostname
 * @returns {Promise<{tenantId: string, domain: string}|null>}
 */
exports.resolveTenantByDomain = async (hostname) => {
  if (!CUSTOM_DOMAINS_ENABLED) {
    return null;
  }

  // Skip if default subdomain
  if (hostname.endsWith(`.${DEFAULT_SUBDOMAIN}`)) {
    return null;
  }

  try {
    let domainRecord;

    if (db.getDialect() === "postgres") {
      const result = await db.query(
        `SELECT * FROM "CustomDomains" WHERE domain = $1 AND status = $2`,
        { replacements: [hostname, "active"], type: db.QueryTypes.SELECT },
      );
      domainRecord = result[0];
    } else {
      const { CustomDomain } = require("../models");
      domainRecord = await CustomDomain.findOne({
        where: { domain: hostname, status: "active" },
      });
    }

    if (domainRecord) {
      logger.debug("Tenant resolved by custom domain", {
        hostname,
        tenantId: domainRecord.tenantId,
      });
      return {
        tenantId: domainRecord.tenantId,
        domain: domainRecord.domain,
      };
    }
  } catch (err) {
    logger.error("Domain resolution failed", {
      hostname,
      error: err.message,
    });
  }

  return null;
};

/**
 * Get all domains for a tenant
 */
exports.getTenantDomains = async (tenantId) => {
  try {
    if (db.getDialect() === "postgres") {
      const result = await db.query(
        `SELECT * FROM "CustomDomains" WHERE "tenantId" = $1 AND status != $2
         ORDER BY status DESC, "createdAt" DESC`,
        { replacements: [tenantId, "deleted"], type: db.QueryTypes.SELECT },
      );
      return result;
    } else {
      const { CustomDomain } = require("../models");
      return await CustomDomain.findAll({
        where: { tenantId, status: { [db.Sequelize.Op.ne]: "deleted" } },
        order: [["createdAt", "DESC"]],
      });
    }
  } catch (err) {
    logger.error("Failed to get tenant domains", {
      tenantId,
      error: err.message,
    });
    return [];
  }
};

// ==========================================
// DNS CONFIGURATION
// ==========================================

/**
 * Get DNS configuration instructions for a domain
 */
function getDnsVerificationInstructions(domain) {
  const isSubdomain = domain.includes(".");
  const baseDomain = isSubdomain
    ? domain.split(".").slice(-2).join(".")
    : domain;

  return {
    verification: {
      type: "TXT",
      name: `_domain_verify.${isSubdomain ? domain : baseDomain}`,
      value: "callibrator-verify=[TOKEN]",
    },
    cname: {
      type: "CNAME",
      name: isSubdomain ? domain : `${DEFAULT_SUBDOMAIN()}.${domain}`,
      value: `cname.callibrator.io.`,
    },
    instructions: [
      "1. Add the TXT record to verify domain ownership",
      "2. Add the CNAME record to point traffic to Callibrator",
      "3. Click 'Verify' after DNS propagates (up to 48 hours)",
      TLS_AUTO_PROVISION()
        ? "4. TLS certificate will be auto-provisioned via Let's Encrypt"
        : "4. Contact support to enable TLS for your domain",
    ],
  };
}

/**
 * Send domain verification email to tenant admin
 */
async function sendDomainVerificationEmail(tenantId, domain) {
  const { User } = require("../models");

  try {
    const admin = await User.findOne({
      where: { tenantId, role: "TENANT_ADMIN" },
      order: [["createdAt", "ASC"]],
    });

    if (admin && admin.email) {
      const { emailQueueService } = require("../services/emailQueue.service");
      await emailQueueService.queueEmail({
        to: admin.email,
        subject: `Verify domain: ${domain}`,
        template: "domain-verification",
        data: {
          domain,
          verificationUrl: `https://${domain}/verify`,
        },
      });
    }
  } catch (err) {
    logger.warn("Failed to send verification email", {
      tenantId,
      domain,
      error: err.message,
    });
  }
}

// ==========================================
// TLS CERTIFICATE MANAGEMENT
// ==========================================

/**
 * Provision TLS certificate for a domain
 * @param {string} domain - Domain to provision cert for
 */
exports.provisionTLSCertificate = async (domain) => {
  if (!TLS_AUTO_PROVISION()) {
    return { success: false, reason: "TLS auto-provisioning disabled" };
  }

  try {
    // In production, use acme.js or node-acme-client for Let's Encrypt
    // const acme = require('node-acme-client');
    // await acme.provision(domain);

    logger.info("TLS certificate provisioned (simulated)", { domain });
    return {
      success: true,
      certificate: {
        domain,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
        issuer: "Let's Encrypt (simulated)",
      },
    };
  } catch (err) {
    logger.error("TLS provisioning failed", { domain, error: err.message });
    return { success: false, reason: err.message };
  }
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Validate domain format
 */
function isValidDomain(domain) {
  const domainRegex =
    /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[A-Za-z]{2,}$/;
  return domainRegex.test(domain);
}

/**
 * Get service status
 */
exports.getStatus = () => {
  return {
    enabled: CUSTOM_DOMAINS_ENABLED(),
    defaultSubdomain: DEFAULT_SUBDOMAIN(),
    tlsAutoProvision: TLS_AUTO_PROVISION(),
  };
};

/**
 * Export constants for models
 */
exports.DOMAIN_STATUS = {
  PENDING_VERIFICATION: "pending_verification",
  ACTIVE: "active",
  VERIFICATION_FAILED: "verification_failed",
  DELETING: "deleting",
  DELETED: "deleted",
};

exports.DOMAIN_TYPE = {
  CUSTOM: "custom",
  SUBDOMAIN: "subdomain",
};
