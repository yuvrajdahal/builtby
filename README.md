# whodid

See who built which part of your UI. `git blame`, drawn on the running page.

Each element gets a colored ring and an avatar badge for the developer who owns most of its JSX lines.
Hover a badge to see the commit, or click it to open the file in VS Code.

## Next.js (webpack dev server)

```js
// next.config.mjs
import withWhodid from "whodid/next";
export default withWhodid({ /* your config */ });
```

Run `next dev`, then toggle with **Alt+W** or the panel in the bottom-right corner.

## How it works

- A webpack `pre` loader parses each `.jsx`/`.tsx` file, runs `git blame -w -M` on it, and adds
  `data-who="[file, start, end, author, email, sha, time, summary, share]"` to every host element
  (`div`, `button`, `motion.div`, ...).
- Server components work too, because the attribution lives in the rendered HTML.
- No backend: blame runs inside the dev server's compiler. Uncommitted edits show as "Uncommitted".
- Dev only. Production builds are untouched. Set `WHODID=0` to disable.
