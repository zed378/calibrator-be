const path = require("path");

const isPackaged = !!process.pkg;

function getAppRoot() {
  if (isPackaged) {
    return path.dirname(process.execPath);
  }

  return path.resolve(__dirname, "../../");
}

module.exports = (...paths) => path.join(getAppRoot(), ...paths);
