// src/services/virusScan.service.js
//
// Pluggable virus-scan hook for uploaded files. The default provider ("none")
// is a no-op that treats every file as clean, so the file pipeline works out of
// the box. Point VIRUS_SCAN_PROVIDER at a real scanner and implement the branch
// below (e.g. ClamAV via clamd) to enforce scanning in production.

const { logger } = require("../middlewares/activityLog.middleware");

/**
 * Scan a file on disk.
 * @param {string} absPath - Absolute path to the file.
 * @returns {Promise<{clean: boolean, provider: string, reason?: string}>}
 */
exports.scanFile = async (absPath) => {
  const provider = process.env.VIRUS_SCAN_PROVIDER || "none";

  if (provider === "none") {
    return { clean: true, provider };
  }

  // Extension point: integrate a real scanner here, e.g.
  //   if (provider === "clamav") { ...clamd scan(absPath)... }
  // Until one is wired, fail OPEN but warn loudly so misconfiguration is visible.
  logger.warn(
    `VIRUS_SCAN_PROVIDER="${provider}" is not implemented; passing "${absPath}" through unscanned`,
  );
  return { clean: true, provider, reason: "provider-not-implemented" };
};
