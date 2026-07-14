/**
 * Tests for globalSanitizer middleware
 */
const { globalSanitizer } = require("../../middlewares/globalSanitizer.middleware");

describe("globalSanitizer middleware", () => {
  let req, res, next;

  beforeEach(() => {
    req = { body: {}, query: {}, params: {} };
    res = {};
    next = jest.fn();
  });

  it("should call next()", () => {
    globalSanitizer(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("should sanitize XSS in body strings", () => {
    req.body = { name: "<script>alert('xss')</script>Hello" };
    globalSanitizer(req, res, next);
    expect(req.body.name).not.toContain("<script>");
    expect(req.body.name).toContain("Hello");
  });

  it("should sanitize XSS in query strings", () => {
    req.query = { search: "<img onerror=alert(1) src=x>" };
    globalSanitizer(req, res, next);
    expect(req.query.search).not.toContain("onerror");
  });

  it("should sanitize XSS in params", () => {
    req.params = { id: "<script>alert(1)</script>" };
    globalSanitizer(req, res, next);
    expect(req.params.id).not.toContain("<script>");
  });

  it("should handle nested objects", () => {
    req.body = {
      user: {
        name: "<b>bold</b>",
        profile: {
          bio: "<script>steal()</script>Clean bio",
        },
      },
    };
    globalSanitizer(req, res, next);
    expect(req.body.user.profile.bio).not.toContain("<script>");
    expect(req.body.user.profile.bio).toContain("Clean bio");
  });

  it("should handle arrays", () => {
    req.body = { tags: ["<script>x</script>safe", "normal"] };
    globalSanitizer(req, res, next);
    expect(req.body.tags[0]).not.toContain("<script>");
    expect(req.body.tags[0]).toContain("safe");
    expect(req.body.tags[1]).toBe("normal");
  });

  it("should not sanitize excluded fields", () => {
    const base64Content = "data:image/png;base64,iVBORw0KGgo=<script>";
    req.body = { avatar_url: base64Content };
    globalSanitizer(req, res, next);
    expect(req.body.avatar_url).toBe(base64Content);
  });

  it("should not sanitize avatar field", () => {
    const content = "<script>alert(1)</script>";
    req.body = { avatar: content };
    globalSanitizer(req, res, next);
    expect(req.body.avatar).toBe(content);
  });

  it("should preserve non-string values (numbers, booleans)", () => {
    req.body = { count: 42, active: true, score: 3.14 };
    globalSanitizer(req, res, next);
    expect(req.body.count).toBe(42);
    expect(req.body.active).toBe(true);
    expect(req.body.score).toBe(3.14);
  });

  it("should handle null/undefined body gracefully", () => {
    req.body = null;
    req.query = undefined;
    req.params = null;
    globalSanitizer(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("should handle inherited prototype properties gracefully and not sanitize them", () => {
    const protoObj = { inherited: "<script>unsafe</script>" };
    const reqObj = Object.create(protoObj);
    reqObj.own = "<script>unsafe</script>safe";
    req.body = reqObj;
    globalSanitizer(req, res, next);
    expect(req.body.own).toBe("&lt;script&gt;unsafe&lt;/script&gt;safe");
    expect(req.body.hasOwnProperty("inherited")).toBe(false);
    expect(req.body.inherited).toBeUndefined();
  });
});
