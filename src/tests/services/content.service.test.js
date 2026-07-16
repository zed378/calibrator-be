/**
 * Tests for content.service.js
 *
 * Covers: listPosts, getPostById, createPost, updatePost, deletePost,
 * checkSlug, listPublishedPosts, getPublishedPostBySlug,
 * listCategories, createCategory, updateCategory, deleteCategory
 */

jest.mock("../../config", () => ({
  Sequelize: { useCLS: jest.fn() },
  db: {
    transaction: jest.fn(),
  },
}));

jest.mock("sanitize-html", () => {
  const mockDefaults = {
    allowedTags: ["p", "b", "i", "em", "strong", "a", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "br", "img", "div", "span", "code", "pre", "blockquote", "figure", "figcaption", "u", "s", "table", "thead", "tbody", "tr", "td", "th"],
  };
  const mock = (html, _opts) => String(html || "");
  mock.defaults = mockDefaults;
  mock.simpleTransform = (tag, attrs) => (() => ({ tag, attribs: attrs || {} }));
  return mock;
});

jest.mock("../../constants", () => ({
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
}));

jest.mock("../../models", () => ({
  Post: {
    findByPk: jest.fn(),
    findAndCountAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    softDelete: jest.fn(),
    unscoped: jest.fn(function () { return this; }),
  },
  Category: {
    findAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    unscoped: jest.fn(function () { return this; }),
  },
}));

jest.mock("../../utils/appError.util", () => {
  class AppError extends Error {
    constructor(status, message) {
      super(message);
      this.name = "AppError";
      this.status = status;
    }
  }
  return { AppError };
});

const { Post, Category } = require("../../models");
const { db } = require("../../config");
const contentService = require("../../services/content.service");
const { Op } = require("sequelize");

// ---------- helpers ----------
const mockPost = (extra = {}) => {
  const post = {
    id: "p-1",
    type: "ARTICLE",
    title: "Test Post",
    slug: "test-post",
    excerpt: "Excerpt",
    coverImageUrl: "/cover.jpg",
    publishedAt: new Date(),
    authorName: "Author",
    authorRole: "Admin",
    readingMinutes: 3,
    featured: false,
    status: "DRAFT",
    contentHtml: "<p>Body</p>",
    ...extra,
    toJSON() {
      return { ...this };
    },
  };
  return post;
};

const mockCategory = (id = "c-1", name = "Tech", slug = "tech") => ({
  id,
  name,
  slug,
  toJSON() {
    return { id: this.id, name: this.name, slug: this.slug };
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  // Provide a fresh transaction object for each test (avoids rollback/commit undefined).
  db.transaction.mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() });
});

// =========================
// POSTS — admin
// =========================

describe("listPosts", () => {
  it("should return paginated posts", async () => {
    Post.findAndCountAll.mockResolvedValue({
      count: 3,
      rows: [mockPost({ id: "p-1" }), mockPost({ id: "p-2" })],
    });

    const result = await contentService.listPosts({ page: 1, limit: 10 });

    expect(result.success).toBe(true);
    expect(result.data.rows.length).toBe(2);
    expect(result.data.meta.total).toBe(3);
    expect(Post.findAndCountAll).toHaveBeenCalled();
  });

  it("should filter by type and status", async () => {
    Post.findAndCountAll.mockResolvedValue({ count: 1, rows: [] });

    await contentService.listPosts({ type: "ARTICLE", status: "PUBLISHED" });

    expect(Post.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "ARTICLE", status: "PUBLISHED" }),
      }),
    );
  });

  it("should filter by category", async () => {
    Post.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

    await contentService.listPosts({ category: "tech" });

    expect(Post.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({
        include: [expect.objectContaining({ required: true })],
      }),
    );
  });

  it("should return error object when query fails", async () => {
    Post.findAndCountAll.mockRejectedValue(new Error("DB error"));

    await expect(contentService.listPosts({})).rejects.toMatchObject({ status: 500 });
  });
});

describe("getPostById", () => {
  it("should return post with categories", async () => {
    const p = mockPost();
    p.categories = [mockCategory()];
    Post.findByPk.mockResolvedValue(p);

    const result = await contentService.getPostById("p-1");

    expect(result.success).toBe(true);
    expect(result.data.title).toBe("Test Post");
  });

  it("should throw 404 when post not found", async () => {
    Post.findByPk.mockResolvedValue(null);

    await expect(contentService.getPostById("nonexistent")).rejects.toMatchObject({
      status: 404,
      message: "Post not found",
    });
  });
});

describe("createPost", () => {
  it("should create a post and return it", async () => {
    const created = mockPost({ id: "p-pub", status: "PUBLISHED", title: "Pub Post" });
    created.setCategories = jest.fn().mockResolvedValue(true);
    Post.create.mockResolvedValue(created);
    // ensureUniqueSlug uses Post.unscoped().findOne -> returns undefined (unique)
    Post.unscoped.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    Post.findByPk.mockResolvedValue(created);

    const result = await contentService.createPost(
      { title: "Pub Post", contentHtml: "<p>Hi</p>", status: "PUBLISHED", categoryIds: ["c-1"] },
      "user-1",
    );

    expect(result.success).toBe(true);
    expect(Post.create).toHaveBeenCalled();
    expect(created.setCategories).toHaveBeenCalled();
    expect(result.data.title).toBe("Pub Post");
  });

  it("should stamp publishedAt when publishing", async () => {
    const created = mockPost({ id: "p-pub", status: "PUBLISHED", title: "Pub Post" });
    created.setCategories = jest.fn().mockResolvedValue(true);
    Post.create.mockResolvedValue(created);
    Post.unscoped.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    Post.findByPk.mockResolvedValue(created);

    const result = await contentService.createPost(
      { title: "Pub Post", contentHtml: "<p>Hi</p>", status: "PUBLISHED", categoryIds: ["c-1"] },
      "user-1",
    );

    expect(result.success).toBe(true);
    expect(Post.create).toHaveBeenCalled();
    expect(created.setCategories).toHaveBeenCalled();
    expect(result.data.title).toBe("Pub Post");
  });

  it("should stamp publishedAt when publishing", async () => {
    const created = mockPost({ id: "p-pub", status: "PUBLISHED", title: "Pub Post" });
    created.setCategories = jest.fn().mockResolvedValue(true);
    Post.create.mockResolvedValue(created);
    Post.unscoped.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    Post.findByPk.mockResolvedValue(created);

    await contentService.createPost(
      { title: "Pub Post", contentHtml: "<p>Hi</p>", status: "PUBLISHED", categoryIds: ["c-1"] },
      "user-1",
    );

    const callArgs = Post.create.mock.calls[0][0];
    expect(callArgs.publishedAt).toBeDefined();
  });
});

describe("updatePost", () => {
  it("should update post fields", async () => {
    const p = mockPost();
    p.update = jest.fn(function (patch) {
      Object.assign(p, patch);
      return Promise.resolve(p);
    });
    // Both the initial fetch and the re-fetch return the same (mutated) object.
    Post.findByPk.mockResolvedValue(p);

    const result = await contentService.updatePost("p-1", { title: "Updated" });

    expect(result.success).toBe(true);
    expect(result.data.title).toBe("Updated");
  });

  it("should throw 404 when post not found", async () => {
    Post.findByPk.mockResolvedValue(null);

    await expect(contentService.updatePost("nonexistent", { title: "x" })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("deletePost", () => {
  it("should soft-delete the post", async () => {
    const p = mockPost();
    p.softDelete = jest.fn().mockResolvedValue({});
    Post.findByPk.mockResolvedValue(p);

    const result = await contentService.deletePost("p-1");

    expect(result.success).toBe(true);
    expect(p.softDelete).toHaveBeenCalled();
  });

  it("should throw 404 when post not found", async () => {
    Post.findByPk.mockResolvedValue(null);

    await expect(contentService.deletePost("nonexistent")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("checkSlug", () => {
  it("should return available: true when slug is free", async () => {
    Post.unscoped.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });

    const result = await contentService.checkSlug("my-awesome-post");

    expect(result.data.available).toBe(true);
    expect(result.data.slug).toBe("my-awesome-post");
  });

  it("should return available: false when slug is taken", async () => {
    // ensureUniqueSlug queries by slug; only the exact slug is "taken".
    Post.unscoped.mockReturnValue({
      findOne: jest.fn(({ where }) =>
        Promise.resolve(where.slug === "taken-slug" ? { id: "x" } : null),
      ),
    });

    const result = await contentService.checkSlug("taken-slug");

    expect(result.data.available).toBe(false);
    expect(result.data.suggestion).toBe("taken-slug-2");
  });

  it("should return slug 'post' for empty input (slugify fallback)", async () => {
    const result = await contentService.checkSlug("");

    expect(result.data.slug).toBe("post");
    expect(result.data.available).toBe(false);
  });
});

// =========================
// POSTS — public
// =========================

describe("listPublishedPosts", () => {
  it("should return only published posts", async () => {
    Post.findAndCountAll.mockResolvedValue({
      count: 2,
      rows: [mockPost({ id: "p-1" }), mockPost({ id: "p-2" })],
    });

    const result = await contentService.listPublishedPosts({ page: 1, limit: 10 });

    expect(result.success).toBe(true);
    expect(result.data.rows.length).toBe(2);
    expect(Post.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "PUBLISHED" }) }),
    );
  });
});

describe("getPublishedPostBySlug", () => {
  it("should return a published post by slug", async () => {
    const p = mockPost();
    Post.findOne.mockResolvedValue(p);

    const result = await contentService.getPublishedPostBySlug("test-post");

    expect(result.success).toBe(true);
    expect(result.data.title).toBe("Test Post");
  });

  it("should throw 404 when post not found", async () => {
    Post.findOne.mockResolvedValue(null);

    await expect(contentService.getPublishedPostBySlug("missing")).rejects.toMatchObject({
      status: 404,
    });
  });
});

// =========================
// CATEGORIES
// =========================

describe("listCategories", () => {
  it("should return all categories", async () => {
    Category.findAll.mockResolvedValue([mockCategory("c-1", "Tech", "tech"), mockCategory("c-2", "News", "news")]);

    const result = await contentService.listCategories();

    expect(result.success).toBe(true);
    expect(result.data.length).toBe(2);
    expect(result.data[0].name).toBe("Tech");
  });
});

describe("createCategory", () => {
  it("should create a category with unique slug", async () => {
    const cat = mockCategory("c-9", "New Cat", "new-cat");
    Category.create.mockResolvedValue(cat);
    Category.unscoped.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });

    const result = await contentService.createCategory({ name: "New Cat" });

    expect(result.success).toBe(true);
    expect(result.data.name).toBe("New Cat");
    expect(Category.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Cat", slug: "new-cat" }),
    );
  });
});

describe("updateCategory", () => {
  it("should update category fields", async () => {
    const cat = mockCategory("c-1", "Tech", "tech");
    cat.update = jest.fn(function (patch) {
      Object.assign(cat, patch);
      return Promise.resolve(cat);
    });
    Category.findByPk.mockResolvedValue(cat);
    Category.unscoped.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });

    const result = await contentService.updateCategory("c-1", { name: "Tech Renamed" });

    expect(result.success).toBe(true);
    expect(result.data.name).toBe("Tech Renamed");
  });

  it("should throw 404 when category not found", async () => {
    Category.findByPk.mockResolvedValue(null);

    await expect(contentService.updateCategory("missing", { name: "x" })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("deleteCategory", () => {
  it("should soft-delete the category", async () => {
    const cat = mockCategory("c-1");
    cat.softDelete = jest.fn().mockResolvedValue({});
    Category.findByPk.mockResolvedValue(cat);

    const result = await contentService.deleteCategory("c-1");

    expect(result.success).toBe(true);
    expect(cat.softDelete).toHaveBeenCalled();
  });

  it("should throw 404 when category not found", async () => {
    Category.findByPk.mockResolvedValue(null);

    await expect(contentService.deleteCategory("missing")).rejects.toMatchObject({
      status: 404,
    });
  });
});
