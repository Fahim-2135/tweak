// Tweak for Claude: a ✎ button in Claude Code's chat box (VS Code) that sends what you typed as a
// tweak to the running task. With the Tweak mod, a plain message waits until Claude finishes; the
// button (or Alt+Enter) puts "now: " in front, so Claude reads it after its current step.
//
// Claude Code's panel has no place for other extensions' buttons, so this adds a small script to
// the end of the panel's own webview file (webview/index.js), marked so it can be found and
// removed. Claude Code updates often and each update ships a fresh file: on every start, and
// whenever extensions change, this adds the script again where it's missing and offers a reload.

const vscode = require("vscode");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const START = "/*<<tweak-button>>*/";
const END = "/*<</tweak-button>>*/";

// Runs inside Claude Code's chat panel. Plain DOM: finds the "/" button by its title, adds ✎
// after it, and sends "now: <text>" through the box's own Enter.
const INJECT = `${START}
;(() => {
  const KEY = "tweak-button";
  const box = () => document.querySelector('[aria-label="Message input"]');
  const PENCIL = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 2.5l3 3L5 14H2v-3z"/><path d="M9 4l3 3"/></svg>';
  function send() {
    const el = box();
    if (!el) return;
    const text = (el.innerText || "").trim();
    el.focus();
    if (!text) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("insertText", false, /^\\s*now\\s*:/i.test(text) ? text : "now: " + text);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  }
  function place() {
    const slash = document.querySelector('button[title="Show command menu (/)"]');
    if (!slash || !slash.parentElement || slash.parentElement.querySelector("." + KEY)) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = slash.className + " " + KEY;
    b.title = "Tweak: send this to Claude now; it reads it after its current step (Alt+Enter). Plain Enter waits until Claude finishes.";
    b.setAttribute("aria-label", "Send as a tweak");
    b.innerHTML = PENCIL;
    // Match the "/" icon's size; the button class alone lets the svg grow.
    const ref = slash.querySelector("svg");
    const size = Math.max(12, Math.min(16, Math.round(ref ? ref.getBoundingClientRect().height : 14) || 14));
    const svg = b.querySelector("svg");
    svg.style.width = size + "px";
    svg.style.height = size + "px";
    svg.style.flex = "none";
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", send);
    slash.after(b);
  }
  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key === "Enter" && e.target === box()) {
      e.preventDefault();
      e.stopPropagation();
      send();
    }
  }, true);
  new MutationObserver(place).observe(document.documentElement, { childList: true, subtree: true });
  place();
})();
${END}`;

function claudeWebviews() {
  const root = path.join(os.homedir(), ".vscode", "extensions");
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.startsWith("anthropic.claude-code-"))
    .map((n) => path.join(root, n, "webview", "index.js"))
    .filter((f) => fs.existsSync(f));
}

function strip(source) {
  const a = source.indexOf(START);
  const b = source.indexOf(END);
  return a >= 0 && b > a ? source.slice(0, a) + source.slice(b + END.length) : source;
}

/** Adds the button where it's missing or out of date; true when a running panel needs a reload. */
function patchAll() {
  let changed = false;
  for (const file of claudeWebviews()) {
    try {
      const source = fs.readFileSync(file, "utf8");
      if (source.includes(INJECT)) continue;
      fs.writeFileSync(file, strip(source).replace(/\s*$/, "\n") + INJECT + "\n");
      changed = true;
    } catch (err) {
      console.error("tweak: could not add the button to", file, err);
    }
  }
  return changed;
}

function unpatchAll() {
  for (const file of claudeWebviews()) {
    try {
      const source = fs.readFileSync(file, "utf8");
      if (source.includes(START)) fs.writeFileSync(file, strip(source));
    } catch {
      /* leave it */
    }
  }
}

async function offerReload() {
  const pick = await vscode.window.showInformationMessage(
    "Tweak: the ✎ button was added to Claude's chat box. Reload the window to see it.",
    "Reload now",
  );
  if (pick) vscode.commands.executeCommand("workbench.action.reloadWindow");
}

function activate(context) {
  if (patchAll()) offerReload();
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      if (patchAll()) offerReload();
    }),
    vscode.commands.registerCommand("tweak.remove", async () => {
      unpatchAll();
      const pick = await vscode.window.showInformationMessage(
        "Tweak: the ✎ button was taken out of Claude's chat box. Reload to finish.",
        "Reload now",
      );
      if (pick) vscode.commands.executeCommand("workbench.action.reloadWindow");
    }),
    vscode.commands.registerCommand("tweak.add", () => {
      if (patchAll()) offerReload();
      else vscode.window.showInformationMessage("Tweak: the ✎ button is already in Claude's chat box.");
    }),
  );
}

function deactivate() {}

module.exports = { activate, deactivate, INJECT, strip };
