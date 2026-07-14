const fs = require("fs");
const swaggerUi = require("swagger-ui-express");

const appPath = require("../utils/appPath.util");

const swaggerSpec = JSON.parse(
  fs.readFileSync(appPath("swagger.json"), "utf8"),
);

// Remove xSession API Key scheme — it conflicts with bearerAuth JWT
// and causes Swagger UI to prompt for the wrong auth header.
// Keep bearerAuth scheme for proper Bearer token authentication in Swagger UI.
if (swaggerSpec.components?.securitySchemes) {
  delete swaggerSpec.components.securitySchemes.xSession;
}
if (swaggerSpec.securityDefinitions) {
  delete swaggerSpec.securityDefinitions.xSession;
}

const swaggerDocs = (app) => {
  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      explorer: true,

      swaggerOptions: {
        persistAuthorization: true,
        // Use bearerAuth (JWT) instead of the incorrect xSession API key
        security: [{ bearerAuth: [] }],
      },
    }),
  );
};

module.exports = {
  swaggerDocs,
};
