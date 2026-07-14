/**
 * Attachment Model
 *
 * Tenant-scoped file/document registry. Any resource (certificate, device,
 * work order, etc.) can link files here via (resourceType, resourceId). Powers
 * the File/Document module and the tenant storage-quota accounting.
 */

const defineModel = (db, DataTypes) => {
  const Attachment = db.define(
    "Attachment",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      tenantId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "tenants", key: "id" },
        onDelete: "CASCADE",
      },
      // Polymorphic link to the owning resource (nullable = standalone upload).
      resourceType: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "generic",
      },
      resourceId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      // Stored filename on disk (opaque, randomized by multer).
      fileName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      // Original filename supplied by the uploader (used on download).
      originalName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      // Folder (relative to the storage root) the file lives in.
      folder: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "uploads/attachments",
      },
      mimeType: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      size: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      // SHA-256 of the file contents (integrity / dedup).
      checksum: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      uploadedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
    },
    {
      tableName: "attachments",
      timestamps: true,
      paranoid: true,
      underscored: true,
      indexes: [
        { fields: ["tenant_id"] },
        { fields: ["resource_type", "resource_id"] },
        { fields: ["is_deleted"] },
      ],
      defaultScope: {
        where: { is_deleted: false },
      },
      scopes: {
        includeDeleted: { where: null },
      },
    },
  );

  // Soft-delete: set the ATTRIBUTE (isDeleted) so save() persists it.
  Attachment.prototype.softDelete = async function () {
    this.isDeleted = true;
    return this.save({ hooks: false });
  };

  Attachment.associate = (models) => {
    Attachment.belongsTo(models.Tenant, {
      foreignKey: "tenant_id",
      as: "tenant",
    });
    Attachment.belongsTo(models.User, {
      foreignKey: "uploaded_by",
      as: "uploader",
    });
  };

  return Attachment;
};

module.exports = defineModel;
