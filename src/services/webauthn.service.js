const crypto = require("crypto");
const { Users } = require("../models");
const { AppError } = require("../utils/appError.util");
const { logger } = require("../middlewares/activityLog.middleware");

const RP_NAME = "Callibrator";
const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";

const challengeStore = new Map();

function base64urlEncode(buffer) {
  return Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str) {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) {
    b64 += "=";
  }
  return Buffer.from(b64, "base64");
}

function generateChallenge() {
  return crypto.randomBytes(32);
}

async function getCredentialOptions(user, existingCredentials = []) {
  const challenge = generateChallenge();
  const userHandle = crypto.createHash("sha256").update(user.id).digest();

  challengeStore.set(user.id, challenge);

  return {
    challenge: base64urlEncode(challenge),
    rp: { name: RP_NAME, id: RP_ID },
    user: {
      id: base64urlEncode(userHandle),
      name: user.email,
      displayName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    excludeCredentials: existingCredentials.map((cred) => ({
      id: cred.credentialId,
      type: "public-key",
      transports: cred.transports || ["usb", "nfc", "ble"],
    })),
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      requireResidentKey: true,
      residentKey: "required",
      userVerification: "required",
    },
    timeout: 60000,
    attestation: "none",
  };
}

async function getAssertionOptions(userId) {
  const challenge = generateChallenge();
  challengeStore.set(userId, challenge);

  return {
    challenge: base64urlEncode(challenge),
    rpId: RP_ID,
    allowCredentials: [],
    userVerification: "required",
    timeout: 60000,
  };
}

async function verifyAttestation(tenantId, userId, attestationResponse) {
  try {
    const { rawId, response } = attestationResponse;
    const credentialId = base64urlDecode(rawId);
    const clientDataJSON = base64urlDecode(response.clientDataJSON);

    const clientData = JSON.parse(clientDataJSON.toString("utf8"));

    if (clientData.type !== "webauthn.create") {
      throw new AppError(400, "Invalid attestation type");
    }

    const expectedChallenge = challengeStore.get(userId);
    if (!expectedChallenge || clientData.challenge !== base64urlEncode(expectedChallenge)) {
      throw new AppError(400, "Invalid challenge");
    }

    challengeStore.delete(userId);

    const publicKey = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    }).publicKey;

    const credentialPublicKey = publicKey.toString("base64");

    await Users.update(
      {
        webauthnCredentialId: credentialId.toString("hex"),
        webauthnPublicKey: credentialPublicKey,
        webauthnSignCount: 0,
        webauthnEnabled: true,
      },
      { where: { id: userId, tenantId } },
    );

    return { success: true };
  } catch (err) {
    logger.error("WebAuthn attestation verification failed", { error: err.message });
    throw new AppError(400, "WebAuthn registration failed");
  }
}

async function verifyAssertion(tenantId, userId, assertionResponse) {
  try {
    const { rawId, response } = assertionResponse;
    const credentialId = base64urlDecode(rawId);
    const clientDataJSON = base64urlDecode(response.clientDataJSON);

    const clientData = JSON.parse(clientDataJSON.toString("utf8"));

    if (clientData.type !== "webauthn.get") {
      throw new AppError(400, "Invalid assertion type");
    }

    const expectedChallenge = challengeStore.get(userId);
    if (!expectedChallenge || clientData.challenge !== base64urlEncode(expectedChallenge)) {
      throw new AppError(400, "Invalid challenge");
    }

    challengeStore.delete(userId);

    const user = await Users.findOne({ where: { id: userId, tenantId } });
    if (!user || !user.webauthnEnabled) {
      throw new AppError(404, "WebAuthn not enabled for this user");
    }

    if (user.webauthnCredentialId !== credentialId.toString("hex")) {
      throw new AppError(400, "Invalid credential ID");
    }

    await Users.update({ webauthnSignCount: user.webauthnSignCount + 1 }, { where: { id: userId } });

    return { success: true };
  } catch (err) {
    logger.error("WebAuthn assertion verification failed", { error: err.message });
    throw new AppError(401, "WebAuthn authentication failed");
  }
}

async function disableWebauthn(tenantId, userId) {
  await Users.update(
    { webauthnEnabled: false, webauthnCredentialId: null, webauthnPublicKey: null },
    { where: { id: userId, tenantId } },
  );

  return { success: true };
}

exports.getRegistrationOptions = getCredentialOptions;
exports.getLoginOptions = getAssertionOptions;
exports.verifyRegistration = verifyAttestation;
exports.verifyLogin = verifyAssertion;
exports.disable = disableWebauthn;
