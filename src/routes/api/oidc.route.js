/**
 * @swagger
 * tags:
 *   name: OIDC
 *   description: OpenID Connect Provider
 */

const express = require("express");
const router = express.Router();
const oidcController = require("../../controllers/oidcProvider.controller");
const { auth, superAdminOnly } = require("../../middlewares/auth.middleware");

router.use(auth);

router.get("/.well-known/openid-configuration", oidcController.discover);
router.get("/.well-known/jwks.json", oidcController.jwks);
router.post("/clients", superAdminOnly, oidcController.registerClient);
router.get("/clients", oidcController.getClients);
router.post("/clients/:clientId/rotate-secret", superAdminOnly, oidcController.rotateSecret);
router.delete("/clients/:clientId", superAdminOnly, oidcController.deleteClient);

module.exports = router;
