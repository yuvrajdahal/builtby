const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { blameFile } = require("./blame");
const { transform } = require("./transform");

const OVERLAY = path.join(__dirname, "overlay.js");
const VIRTUAL_ID = "virtual:builtby-overlay";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

function gitRoot(dir) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir }).toString().trim();
  } catch {
    return dir;
  }
}

/**
 * Vite plugin: show who built each part of the UI while running `vite` (dev server only).
 *
 *   import builtby from "builtby/vite";
 *   export default defineConfig({ plugins: [react(), builtby()] });
 */
function builtby() {
  let root = process.cwd();
  let base = "/";

  return {
    name: "builtby",
    enforce: "pre",
    apply: (_config, env) => env.command === "serve" && process.env.BUILTBY !== "0",

    configResolved(config) {
      root = gitRoot(config.root);
      base = config.base || "/";
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },

    load(id) {
      if (id !== RESOLVED_ID) return;
      return `const __BUILTBY_ROOT__ = ${JSON.stringify(root)};\n` + fs.readFileSync(OVERLAY, "utf8");
    },

    transformIndexHtml() {
      return [
        {
          tag: "script",
          // Vite serves virtual modules at /@id/__x00__<id> in dev.
          attrs: { type: "module", src: `${base}@id/__x00__${VIRTUAL_ID}` },
          injectTo: "body",
        },
      ];
    },

    async transform(code, id) {
      const file = id.split("?")[0];
      if (!/\.(jsx|tsx)$/.test(file) || file.includes("/node_modules/")) return;
      if (!/<[a-z]/.test(code)) return;
      try {
        const blame = await blameFile(file);
        if (blame) return { code: transform(code, file, blame), map: null };
      } catch (err) {
        this.warn(`[builtby] ${file}: ${err.message}`);
      }
    },
  };
}

module.exports = builtby;
module.exports.default = builtby;
module.exports.builtby = builtby;
