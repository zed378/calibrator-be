/**
 * @swagger
 * tags:
 *   name: NetworkSecurity
 *   description: Network Security - IP Allowlist and Geofencing
 */

const express = require("express");
const router = express.Router();
const networkSecurityController = require("../../controllers/networkSecurity.controller");
const { auth, superAdminOnly } = require("../../middlewares/auth.middleware");

router.use(auth);

router.get("/ip-allowlist", networkSecurityController.getIpAllowlist);
router.put("/ip-allowlist", superAdminOnly, networkSecurityController.setIpAllowlist);
router.get("/geofence", networkSecurityController.getGeofence);
router.put("/geofence", superAdminOnly, networkSecurityController.setGeofence);
router.post("/evaluate-login", networkSecurityController.evaluateLogin);

module.exports = router;
