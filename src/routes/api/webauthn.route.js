/**
 * @swagger
 * tags:
 *   name: WebAuthn
 *   description: WebAuthn Passkey Authentication
 */

const express = require("express");
const router = express.Router();
const webauthnController = require("../../controllers/webauthn.controller");
const { auth } = require("../../middlewares/auth.middleware");

router.use(auth);

router.post("/registration-options", webauthnController.getRegistrationOptions);
router.post("/verify-registration", webauthnController.verifyRegistration);
router.post("/login-options", webauthnController.getLoginOptions);
router.post("/verify-login", webauthnController.verifyLogin);
router.post("/disable", webauthnController.disable);

module.exports = router;
