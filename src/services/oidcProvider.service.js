const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { TenantSettings } = require("../models");
const { AppError } = require("../utils/appError.util");

const OIDC_ISSUER = process.env.OIDC_ISSUER || "http://localhost:5000";
const OIDC_JWKS_KID = process.env.OIDC_JWKS_KID || "callibrator-oidc-key-1";

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

function buildJwks() {
  const publicKey = getPublicKey();
  const pem = publicKey.toString("utf8");
  const lines = pem.split("\n").filter((l) => l.trim() && !l.includes("BEGIN") && !l.includes("END"));
  const der = Buffer.from(lines.join(""), "base64");
  const view = new DataView(der.buffer);
  let i = 0;
  const readLen = () => {
    const n = view.getUint8(i++);
    if (n & 0x80) {
      const l = n & 0x7f;
      i += l;
      return l;
    }
    return n;
  };
  const readInt = () => {
    const n = view.getUint8(i++);
    const len = readLen();
    const arr = new Uint8Array(der.buffer, i, len);
    i += len;
    const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex;
  };
  view.getUint8(0);
  view.getUint8(1);
  const seq = view.getUint8(2);
  i = 3;
  if (seq === 0x30) {
    const l = readLen();
  }
  const algo = view.getUint8(i);
  i++;
  const algoLen = readLen();
  const nHex = readInt();
  const eHex = readInt();
  return {
    keys: [
      {
        kty: "RSA",
        use: "sig",
        kid: OIDC_JWKS_KID,
        alg: "RS256",
        n: nHex,
        e: eHex,
      },
    ],
  };
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

  await TenantSettings.upsert({
    tenantId,
    key: `oidc_client_${clientId}`,
    value: JSON.stringify({
      clientId,
      clientSecretHash: hashedSecret,
      name: data.name,
      redirectUris: data.redirectUris || [],
      scopes: data.scopes || ["openid", "profile", "email"],
      grantTypes: data.grantTypes || ["authorization_code"],
      createdAt: new Date(),
    }),
  });

  return {
    clientId,
    clientSecret,
    name: data.name,
    redirectUris: data.redirectUris,
    scopes: data.scopes,
    grantTypes: data.grantTypes,
  };
};

exports.getClients = async (tenantId) => {
  const settings = await TenantSettings.findAll({
    where: { tenantId, key: { [require("sequelize").Op.like]: "oidc_client_%" } },
  });

  return settings.map((s) => {
    const data = JSON.parse(s.value || "{}");
    return {
      clientId: data.clientId,
      name: data.name,
      redirectUris: data.redirectUris,
      scopes: data.scopes,
      grantTypes: data.grantTypes,
      createdAt: data.createdAt,
    };
  });
};

exports.rotateSecret = async (tenantId, clientId) => {
  const setting = await TenantSettings.findOne({
    where: { tenantId, key: `oidc_client_${clientId}` },
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
    { where: { tenantId, key: `oidc_client_${clientId}` } }
  );

  return { clientId, clientSecret: newSecret };
};

exports.deleteClient = async (tenantId, clientId) => {
  const deleted = await TenantSettings.destroy({
    where: { tenantId, key: `oidc_client_${clientId}` },
  });

  return { deleted: deleted > 0 };
};

function signToken(payload, expiresIn) {
  return jwt.sign(payload, getPrivateKey(), {
    algorithm: "RS256",
    expiresIn,
    issuer: OIDC_ISSUER,
    keyid: OIDC_JWKS_KID,
  });
}

exports.issueTokens = async (tenantId, user, scopes = ["openid", "profile", "email"]) => {
  const now = Math.floor(Date.now() / 1000);

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

  const idToken = signToken(
    {
      sub: user.id,
      email: user.email,
      given_name: user.firstName,
      family_name: user.lastName,
      tenant_id: tenantId,
      scope: scopes.join(" "),
      aud: user.email,
      iat: now,
      exp: now + 900,
      iss: OIDC_ISSUER,
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
    where: { tenantId, key: `oidc_client_${clientId}` },
  });

  if (!setting) {
    return false;
  }

  const data = JSON.parse(setting.value || "{}");
  const hashed = crypto.createHash("sha256").update(clientSecret).digest("hex");
  return hashed === data.clientSecretHash;
};

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

  await TenantSettings.upsert({
    tenantId,
    key: `oidc_client_${clientId}`,
    value: JSON.stringify({
      clientId,
      clientSecretHash: hashedSecret,
      name: data.name,
      redirectUris: data.redirectUris || [],
      scopes: data.scopes || ["openid", "profile", "email"],
      grantTypes: data.grantTypes || ["authorization_code"],
      createdAt: new Date(),
    }),
  });

  return {
    clientId,
    clientSecret,
    name: data.name,
    redirectUris: data.redirectUris,
    scopes: data.scopes,
    grantTypes: data.grantTypes,
  };
};

exports.getClients = async (tenantId) => {
  const settings = await TenantSettings.findAll({
    where: { tenantId, key: { [require("sequelize").Op.like]: "oidc_client_%" } },
  });

  return settings.map((s) => {
    const data = JSON.parse(s.value || "{}");
    return {
      clientId: data.clientId,
      name: data.name,
      redirectUris: data.redirectUris,
      scopes: data.scopes,
      grantTypes: data.grantTypes,
      createdAt: data.createdAt,
    };
  });
};

exports.rotateSecret = async (tenantId, clientId) => {
  const setting = await TenantSettings.findOne({
    where: { tenantId, key: `oidc_client_${clientId}` },
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
    { where: { tenantId, key: `oidc_client_${clientId}` } }
  );

  return { clientId, clientSecret: newSecret };
};

exports.deleteClient = async (tenantId, clientId) => {
  const deleted = await TenantSettings.destroy({
    where: { tenantId, key: `oidc_client_${clientId}` },
  });

  return { deleted: deleted > 0 };
};

exports.issueTokens = async (tenantId, user, scopes = ["openid", "profile", "email"]) => {
  const now = Math.floor(Date.now() / 1000);
  const accessTokenExp = now + 900;
  const refreshTokenExp = now + 7 * 24 * 60 * 60;

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

  const idToken = signToken(
    {
      sub: user.id,
      email: user.email,
      given_name: user.firstName,
      family_name: user.lastName,
      tenant_id: tenantId,
      scope: scopes.join(" "),
      aud: user.email,
      iat: now,
      exp: now + 900,
      iss: OIDC_ISSUER,
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
    where: { tenantId, key: `oidc_client_${clientId}` },
  });

  if (!setting) return false;

  const data = JSON.parse(setting.value || "{}");
  const hashed = crypto.createHash("sha256").update(clientSecret).digest("hex");
  return hashed === data.clientSecretHash;
};
