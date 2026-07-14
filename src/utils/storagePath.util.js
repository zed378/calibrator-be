const path = require("path");

const isPackaged = !!process.pkg;

const storageRoot = isPackaged
  ? process.env.APP_STORAGE_PATH ||
    path.join(path.dirname(process.execPath), "storage")
  : path.resolve(__dirname, "../../");

module.exports = (...paths) => path.join(storageRoot, ...paths);
