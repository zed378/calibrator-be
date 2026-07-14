/**
 * Database migrations (Umzug)
 *
 * Versioned, ordered schema/data migrations that run in addition to the
 * model-driven `db.sync()` used for base table creation. Use migrations for the
 * things `sync` cannot safely do on an existing database: column renames,
 * custom indexes (e.g. GIN/tsvector), backfills, and constraints.
 *
 * Migration files live in `src/migrations/*.js` and export:
 *   module.exports = {
 *     async up({ context })   { // context = Sequelize QueryInterface },
 *     async down({ context }) { ... },
 *   };
 *
 * Applied migrations are tracked in the `schema_migrations` table.
 */
const path = require("path");
const { Umzug, SequelizeStorage } = require("umzug");
const { db } = require("./index");
const { logger } = require("../middlewares/activityLog.middleware");

function fmt(o) {
  if (typeof o === "string") {
    return o;
  }
  if (o && o.event) {
    const dur = o.durationSeconds ? ` (${o.durationSeconds}s)` : "";
    const name = o.name ? ` ${o.name}` : "";
    return `${o.event}${name}${dur}`;
  }
  return JSON.stringify(o);
}

const migrator = new Umzug({
  migrations: {
    glob: ["*.js", { cwd: path.join(__dirname, "..", "migrations") }],
  },
  // Umzug v3 passes this object into migration handlers.
  // Your migrations expect: async up({ context }) => { ... }
  context: { queryInterface: db.getQueryInterface() },
  storage: new SequelizeStorage({
    sequelize: db,
    tableName: "schema_migrations",
  }),
  logger: {
    info: (o) => logger.info(`[migrate] ${fmt(o)}`),
    warn: (o) => logger.warn(`[migrate] ${fmt(o)}`),
    error: (o) => logger.error(`[migrate] ${fmt(o)}`),
    debug: () => {},
  },
});

module.exports = { migrator };
