const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const { TenantSettings } = require("../models");
const { AppError } = require("../utils/appError.util");

const OIDC_ISSUER = process.env.OIDC_ISSUER || "http://localhost:5000";
const OIDC_JWKS_KID = process.env.OIDC_JWKS_KID || "callibrator-oidc-key-1";

/**
 * TenantSettings key prefix for clients registered against THIS server's OIDC
 * provider.
 *
 * Deliberately not "oidc_client_": the SSO feature already stores an
 * (encrypted, non-JSON) setting called `oidc_client_secret`, which a
 * `LIKE 'oidc_client_%'` scan picked up and then tried to JSON.parse — 500ing
 * GET /oidc/clients. Note `_` is also a single-char wildcard in SQL LIKE, so
 * the two namespaces could never be separated by escaping alone.
 */
const CLIENT_KEY_PREFIX = "oidc_rp_";
const clientKey = (clientId) => `${CLIENT_KEY_PREFIX}${clientId}`;

function generateRsaKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

const keyPair = generateRsaKeyPair();

const getPublicKey = () => keyPair.publicKey;
const getPrivateKey = () => keyPair.privateKey;

/**
 * Build the public JWKS.
 *
 * This delegates to Node's own SPKI->JWK export instead of walking the DER by
 * hand. The previous hand-rolled parser had three defects, all fixed here:
 *
 *  1. SECURITY: `new DataView(der.buffer)` ignored `der.byteOffset`. Buffers
 *     under 4KB are slices of Node's shared 64KB pool, so the parser read from
 *     the START OF THE POOL — i.e. whatever unrelated Buffer happened to live
 *     there — and published it as the modulus on the PUBLIC, unauthenticated
 *     /oidc/.well-known/jwks.json endpoint. That leaked adjacent heap memory.
 *  2. `readLen()` returned the NUMBER OF LENGTH BYTES for long-form lengths
 *     rather than the decoded length, so the walk was misaligned anyway.
 *  3. `n`/`e` were hex-encoded; RFC 7517 requires base64url (`e` must be
 *     "AQAB", not "010001"), so no relying party could verify a token.
 *
 * crypto.createPublicKey().export({ format: "jwk" }) returns correctly
 * base64url-encoded { kty, n, e }.
 */
function buildJwks() {
  const { kty, n, e } = crypto
    .createPublicKey(getPublicKey())
    .export({ format: "jwk" });

  return {
    keys: [
      {
        kty,
        use: "sig",
        kid: OIDC_JWKS_KID,
        alg: "RS256",
        n,
        e,
      },
    ],
  };
}

function signToken(payload, expiresIn) {
  return jwt.sign(payload, getPrivateKey(), {
    algorithm: "RS256",
    expiresIn,
    issuer: OIDC_ISSUER,
    keyid: OIDC_JWKS_KID,
  });
}

/** Read a stored client record, tolerating a corrupt or foreign (non-JSON) row. */
function parseClientSetting(setting) {
  try {
    const data = JSON.parse(setting.value || "{}");
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

exports.discover = () => ({
  issuer: OIDC_ISSUER,
  authorization_endpoint: `${OIDC_ISSUER}/oidc/authorize`,
  token_endpoint: `${OIDC_ISSUER}/oidc/token`,
  userinfo_endpoint: `${OIDC_ISSUER}/oidc/userinfo`,
  jwks_uri: `${OIDC_ISSUER}/oidc/.well-known/jwks.json`,
  scopes_supported: ["openid", "profile", "email", "offline_access"],
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["RS256"],
});

exports.jwks = () => buildJwks();

exports.registerClient = async (tenantId, data) => {
  const clientId = crypto.randomUUID();
  const clientSecret = crypto.randomBytes(32).toString("hex");
  const hashedSecret = crypto.createHash("sha256").update(clientSecret).digest("hex");

  const scopes = data.scopes || ["openid", "profile", "email"];
  const grantTypes = data.grantTypes || ["authorization_code"];

  await TenantSettings.upsert({
    tenantId,
    key: clientKey(clientId),
    value: JSON.stringify({
      clientId,
      clientSecretHash: hashedSecret,
      name: data.name,
      redirectUris: data.redirectUris || [],
      scopes,
      grantTypes,
      createdAt: new Date(),
    }),
  });

  // The plaintext secret is returned exactly once; only the hash is stored.
  return {
    clientId,
    clientSecret,
    name: data.name,
    redirectUris: data.redirectUris || [],
    scopes,
    grantTypes,
  };
};

exports.getClients = async (tenantId) => {
  const settings = await TenantSettings.findAll({
    where: { tenantId, key: { [Op.like]: `${CLIENT_KEY_PREFIX}%` } },
  });

  return settings
    .map(parseClientSetting)
    // A row without a clientId is not one of ours — skip rather than 500.
    .filter((data) => data && data.clientId)
    .map((data) => ({
      clientId: data.clientId,
      name: data.name,
      redirectUris: data.redirectUris,
      scopes: data.scopes,
      grantTypes: data.grantTypes,
      createdAt: data.createdAt,
    }));
};

exports.rotateSecret = async (tenantId, clientId) => {
  const setting = await TenantSettings.findOne({
    where: { tenantId, key: clientKey(clientId) },
  });

  if (!setting) {
    throw new AppError(404, "OIDC client not found");
  }

  const newSecret = crypto.randomBytes(32).toString("hex");
  const hashedSecret = crypto.createHash("sha256").update(newSecret).digest("hex");

  const data = JSON.parse(setting.value || "{}");
  data.clientSecretHash = hashedSecret;
  data.rotatedAt = new Date();

  await TenantSettings.update(
    { value: JSON.stringify(data) },
    { where: { tenantId, key: clientKey(clientId) } },
  );

  return { clientId, clientSecret: newSecret };
};

exports.deleteClient = async (tenantId, clientId) => {
  const deleted = await TenantSettings.destroy({
    where: { tenantId, key: clientKey(clientId) },
  });

  return { deleted: deleted > 0 };
};

exports.issueTokens = async (tenantId, user, scopes = ["openid", "profile", "email"]) => {
  const accessToken = signToken(
    {
      sub: user.id,
      email: user.email,
      tenant_id: tenantId,
      scope: scopes.join(" "),
      typ: "access",
    },
    "15m",
  );

  // No `iat`/`exp`/`iss` in the payload: signToken already passes
  // expiresIn + issuer, and jsonwebtoken REFUSES to sign when the payload
  // carries its own `exp` alongside options.expiresIn
  // ("Bad "options.expiresIn" option the payload already has an "exp"
  // property"). This threw on every call, so issueTokens never worked.
  const idToken = signToken(
    {
      sub: user.id,
      email: user.email,
      given_name: user.firstName,
      family_name: user.lastName,
      tenant_id: tenantId,
      scope: scopes.join(" "),
      aud: user.email,
    },
    "15m",
  );

  const refreshToken = crypto.randomBytes(64).toString("hex");

  return {
    access_token: accessToken,
    id_token: idToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: 900,
    scope: scopes.join(" "),
  };
};

exports.verifySecret = async (tenantId, clientId, clientSecret) => {
  const setting = await TenantSettings.findOne({
    where: { tenantId, key: clientKey(clientId) },
  });

  if (!setting) {
    return false;
  }

  const data = parseClientSetting(setting);
  if (!data || !data.clientSecretHash) {
    return false;
  }

  const hashed = Buffer.from(
    crypto.createHash("sha256").update(clientSecret).digest("hex"),
    "hex",
  );
  const stored = Buffer.from(data.clientSecretHash, "hex");

  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  if (hashed.length !== stored.length) {
    return false;
  }
  return crypto.timingSafeEqual(hashed, stored);
};
