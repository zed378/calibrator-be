/**
 * Custom Domains Service
 *
 * Manages per-tenant custom domains (vanity subdomains, CNAME records, TLS
 * certificates). Backed by the CustomDomain model. Domain-management operations
 * are keyed by the domain record id (matching the controller contract); tenant
 * resolution is by hostname.
 *
 * Usage:
 *   const svc = require('./services/customDomains.service');
 *   await svc.addDomain(tenantId, { domain: 'app.example.com', type: 'subdomain' });
 *   const tenant = await svc.resolveTenantByDomain('app.example.com');
 */

const crypto = require("crypto");
const { logger } = require("../middlewares/activityLog.middleware");
const { AppError } = require("../utils/appError.util");
const { db } = require("../config");

// ==========================================
// CONFIGURATION
// ==========================================

const CUSTOM_DOMAINS_ENABLED = () =>
  process.env.CUSTOM_DOMAINS_ENABLED === "true";
const DEFAULT_SUBDOMAIN = () => process.env.DEFAULT_SUBDOMAIN || "app";
const DNS_CHECK_INTERVAL = () => parseInt(process.env.DNS_CHECK_INTERVAL) || 300;
const TLS_AUTO_PROVISION = () => process.env.TLS_AUTO_PROVISION === "true";

const DOMAIN_STATUS = {
  PENDING_VERIFICATION: "pending_verification",
  ACTIVE: "active",
  VERIFICATION_FAILED: "verification_failed",
  DELETING: "deleting",
  DELETED: "deleted",
};

const DOMAIN_TYPE = {
  CUSTOM: "custom",
  SUBDOMAIN: "subdomain",
  VANITY: "vanity",
};

// ==========================================
// HELPERS
// ==========================================

/** Validate domain format. */
function isValidDomain(domain) {
  const domainRegex =
    /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[A-Za-z]{2,}$/;
  return domainRegex.test(domain);
}

function generateVerificationToken() {
  return `callibrator-verify=${crypto.randomBytes(16).toString("hex")}`;
}

/**
 * Check the DNS TXT record for domain ownership.
 * NOTE: simulated. In production use dns.resolveTxt(`_domain_verify.${domain}`)
 * and confirm the expected token is present.
 */
async function checkDnsTxtRecord(domain /*, expectedToken */) {
  logger.debug("DNS TXT check simulated", { domain });
  return true;
}

/** DNS records the tenant must add to verify + route their domain. */
function getDnsVerificationInstructions(domain, token) {
  return {
    verification: {
      type: "TXT",
      name: `_domain_verify.${domain}`,
      value: token || "callibrator-verify=[TOKEN]",
    },
    cname: {
      type: "CNAME",
      name: domain,
      value: "cname.callibrator.io.",
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

/** Load a tenant-owned domain record by id (404 if absent). */
async function loadOwned(tenantId, domainId) {
  const { CustomDomain } = require("../models");
  const record = await CustomDomain.findOne({
    where: { id: domainId, tenantId },
  });
  if (!record) {
    throw new AppError(404, "Domain not found");
  }
  return record;
}

/** Notify the tenant admin that a domain needs verification (best-effort). */
async function sendDomainVerificationEmail(tenantId, domain) {
  try {
    const { User } = require("../models");
    const admin = await User.findOne({
      where: { tenantId },
      order: [["createdAt", "ASC"]],
    });

    if (admin && admin.email) {
      const { emailQueueService } = require("../services/emailQueue.service");
      await emailQueueService.queueEmail({
        to: admin.email,
        subject: `Verify domain: ${domain}`,
        template: "domain-verification",
        data: { domain, verificationUrl: `https://${domain}/verify` },
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
// DOMAIN MANAGEMENT
// ==========================================

/**
 * List a tenant's (non-deleted) domains.
 */
exports.getTenantDomains = async (tenantId) => {
  try {
    const { CustomDomain } = require("../models");
    return await CustomDomain.findAll({
      where: { tenantId, status: { [db.Sequelize.Op.ne]: DOMAIN_STATUS.DELETED } },
      order: [["createdAt", "DESC"]],
    });
  } catch (err) {
    logger.error("Failed to get tenant domains", {
      tenantId,
      error: err.message,
    });
    return [];
  }
};

/**
 * Add a custom domain. Accepts either a string domain or an
 * { domain, type, sslEnabled } object (the controller passes the object form).
 */
exports.addDomain = async (tenantId, domainInput, typeArg = "subdomain") => {
  if (!CUSTOM_DOMAINS_ENABLED()) {
    throw new AppError(400, "Custom domains are disabled");
  }

  let domain;
  let type = typeArg;
  let sslEnabled = true;
  if (domainInput && typeof domainInput === "object") {
    domain = domainInput.domain;
    type = domainInput.type || "subdomain";
    sslEnabled = domainInput.sslEnabled !== false;
  } else {
    domain = domainInput;
  }

  if (!tenantId || !domain) {
    throw new AppError(400, "tenantId and domain are required");
  }
  if (!isValidDomain(domain)) {
    throw new AppError(400, "Invalid domain format");
  }

  const existing = await exports.getDomainByDomain(domain);
  if (existing) {
    throw new AppError(409, "Domain already assigned to another tenant");
  }

  try {
    const { CustomDomain } = require("../models");
    const verificationToken = generateVerificationToken();
    const record = await CustomDomain.create({
      tenantId,
      domain,
      domainType: type,
      sslEnabled,
      status: DOMAIN_STATUS.PENDING_VERIFICATION,
      verificationToken,
    });

    await sendDomainVerificationEmail(tenantId, domain);
    logger.info("Custom domain added", { tenantId, domain, type });

    return {
      id: record.id,
      domain: record.domain,
      status: record.status,
      sslEnabled: record.sslEnabled,
      verification: getDnsVerificationInstructions(domain, verificationToken),
    };
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    logger.error("Failed to add domain", {
      tenantId,
      domain,
      error: err.message,
    });
    throw new AppError(500, "Failed to add domain");
  }
};

/**
 * Verify a domain (by record id) via its DNS TXT record.
 */
exports.verifyDomain = async (tenantId, domainId) => {
  if (!CUSTOM_DOMAINS_ENABLED()) {
    return { verified: false, reason: "Custom domains disabled" };
  }

  const record = await loadOwned(tenantId, domainId);
  const token = record.verificationToken || generateVerificationToken();

  try {
    const verified = await checkDnsTxtRecord(record.domain, token);
    await record.update({
      status: verified
        ? DOMAIN_STATUS.ACTIVE
        : DOMAIN_STATUS.VERIFICATION_FAILED,
      verifiedAt: verified ? new Date() : null,
      lastCheckedAt: new Date(),
    });

    return {
      verified,
      status: record.status,
      record: verified ? token : null,
      dnsRecord: {
        type: "CNAME",
        name: `_domain_verify.${record.domain}`,
        value: token,
      },
    };
  } catch (err) {
    logger.error("Domain verification failed", {
      domainId,
      error: err.message,
    });
    return { verified: false, reason: err.message };
  }
};

/**
 * Remove a domain (by record id) — soft delete (status = deleted).
 */
exports.removeDomain = async (tenantId, domainId) => {
  if (!tenantId || !domainId) {
    throw new AppError(400, "tenantId and domainId are required");
  }

  const record = await loadOwned(tenantId, domainId);

  try {
    await record.update({ status: DOMAIN_STATUS.DELETED, isDefault: false });
    logger.info("Custom domain removed", { tenantId, domainId });
    return { success: true, id: record.id };
  } catch (err) {
    logger.error("Failed to remove domain", {
      tenantId,
      domainId,
      error: err.message,
    });
    throw new AppError(500, "Failed to remove domain");
  }
};

/**
 * Get the status of a domain (by record id).
 */
exports.getDomainStatus = async (tenantId, domainId) => {
  const record = await loadOwned(tenantId, domainId);
  return {
    id: record.id,
    domain: record.domain,
    status: record.status,
    sslEnabled: record.sslEnabled,
    isDefault: record.isDefault,
    verifiedAt: record.verifiedAt,
    lastCheckedAt: record.lastCheckedAt,
  };
};

/**
 * Set a domain (by record id) as the tenant's default, clearing the flag on the
 * tenant's other domains.
 */
exports.setDefaultDomain = async (tenantId, domainId) => {
  const record = await loadOwned(tenantId, domainId);
  if (record.status === DOMAIN_STATUS.DELETED) {
    throw new AppError(400, "A deleted domain cannot be set as default");
  }

  const { CustomDomain } = require("../models");
  await CustomDomain.update({ isDefault: false }, { where: { tenantId } });
  await record.update({ isDefault: true });

  logger.info("Default domain set", { tenantId, domainId });
  return { id: record.id, domain: record.domain, isDefault: true };
};

/**
 * Get the DNS records a tenant must configure for a domain (by record id).
 */
exports.getDnsRecords = async (tenantId, domainId) => {
  const record = await loadOwned(tenantId, domainId);
  return getDnsVerificationInstructions(record.domain, record.verificationToken);
};

/**
 * Find an active domain by its domain name (used for dedupe + resolution).
 */
exports.getDomainByDomain = async (domain) => {
  try {
    const { CustomDomain } = require("../models");
    return await CustomDomain.findOne({
      where: {
        domain,
        status: { [db.Sequelize.Op.ne]: DOMAIN_STATUS.DELETED },
      },
    });
  } catch (err) {
    logger.error("Failed to get domain", { domain, error: err.message });
    return null;
  }
};

// ==========================================
// TENANT RESOLUTION
// ==========================================

/**
 * Resolve a tenant by request hostname. Runs pre-auth (no tenant context) so it
 * matches across all tenants.
 */
exports.resolveTenantByDomain = async (hostname) => {
  if (!CUSTOM_DOMAINS_ENABLED()) {
    return null;
  }

  try {
    const { CustomDomain } = require("../models");
    const domainRecord = await CustomDomain.findOne({
      where: { domain: hostname, status: DOMAIN_STATUS.ACTIVE },
    });

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

// ==========================================
// TLS CERTIFICATE MANAGEMENT
// ==========================================

/**
 * Provision a TLS certificate for a domain (simulated Let's Encrypt).
 */
exports.provisionTLSCertificate = async (domain) => {
  if (!TLS_AUTO_PROVISION()) {
    return { success: false, reason: "TLS auto-provisioning disabled" };
  }

  try {
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
// UTILITIES
// ==========================================

exports.getStatus = () => ({
  enabled: CUSTOM_DOMAINS_ENABLED(),
  defaultSubdomain: DEFAULT_SUBDOMAIN(),
  dnsCheckInterval: DNS_CHECK_INTERVAL(),
  tlsAutoProvision: TLS_AUTO_PROVISION(),
});

exports.DOMAIN_STATUS = DOMAIN_STATUS;
exports.DOMAIN_TYPE = DOMAIN_TYPE;
