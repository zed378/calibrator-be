const express = require("express");
const router = express.Router();
const { auth, superAdminOnly } = require("../../middlewares/auth.middleware");
const { forbidden } = require("../../utils/response.util");
const {
  migrate,
  dropTable,
  seeding,
  unseeding,
} = require("../../controllers/migration.controller");

/**
 * Guard for destructive, irreversible migration operations (drop / unseed).
 * These must never be executable in production and require an explicit
 * opt-in flag even in non-production environments — in addition to
 * super-admin authentication.
 */
const allowDestructive = (req, res, next) => {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ALLOW_DESTRUCTIVE_MIGRATION !== "true"
  ) {
    return forbidden(
      res,
      "Destructive migration operations are disabled. Set ALLOW_DESTRUCTIVE_MIGRATION=true in a non-production environment to enable.",
    );
  }
  return next();
};

/**
 * Guard for bootstrap-capable operations (migrate / seed).
 *
 * A fresh database has no super-admin yet, so seeding must be reachable
 * during first-boot. This guard allows the request when an explicit
 * bootstrap flag (ALLOW_SEEDING=true) is set; otherwise it falls back to
 * standard super-admin authentication. It is fail-closed: with no flag and
 * no valid super-admin token, the request is rejected.
 */
const superAdminOrBootstrap = (req, res, next) => {
  if (process.env.ALLOW_SEEDING === "true") {
    return next();
  }
  return auth(req, res, (err) =>
    err ? next(err) : superAdminOnly(req, res, next),
  );
};

/**
 * @swagger
 * tags:
 *   name: Migration
 *   description: Database migration endpoints
 */

/**
 * @swagger
 * /api/v1/migration/up:
 *   get:
 *     summary: Run database migration
 *     tags:
 *       - Migration
 *     responses:
 *       '200':
 *         description: Migration successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Database table migrate success
 *       '400':
 *         description: Migration failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 status:
 *                   type: integer
 *                   example: 400
 *                 message:
 *                   type: string
 *                   example: Something went wrong while running migrations
 */
router.get("/up", superAdminOrBootstrap, migrate);

/**
 * @swagger
 * /api/v1/migration/down:
 *   get:
 *     summary: Drop database tables
 *     tags:
 *       - Migration
 *     responses:
 *       '200':
 *         description: Drop successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Database table drop successfully
 *       '400':
 *         description: Drop failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 status:
 *                   type: integer
 *                   example: 400
 *                 message:
 *                   type: string
 *                   example: Failed to drop tables
 */
router.get("/down", auth, superAdminOnly, allowDestructive, dropTable);

/**
 * @swagger
 * /api/v1/migration/seeding:
 *   get:
 *     summary: Seed database with initial data
 *     tags:
 *       - Migration
 *     responses:
 *       '200':
 *         description: Seeding successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Seeding success
 *       '400':
 *         description: Seeding failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 status:
 *                   type: integer
 *                   example: 400
 *                 message:
 *                   type: string
 *                   example: Seeding failed
 */
router.get("/seeding", superAdminOrBootstrap, seeding);

/**
 * @swagger
 * /api/v1/migration/unseeding:
 *   get:
 *     summary: Remove seeded data from the database
 *     tags:
 *       - Migration
 *     responses:
 *       '200':
 *         description: Unseeding successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Unseeding success
 *       '400':
 *         description: Unseeding failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 status:
 *                   type: integer
 *                   example: 400
 *                 message:
 *                   type: string
 *                   example: Unseeding failed
 */
router.get("/unseeding", auth, superAdminOnly, allowDestructive, unseeding);

module.exports = router;
