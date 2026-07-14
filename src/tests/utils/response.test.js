/**
 * Tests for response utility
 */

const { success, error, paginate } = require("../../utils/response.util");

describe("response utils", () => {
  let res;
  let jsonCalls;

  beforeEach(() => {
    jsonCalls = [];
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockImplementation((data) => {
        jsonCalls.push(data);
        return { send: jest.fn() };
      }),
    };
  });

  describe("success", () => {
    it("should send a success response with data and message", () => {
      success(res, { id: "1" }, "Created", 201);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(jsonCalls[0]).toMatchObject({
        success: true,
        data: { id: "1" },
        message: "Created",
      });
    });

    it("should default to 200 status", () => {
      success(res, { id: "1" }, "OK");

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should default message to success", () => {
      success(res, { id: "1" });

      expect(jsonCalls[0].message).toBe("success");
    });

    it("should send null data when provided", () => {
      success(res, null, "No data");

      expect(jsonCalls[0].data).toBeNull();
    });
  });

  describe("error", () => {
    it("should send an error response", () => {
      error(res, "Something went wrong", 500);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(jsonCalls[0]).toMatchObject({
        success: false,
        message: "Something went wrong",
      });
    });

    it("should default to 400 status", () => {
      error(res, "Bad request");

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("paginate", () => {
    it("should paginate an array of items", () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      const result = paginate(items, 1, 10, 11);

      expect(result.data).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(11);
      expect(result.totalPages).toBe(2);
    });

    it("should handle empty array", () => {
      const result = paginate([], 1, 10, 0);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
