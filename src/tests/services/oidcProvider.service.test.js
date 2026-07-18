jest.mock("../../models", () => ({
  TenantSettings: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
  },
}));

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");

const oidc = require("../../services/oidcProvider.service");
const { TenantSettings } = require("../../models");

describe("oidcProvider.service", () => {
  beforeEach(() => jest.clearAllMocks());

  it("discover returns OIDC metadata", () => {
    const result = oidc.discover();
    expect(result.issuer).toBeDefined();
    expect(result.authorization_endpoint).toContain("/oidc/authorize");
    expect(result.jwks_uri).toContain("/oidc/.well-known/jwks.json");
  });

  it("jwks returns public key set", () => {
    const result = oidc.jwks();
    expect(result.keys).toHaveLength(1);
    expect(result.keys[0].kty).toBe("RSA");
    expect(result.keys[0].alg).toBe("RS256");
  });

  it("jwks advertises the signing kid and use", () => {
    const [key] = oidc.jwks().keys;
    expect(key.use).toBe("sig");
    expect(key.kid).toBe(process.env.OIDC_JWKS_KID || "callibrator-oidc-key-1");
    expect(typeof key.n).toBe("string");
    expect(typeof key.e).toBe("string");
  });

  describe("jwks key material", () => {
    // The service builds its key pair at module load, so load isolated instances
    // with a key pair we control in order to assert on the published material.
    const loadWithKey = (modulusLength) => {
      const keys = crypto.generateKeyPairSync("rsa", {
        modulusLength,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      let mod;
      jest.isolateModules(() => {
        const spy = jest
          .spyOn(crypto, "generateKeyPairSync")
          .mockReturnValue(keys);
        mod = require("../../services/oidcProvider.service");
        spy.mockRestore();
      });
      return { mod, keys };
    };

    // REGRESSION: buildJwks used to hand-roll a DER walk that was broken three
    // ways — it ignored der.byteOffset (publishing adjacent heap memory from
    // Node's shared Buffer pool onto this PUBLIC endpoint), mis-decoded
    // long-form lengths, and hex-encoded n/e instead of base64url. It now
    // delegates to Node's SPKI->JWK export.
    it("publishes the real modulus and exponent, base64url-encoded", () => {
      const { mod, keys } = loadWithKey(2048);
      const expected = crypto
        .createPublicKey(keys.publicKey)
        .export({ format: "jwk" });

      const [key] = mod.jwks().keys;

      expect(key.e).toBe(expected.e); // "AQAB"
      expect(key.n).toBe(expected.n);
      expect(key.n).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, never hex
    });

    it("does not leak pool memory for a small key", () => {
      // A 512-bit key's DER is well under 4KB, so it lives at a non-zero
      // byteOffset in the shared pool — the exact condition the old parser
      // mishandled.
      const { mod, keys } = loadWithKey(512);
      const expected = crypto
        .createPublicKey(keys.publicKey)
        .export({ format: "jwk" });

      const [key] = mod.jwks().keys;

      expect(key.n).toBe(expected.n);
    });
  });

  describe("registerClient", () => {
    it("creates client and returns secret", async () => {
      TenantSettings.upsert.mockResolvedValue({});
      const result = await oidc.registerClient("t1", { name: "Test App", redirectUris: ["http://localhost"] });
      expect(result.clientId).toBeDefined();
      expect(result.clientSecret).toBeDefined();
      expect(result.name).toBe("Test App");
    });

    it("stores only a hash of the secret, under the oidc_rp_ namespace", async () => {
      TenantSettings.upsert.mockResolvedValue({});

      const result = await oidc.registerClient("t1", { name: "App", redirectUris: ["http://cb"] });

      const row = TenantSettings.upsert.mock.calls[0][0];
      expect(row.tenantId).toBe("t1");
      expect(row.key).toBe(`oidc_rp_${result.clientId}`);
      // Must not collide with the SSO feature's `oidc_client_secret` setting.
      expect(row.key.startsWith("oidc_client_")).toBe(false);

      const stored = JSON.parse(row.value);
      expect(stored.clientSecretHash).toBe(
        crypto.createHash("sha256").update(result.clientSecret).digest("hex"),
      );
      expect(row.value).not.toContain(result.clientSecret);
    });

    it("defaults scopes, grantTypes and redirectUris when omitted", async () => {
      TenantSettings.upsert.mockResolvedValue({});

      const result = await oidc.registerClient("t1", { name: "App" });

      expect(result.scopes).toEqual(["openid", "profile", "email"]);
      expect(result.grantTypes).toEqual(["authorization_code"]);
      expect(result.redirectUris).toEqual([]);
      const stored = JSON.parse(TenantSettings.upsert.mock.calls[0][0].value);
      expect(stored.redirectUris).toEqual([]);
    });

    it("honours explicitly supplied scopes and grantTypes", async () => {
      TenantSettings.upsert.mockResolvedValue({});

      const result = await oidc.registerClient("t1", {
        name: "App",
        scopes: ["openid"],
        grantTypes: ["refresh_token"],
        redirectUris: ["http://cb"],
      });

      expect(result.scopes).toEqual(["openid"]);
      expect(result.grantTypes).toEqual(["refresh_token"]);
      expect(result.redirectUris).toEqual(["http://cb"]);
    });
  });

  describe("getClients", () => {
    it("lists registered clients", async () => {
      TenantSettings.findAll.mockResolvedValue([
        { value: JSON.stringify({ clientId: "c1", name: "App", redirectUris: [], scopes: [], grantTypes: [] }) },
      ]);
      const result = await oidc.getClients("t1");
      expect(result).toHaveLength(1);
      expect(result[0].clientId).toBe("c1");
    });

    it("scans only the oidc_rp_ key namespace for the tenant", async () => {
      TenantSettings.findAll.mockResolvedValue([]);

      await oidc.getClients("t1");

      expect(TenantSettings.findAll).toHaveBeenCalledWith({
        where: { tenantId: "t1", key: { [Op.like]: "oidc_rp_%" } },
      });
    });

    it("skips corrupt, foreign and empty rows instead of throwing", async () => {
      TenantSettings.findAll.mockResolvedValue([
        { value: "this-is-not-json" }, // e.g. an encrypted SSO secret
        { value: "null" }, // parses, but is not an object
        { value: "\"a string\"" }, // parses to a non-object
        {}, // no value at all -> treated as {}
        { value: JSON.stringify({ name: "no client id" }) },
        { value: JSON.stringify({ clientId: "c1", name: "Real", redirectUris: ["u"], scopes: ["openid"], grantTypes: ["authorization_code"], createdAt: "2025-01-01" }) },
      ]);

      const result = await oidc.getClients("t1");

      expect(result).toEqual([
        {
          clientId: "c1",
          name: "Real",
          redirectUris: ["u"],
          scopes: ["openid"],
          grantTypes: ["authorization_code"],
          createdAt: "2025-01-01",
        },
      ]);
    });

    it("never exposes the stored secret hash", async () => {
      TenantSettings.findAll.mockResolvedValue([
        { value: JSON.stringify({ clientId: "c1", name: "App", clientSecretHash: "deadbeef" }) },
      ]);

      const result = await oidc.getClients("t1");

      expect(result[0]).not.toHaveProperty("clientSecretHash");
    });
  });

  describe("rotateSecret", () => {
    it("generates new secret", async () => {
      TenantSettings.findOne.mockResolvedValue({ value: JSON.stringify({ clientId: "c1", clientSecretHash: "old" }) });
      TenantSettings.update.mockResolvedValue([1]);
      const result = await oidc.rotateSecret("t1", "c1");
      expect(result.clientSecret).toBeDefined();
      expect(result.clientId).toBe("c1");
    });

    it("persists the new hash and a rotatedAt stamp, preserving other fields", async () => {
      TenantSettings.findOne.mockResolvedValue({
        value: JSON.stringify({ clientId: "c1", name: "App", clientSecretHash: "old" }),
      });
      TenantSettings.update.mockResolvedValue([1]);

      const result = await oidc.rotateSecret("t1", "c1");

      const [values, options] = TenantSettings.update.mock.calls[0];
      const stored = JSON.parse(values.value);
      expect(stored.clientSecretHash).toBe(
        crypto.createHash("sha256").update(result.clientSecret).digest("hex"),
      );
      expect(stored.clientSecretHash).not.toBe("old");
      expect(stored.name).toBe("App");
      expect(stored.rotatedAt).toBeDefined();
      expect(options).toEqual({ where: { tenantId: "t1", key: "oidc_rp_c1" } });
    });

    it("tolerates a row with no value", async () => {
      TenantSettings.findOne.mockResolvedValue({});
      TenantSettings.update.mockResolvedValue([1]);

      const result = await oidc.rotateSecret("t1", "c1");

      expect(result.clientSecret).toHaveLength(64);
      expect(JSON.parse(TenantSettings.update.mock.calls[0][0].value).clientSecretHash).toHaveLength(64);
    });

    it("throws 404 for an unknown client", async () => {
      TenantSettings.findOne.mockResolvedValue(null);

      await expect(oidc.rotateSecret("t1", "nope")).rejects.toMatchObject({
        status: 404,
        message: "OIDC client not found",
      });
    });
  });

  describe("deleteClient", () => {
    it("removes client", async () => {
      TenantSettings.destroy.mockResolvedValue(1);
      const result = await oidc.deleteClient("t1", "c1");
      expect(result.deleted).toBe(true);
      expect(TenantSettings.destroy).toHaveBeenCalledWith({
        where: { tenantId: "t1", key: "oidc_rp_c1" },
      });
    });

    it("reports deleted=false when nothing matched", async () => {
      TenantSettings.destroy.mockResolvedValue(0);
      expect(await oidc.deleteClient("t1", "c1")).toEqual({ deleted: false });
    });
  });

  describe("issueTokens", () => {
    const user = { id: "u1", email: "a@b.com", firstName: "A", lastName: "B" };

    // The service generates its RSA key pair at module load and never exports it.
    // Load an isolated instance with a key pair we control so the signatures it
    // produces can genuinely be verified.
    let isolatedOidc;
    let testKeys;

    beforeAll(() => {
      testKeys = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      jest.isolateModules(() => {
        const spy = jest.spyOn(crypto, "generateKeyPairSync").mockReturnValue(testKeys);
        isolatedOidc = require("../../services/oidcProvider.service");
        spy.mockRestore();
      });
    });

    // REGRESSION: the id_token payload used to set `iat`/`exp` itself while
    // signToken also passed `expiresIn: "15m"`. jsonwebtoken rejects that
    // combination ("Bad "options.expiresIn" option the payload already has an
    // "exp" property"), so issueTokens threw on EVERY call. The payload now
    // leaves expiry to expiresIn.
    it("issues a verifiable RS256 access token and id token", async () => {
      const result = await isolatedOidc.issueTokens("t1", user, ["openid", "profile"]);

      expect(result.token_type).toBe("Bearer");
      expect(result.expires_in).toBe(900);
      expect(result.scope).toBe("openid profile");
      expect(result.refresh_token).toHaveLength(128);

      // The tokens must actually verify against the matching public key.
      const pub = testKeys.publicKey;
      const access = jwt.verify(result.access_token, pub, { algorithms: ["RS256"] });
      expect(access).toMatchObject({
        sub: "u1",
        email: "a@b.com",
        tenant_id: "t1",
        scope: "openid profile",
        typ: "access",
      });

      const id = jwt.verify(result.id_token, pub, { algorithms: ["RS256"] });
      expect(id).toMatchObject({
        sub: "u1",
        given_name: "A",
        family_name: "B",
        aud: "a@b.com",
      });

      expect(jwt.decode(result.access_token, { complete: true }).header).toMatchObject({
        alg: "RS256",
        kid: process.env.OIDC_JWKS_KID || "callibrator-oidc-key-1",
      });
    });

    it("defaults to the openid/profile/email scopes", async () => {
      const result = await isolatedOidc.issueTokens("t1", user);
      expect(result.scope).toBe("openid profile email");
      const claims = jwt.verify(result.access_token, testKeys.publicKey, { algorithms: ["RS256"] });
      expect(claims.scope).toBe("openid profile email");
    });
  });

  describe("verifySecret", () => {
    it("validates client secret", async () => {
      const secret = "test-secret";
      const hash = crypto.createHash("sha256").update(secret).digest("hex");
      TenantSettings.findOne.mockResolvedValue({ value: JSON.stringify({ clientSecretHash: hash }) });
      expect(await oidc.verifySecret("t1", "c1", secret)).toBe(true);
      expect(await oidc.verifySecret("t1", "c1", "wrong")).toBe(false);
    });

    it("returns false when the client is unknown", async () => {
      TenantSettings.findOne.mockResolvedValue(null);
      expect(await oidc.verifySecret("t1", "c1", "s")).toBe(false);
    });

    it("returns false for a corrupt row or one with no stored hash", async () => {
      TenantSettings.findOne.mockResolvedValue({ value: "not-json" });
      expect(await oidc.verifySecret("t1", "c1", "s")).toBe(false);

      TenantSettings.findOne.mockResolvedValue({ value: "null" });
      expect(await oidc.verifySecret("t1", "c1", "s")).toBe(false);

      TenantSettings.findOne.mockResolvedValue({ value: JSON.stringify({ clientId: "c1" }) });
      expect(await oidc.verifySecret("t1", "c1", "s")).toBe(false);
    });

    it("returns false rather than throwing when the stored hash length differs", async () => {
      // timingSafeEqual throws on a length mismatch — the guard must catch this first.
      TenantSettings.findOne.mockResolvedValue({
        value: JSON.stringify({ clientSecretHash: "abcd" }),
      });
      expect(await oidc.verifySecret("t1", "c1", "s")).toBe(false);
    });
  });
});
