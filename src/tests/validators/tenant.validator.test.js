/**
 * Tenant validator tests
 */
const {
  getAllTenantsQuery,
  getTenantSchema,
  createTenantSchema,
  updateTenantSchema,
  deleteTenantSchema,
  tenantIdSchema,
  validate,
  formatErrors,
} = require("../../validators/tenant.validator");

const UUID = "8c352a92-d6cf-4b71-b0db-6e69622d1b11";

describe("Tenant Validators", () => {
  describe("getAllTenantsQuery", () => {
    it("should apply defaults", () => {
      const result = validate({}, getAllTenantsQuery);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it("should coerce and accept valid query", () => {
      const result = validate(
        { page: "2", limit: "50", find: "acme", status: "active" },
        getAllTenantsQuery,
      );
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
      expect(result.find).toBe("acme");
    });

    it("should reject invalid status", () => {
      expect(() => validate({ status: "NOPE" }, getAllTenantsQuery)).toThrow();
    });
  });

  describe("getTenantSchema", () => {
    it("should validate a uuid tenantId", () => {
      const result = validate({ tenantId: UUID }, getTenantSchema);
      expect(result.tenantId).toBe(UUID);
    });

    it("should reject a non-uuid tenantId", () => {
      expect(() => validate({ tenantId: "bad" }, getTenantSchema)).toThrow();
    });
  });

  describe("createTenantSchema", () => {
    it("should validate and normalize a valid tenant", () => {
      const result = validate(
        { name: "Acme", code: "ACME", status: "active" },
        createTenantSchema,
      );
      expect(result.name).toBe("Acme");
      expect(result.code).toBe("ACME");
      expect(result.status).toBe("ACTIVE");
    });

    it("should default status to ACTIVE", () => {
      const result = validate(
        { name: "Acme", code: "ACME" },
        createTenantSchema,
      );
      expect(result.status).toBe("ACTIVE");
    });

    it("should throw when required fields are missing", () => {
      expect(() => validate({ name: "Acme" }, createTenantSchema)).toThrow();
    });

    it("should reject an invalid color", () => {
      expect(() =>
        validate(
          { name: "Acme", code: "ACME", primaryColor: "red" },
          createTenantSchema,
        ),
      ).toThrow();
    });
  });

  describe("updateTenantSchema", () => {
    it("should validate a partial update", () => {
      const result = validate({ name: "New Name" }, updateTenantSchema);
      expect(result.name).toBe("New Name");
    });

    it("should normalize status to uppercase", () => {
      const result = validate({ status: "active" }, updateTenantSchema);
      expect(result.status).toBe("ACTIVE");
    });
  });

  describe("deleteTenantSchema", () => {
    it("should require a uuid tenantId", () => {
      const result = validate({ tenantId: UUID }, deleteTenantSchema);
      expect(result.tenantId).toBe(UUID);
    });
  });

  describe("tenantIdSchema", () => {
    it("should validate a uuid tenantId", () => {
      const result = validate({ tenantId: UUID }, tenantIdSchema);
      expect(result.tenantId).toBe(UUID);
    });
  });

  describe("formatErrors", () => {
    it("should format validation error details", () => {
      const { error } = createTenantSchema.validate({}, { abortEarly: false });
      const formatted = formatErrors(error.details);
      expect(Array.isArray(formatted)).toBe(true);
      expect(formatted[0]).toHaveProperty("field");
      expect(formatted[0]).toHaveProperty("message");
    });

    it("should handle nested field paths", () => {
      const formatted = formatErrors([
        { path: ["name"], message: '"name" is not allowed to be empty' },
      ]);
      expect(formatted[0].field).toBe("name");
    });

    it("should return empty array for empty input", () => {
      const formatted = formatErrors([]);
      expect(formatted).toEqual([]);
    });
  });
});
