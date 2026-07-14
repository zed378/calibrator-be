const oidcProviderService = require("../services/oidcProvider.service");
const { asyncHandler } = require("../utils/controllerWrapper.util");
const { success } = require("../utils/response.util");
const { auth, superAdminOnly } = require("../middlewares/auth.middleware");
const { oidcClientSchema, validate } = require("../validators/oidc.validator");

exports.discover = asyncHandler(async (req, res) => {
  const config = oidcProviderService.discover();
  success(res, config, null, "OIDC discovery");
});

exports.jwks = asyncHandler(async (req, res) => {
  const jwks = oidcProviderService.jwks();
  success(res, jwks, null, "JWKS");
});

exports.registerClient = asyncHandler(async (req, res) => {
  const validated = validate(req.body, oidcClientSchema);
  const result = await oidcProviderService.registerClient(req.user?.tenantId, validated);
  success(res, result, null, "OIDC client registered");
});

exports.getClients = asyncHandler(async (req, res) => {
  const result = await oidcProviderService.getClients(req.user?.tenantId);
  success(res, result, null, "Fetch OIDC clients");
});

exports.rotateSecret = asyncHandler(async (req, res) => {
  const { clientId } = req.params;
  const result = await oidcProviderService.rotateSecret(req.user?.tenantId, clientId);
  success(res, result, null, "Client secret rotated");
});

exports.deleteClient = asyncHandler(async (req, res) => {
  const { clientId } = req.params;
  const result = await oidcProviderService.deleteClient(req.user?.tenantId, clientId);
  success(res, result, null, "OIDC client deleted");
});
