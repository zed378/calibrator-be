/**
 * @swagger
 * tags:
 *   name: SCIM
 *   description: SCIM v2 Provisioning Endpoints for Identity Providers
 */

const express = require("express");
const router = express.Router();
const scimController = require("../../controllers/scim.controller");
const { auth } = require("../../middlewares/auth.middleware");

// SCIM typically authenticates using a Bearer token (API Key).
// Our tryApiKeyAuth handles "Authorization: ApiKey <key>".
// We can use the existing `auth` middleware which supports this.
// NOTE: SCIM actually sends "Authorization: Bearer <token>".
// We will build a small shim middleware for SCIM specifically if needed,
// but for now `auth` is fine if the IdP is configured to send `ApiKey <key>`.
// However, standard SCIM uses `Bearer <token>`, so let's allow `auth`
// and instruct admins to configure the IdP to send the API Key as a Bearer token.
// The `auth` middleware treats `Bearer <token>` as JWT, which might fail.
// So we should add a tiny middleware here to rewrite Bearer -> ApiKey if it's an API Key.

const scimAuthShim = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ") && authHeader.length > 30 && !authHeader.includes(".")) {
    // Looks like an API key (no dots, not a JWT). Rewrite it.
    req.headers.authorization = authHeader.replace("Bearer ", "ApiKey ");
  }
  next();
};

router.use(scimAuthShim);
router.use(auth);

// We should also verify that the authenticated user is a service account/API key
// or has super admin privileges, not just a random user.
const requireApiKeyOrAdmin = (req, res, next) => {
  if (req.user?.isApiKey || req.user?.role?.name === "SUPER_ADMIN" || req.user?.role?.name === "SUPERADMIN") {
    return next();
  }
  return res.status(403).json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "SCIM endpoints require an API Key", status: "403" });
};

router.use(requireApiKeyOrAdmin);

/**
 * @swagger
 * /api/v1/scim/v2/Users:
 *   get:
 *     tags: [SCIM]
 *     summary: Get all provisioned users
 */
router.get("/Users", scimController.getUsers);

/**
 * @swagger
 * /api/v1/scim/v2/Users/{id}:
 *   get:
 *     tags: [SCIM]
 *     summary: Get a specific user
 */
router.get("/Users/:id", scimController.getUserById);

/**
 * @swagger
 * /api/v1/scim/v2/Users:
 *   post:
 *     tags: [SCIM]
 *     summary: Provision a new user
 */
router.post("/Users", scimController.createUser);

/**
 * @swagger
 * /api/v1/scim/v2/Users/{id}:
 *   put:
 *     tags: [SCIM]
 *     summary: Update a user completely
 */
router.put("/Users/:id", scimController.updateUser);

/**
 * @swagger
 * /api/v1/scim/v2/Users/{id}:
 *   patch:
 *     tags: [SCIM]
 *     summary: Partially update a user (e.g. deactivate)
 */
router.patch("/Users/:id", scimController.patchUser);

router.delete("/Users/:id", scimController.deleteUser);

router.get("/Groups", scimController.getGroups);
router.get("/Groups/:id", scimController.getGroupById);
router.post("/Groups", scimController.createGroup);
router.put("/Groups/:id", scimController.updateGroup);
router.patch("/Groups/:id", scimController.patchGroup);
router.delete("/Groups/:id", scimController.deleteGroup);

module.exports = router;
