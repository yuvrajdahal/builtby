const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const UNCOMMITTED = "0000000000000000000000000000000000000000";

function git(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout)
    );
  });
}

const rootCache = new Map();

/** Resolve the git toplevel for a directory (cached). null when not in a repo. */
async function gitRoot(dir) {
  if (!rootCache.has(dir)) {
    rootCache.set(
      dir,
      git(["rev-parse", "--show-toplevel"], dir).then(
        (out) => out.trim(),
        () => null
      )
    );
  }
  return rootCache.get(dir);
}

/**
 * Parse `git blame --porcelain` output.
 * Returns an array indexed by 1-based line number: { sha, author, email, time, summary }.
 */
function parsePorcelain(out) {
  const commits = new Map();
  const lines = [];
  const rows = out.split("\n");
  let current = null;

  for (const row of rows) {
    if (!row) continue;
    if (row[0] === "\t") continue; // source line content
    const header = /^([0-9a-f]{40}) \d+ (\d+)/.exec(row);
    if (header) {
      const sha = header[1];
      if (!commits.has(sha)) commits.set(sha, { sha });
      current = commits.get(sha);
      lines[Number(header[2])] = current;
      continue;
    }
    if (!current) continue;
    const space = row.indexOf(" ");
    const key = space === -1 ? row : row.slice(0, space);
    const value = space === -1 ? "" : row.slice(space + 1);
    if (key === "author") current.author = value;
    else if (key === "author-mail") current.email = value.replace(/^<|>$/g, "");
    else if (key === "author-time") current.time = Number(value);
    else if (key === "summary") current.summary = value;
  }

  for (const commit of commits.values()) {
    if (commit.sha === UNCOMMITTED) {
      commit.author = "Uncommitted";
      commit.email = "";
      commit.summary = "Local changes, not committed yet";
      commit.time = Math.floor(Date.now() / 1000);
    }
  }
  return lines;
}

/**
 * Blame a file in its working-tree state (uncommitted edits included).
 * Resolves to { root, rel, lines } or null if the file is not in a git repo.
 */
async function blameFile(absPath) {
  const root = await gitRoot(path.dirname(absPath));
  if (!root) return null;
  const rel = path.relative(root, absPath).split(path.sep).join("/");

  const args = ["blame", "--porcelain", "-w", "-M"];
  const ignoreRevs = path.join(root, ".git-blame-ignore-revs");
  if (fs.existsSync(ignoreRevs)) args.push("--ignore-revs-file", ignoreRevs);
  args.push("--", rel);

  try {
    return { root, rel, lines: parsePorcelain(await git(args, root)) };
  } catch {
    // Untracked file: every line belongs to the local working copy.
    return { root, rel, lines: null };
  }
}

module.exports = { blameFile, parsePorcelain, UNCOMMITTED };
