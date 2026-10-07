const path = require("node:path");
const { execFileSync } = require("node:child_process");

const OVERLAY = path.join(__dirname, "overlay.js");

/** Add the overlay script to the client entry points (App and Pages router). */
function injectOverlay(originalEntry) {
  return async () => {
    const entries = await (typeof originalEntry === "function" ? originalEntry() : originalEntry);
    for (const name of ["main-app", "main.js", "main"]) {
      const entry = entries[name];
      if (!entry) continue;
      const list = Array.isArray(entry) ? entry : entry.import;
      if (Array.isArray(list) && !list.includes(OVERLAY)) list.push(OVERLAY);
    }
    return entries;
  };
}

function gitRoot(dir) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir }).toString().trim();
  } catch {
    return dir;
  }
}

/**
 * Wrap a Next.js config so `next dev` shows who built each part of the UI.
 * Inactive in production builds and when WHODID=0.
 *
 *   module.exports = withWhodid({ ...yourConfig })
 */
function withWhodid(nextConfig = {}) {
  return {
    ...nextConfig,
    webpack(config, context) {
      if (typeof nextConfig.webpack === "function") {
        config = nextConfig.webpack(config, context);
      }
      if (!context.dev || process.env.WHODID === "0") return config;

      config.module.rules.unshift({
        test: /\.(jsx|tsx)$/,
        exclude: /node_modules/,
        enforce: "pre",
        use: [{ loader: require.resolve("./loader") }],
      });

      if (!context.isServer) {
        config.entry = injectOverlay(config.entry);
        config.plugins.push(
          new context.webpack.DefinePlugin({
            __WHODID_ROOT__: JSON.stringify(gitRoot(context.dir)),
          })
        );
      }
      return config;
    },
  };
}

module.exports = withWhodid;
module.exports.withWhodid = withWhodid;
