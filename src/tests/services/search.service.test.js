jest.mock("../../config", () => ({ db: { query: jest.fn() } }));
jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const search = require("../../services/search.service");
const { db } = require("../../config");

describe("search.service", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns empty for a blank query without querying", async () => {
    const r = await search.search("t1", { q: "   " });
    expect(r.total).toBe(0);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("runs FTS across types and merges results ranked by relevance", async () => {
    db.query
      .mockResolvedValueOnce([{ id: "d1", name: "X", rank: 0.5 }]) // device
      .mockResolvedValueOnce([{ id: "s1", itemName: "Y", rank: 0.9 }]) // stock
      .mockResolvedValueOnce([]); // certificate
    const r = await search.search("t1", { q: "widget" });
    expect(r.total).toBe(2);
    expect(r.results[0].id).toBe("s1"); // higher rank first
    expect(r.results[0].type).toBe("stock");
  });

  it("falls back to ILIKE when the FTS query throws", async () => {
    db.query
      .mockRejectedValueOnce(new Error("column search_vector does not exist"))
      .mockResolvedValueOnce([{ id: "d1", name: "X", rank: 0 }]);
    const r = await search.search("t1", { q: "widget", types: ["device"] });
    expect(r.total).toBe(1);
    expect(db.query).toHaveBeenCalledTimes(2); // FTS then ILIKE
  });

  it("restricts to requested types", async () => {
    db.query.mockResolvedValueOnce([{ id: "s1", itemName: "Y", rank: 0.1 }]);
    const r = await search.search("t1", { q: "widget", types: ["stock"] });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(r.byType.stock).toBeDefined();
  });
});
