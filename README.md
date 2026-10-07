# Tweak

Talk to Claude Code while it works, without mixing up two different things you might mean:

- **"After this, also do X."** A plain message you send while Claude is working now **waits** until Claude finishes the task, then goes in as your next message.
- **"Change what you're doing."** Start the message with `now:` (or press **✎** in VS Code) and Claude reads it **after the step it's on**, then carries on with the change. No stopping, no lost work.

```
while Claude works:

  add a LinkedIn post too          → sent after the task
  now: make the video 30 seconds   → reaches Claude at its next step
```

Out of the box, Claude Code hands *every* message typed mid-task to Claude at its next step, so there's no real queue. Tweak gives you both.

## What it does

| You do | What happens |
| --- | --- |
| Press Enter while Claude works | Held. You see "Queued: sent when Claude finishes this task." It goes in, as your own message, when the task ends. |
| Start with `now:` / press ✎ / Alt+Enter | Goes into the running task now; Claude reads it after its current step (a 5-minute build finishes first). ✎ with text in the box sends it; ✎ on an empty box lights up and makes your next message a tweak (Esc cancels). |
| Stop Claude with queued messages | They don't fire; they come back into the box. |
| Send a picture mid-task | Goes in now (a picture can't be held and sent again later). |
| Type between tasks | Nothing changes; `now:` is simply removed. |

## Install

**1. The Claude Code plugin** (terminal, VS Code, desktop: anywhere Claude Code runs):

```
claude plugin marketplace add Fahim-2135/tweak
claude plugin install tweak@tweak
```

Then start a new chat, or run `/reload-plugins` in an open one.

**2. The ✎ button in VS Code** (optional): download `tweak-for-claude-*.vsix` from the [latest release](https://github.com/Fahim-2135/tweak/releases/latest), then

```
code --install-extension tweak-for-claude-0.2.3.vsix
```

and reload the window (Ctrl+Shift+P → **Developer: Reload Window**). The ✎ sits right after the **/** button in Claude's chat box.

## How the ✎ button works (read this)

Claude Code's VS Code panel has no place for other extensions' buttons. So the extension **adds a small script to the end of the Claude Code extension's own `webview/index.js`**, between `/*<<tweak-button>>*/` markers. The script puts a ✎ next to **/** and, when pressed, sends what you typed with `now: ` in front. That's all it does.

- Claude Code updates often, and each update replaces that file. The extension adds the script again on every start and whenever extensions change, then offers a reload.
- If Claude Code changes how its chat box is built, the button may stop showing. Typing `now:` keeps working regardless.
- To take it out: Command Palette → **Tweak: Take the ✎ button out of Claude's chat box**, or uninstall the extension (uninstalling removes the script too).

## How the plugin works

`hooks/tweak.mjs` is a Claude Code mod (function hooks):

- `prompt.submit`: a message typed by you while a turn runs (`e.turnId` set) is answered with `{ drop }` and held; `now:` messages pass through with the prefix removed. Task notifications and messages from other agents are never held.
- `turn.complete`: when the main turn ends, held messages go in with `$.prompt.submit({ text, asUser: true })`; if you stopped the turn, they go back into the box with `$.prompt.fill`.
- It stays off in headless worker runs (`CREW_WORKER` / `BRAIN_WORKER`).

Tests: `claude plugin test .` (the mod), and the ✎ script was checked against a stand-in chat box in a real browser.

## License

MIT
