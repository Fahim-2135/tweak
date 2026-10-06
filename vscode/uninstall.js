// Runs when the extension is uninstalled: take the ✎ button back out of Claude Code's panel.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const START = "/*<<tweak-button>>*/";
const END = "/*<</tweak-button>>*/";
const root = path.join(os.homedir(), ".vscode", "extensions");
for (const name of fs.existsSync(root) ? fs.readdirSync(root) : []) {
  if (!name.startsWith("anthropic.claude-code-")) continue;
  const file = path.join(root, name, "webview", "index.js");
  try {
    const s = fs.readFileSync(file, "utf8");
    const a = s.indexOf(START);
    const b = s.indexOf(END);
    if (a >= 0 && b > a) fs.writeFileSync(file, s.slice(0, a) + s.slice(b + END.length));
  } catch {
    /* leave it */
  }
}
