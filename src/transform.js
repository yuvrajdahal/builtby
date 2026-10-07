const { parse } = require("@babel/parser");

const ATTR = "data-who";
const UNTRACKED = {
  sha: "0000000000000000000000000000000000000000",
  author: "Uncommitted",
  email: "",
  time: 0,
  summary: "File is not tracked by git yet",
};

/** True for DOM-producing tags: `div`, `button`, and `motion.div`-style members. */
function isHostElement(name) {
  if (name.type === "JSXIdentifier") return /^[a-z]/.test(name.name);
  if (name.type === "JSXMemberExpression") return /^[a-z]/.test(name.property.name);
  return false;
}

function hasWhoAttr(opening) {
  return opening.attributes.some(
    (a) => a.type === "JSXAttribute" && a.name && a.name.name === ATTR
  );
}

/** Depth-first walk over every AST node. */
function walk(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const key in node) {
    if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
    const child = node[key];
    if (Array.isArray(child)) for (const c of child) walk(c, visit);
    else if (child && typeof child.type === "string") walk(child, visit);
  }
}

/**
 * Who owns lines [start, end]? The author with the most lines wins; their
 * newest commit inside the range is reported for context.
 */
function owner(lines, start, end) {
  const byAuthor = new Map();
  for (let i = start; i <= end; i++) {
    const c = (lines && lines[i]) || UNTRACKED;
    const entry = byAuthor.get(c.author) || { count: 0, latest: c };
    entry.count++;
    if ((c.time || 0) > (entry.latest.time || 0)) entry.latest = c;
    byAuthor.set(c.author, entry);
  }
  let best = null;
  for (const entry of byAuthor.values()) {
    if (
      !best ||
      entry.count > best.count ||
      (entry.count === best.count && entry.latest.time > best.latest.time)
    ) {
      best = entry;
    }
  }
  return { commit: best.latest, share: best.count / (end - start + 1) };
}

/**
 * Inject `data-who` onto every host JSX element. The value is a JSON tuple:
 * [file, startLine, endLine, author, email, sha, unixTime, summary, share]
 */
function transform(source, filename, blame) {
  let ast;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: /\.tsx$/.test(filename) ? ["typescript", "jsx"] : ["jsx"],
      errorRecovery: true,
    });
  } catch {
    return source;
  }

  const inserts = [];
  walk(ast.program, (node) => {
    if (node.type !== "JSXElement") return;
    const opening = node.openingElement;
    if (!isHostElement(opening.name) || hasWhoAttr(opening)) return;

    const start = node.loc.start.line;
    const end = node.loc.end.line;
    const { commit, share } = owner(blame.lines, start, end);
    const payload = JSON.stringify([
      blame.rel,
      start,
      end,
      commit.author,
      commit.email,
      commit.sha.slice(0, 8),
      commit.time,
      (commit.summary || "").slice(0, 120),
      Math.round(share * 100) / 100,
    ]);
    inserts.push({ at: opening.name.end, text: ` ${ATTR}={${JSON.stringify(payload)}}` });
  });

  if (!inserts.length) return source;
  // Splice back-to-front so earlier offsets stay valid. No newlines are added,
  // so line numbers (and therefore downstream source maps) are unchanged.
  inserts.sort((a, b) => b.at - a.at);
  let out = source;
  for (const { at, text } of inserts) out = out.slice(0, at) + text + out.slice(at);
  return out;
}

module.exports = { transform, owner, ATTR };
