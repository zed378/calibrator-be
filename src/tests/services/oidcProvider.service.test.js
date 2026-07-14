jest.mock("../../models", () => ({
  TenantSettings: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
  },
}));

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

  it("registerClient creates client and returns secret", async () => {
    TenantSettings.upsert.mockResolvedValue({});
    const result = await oidc.registerClient("t1", { name: "Test App", redirectUris: ["http://localhost"] });
    expect(result.clientId).toBeDefined();
    expect(result.clientSecret).toBeDefined();
    expect(result.name).toBe("Test App");
  });

  it("getClients lists registered clients", async () => {
    TenantSettings.findAll.mockResolvedValue([
      { value: JSON.stringify({ clientId: "c1", name: "App", redirectUris: [], scopes: [], grantTypes: [] }) },
    ]);
    const result = await oidc.getClients("t1");
    expect(result).toHaveLength(1);
    expect(result[0].clientId).toBe("c1");
  });

  it("rotateSecret generates new secret", async () => {
    TenantSettings.findOne.mockResolvedValue({ value: JSON.stringify({ clientId: "c1", clientSecretHash: "old" }) });
    TenantSettings.update.mockResolvedValue([1]);
    const result = await oidc.rotateSecret("t1", "c1");
    expect(result.clientSecret).toBeDefined();
    expect(result.clientId).toBe("c1");
  });

  it("deleteClient removes client", async () => {
    TenantSettings.destroy.mockResolvedValue(1);
    const result = await oidc.deleteClient("t1", "c1");
    expect(result.deleted).toBe(true);
  });

  it("verifySecret validates client secret", async () => {
    const secret = "test-secret";
    const hash = require("crypto").createHash("sha256").update(secret).digest("hex");
    TenantSettings.findOne.mockResolvedValue({ value: JSON.stringify({ clientSecretHash: hash }) });
    expect(await oidc.verifySecret("t1", "c1", secret)).toBe(true);
    expect(await oidc.verifySecret("t1", "c1", "wrong")).toBe(false);
  });
});
