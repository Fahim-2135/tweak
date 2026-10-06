// Tweak: two ways to talk to Claude while it works.
//
//   a plain message      waits until Claude finishes the task, then goes in as your next message
//                        (a real queue: "after that, also post it" doesn't get mixed into the
//                        running job)
//   "now: ..."           a tweak: Claude reads it after the step it's on and carries on with it
//                        ("now: make the video 30 seconds, not 60")
//
// In VS Code the ✎ button beside the chat box (or Alt+Enter) sends what you typed as a tweak; it
// is added by the Tweak for Claude extension (vscode/ beside this), which just puts "now: " in
// front. Claude Code itself hands any message typed mid-task to Claude at its next step; this
// mod holds the plain ones back and sends them once the task is done.

/** Who typed it: a person at the box (terminal, VS Code, the phone), never a task or a peer. */
const PEOPLE = new Set(["composer", "sdk", "bridge", "unclassified"]);
const NOW = /^\s*now\s*:\s*/i;

let disabled = false;
/** The main conversation's running turn, or null. */
let turn = null;
/** Messages typed during that turn, held until it ends. */
let held = [];

export function register(on) {
  on("session.start", async ($, e, next) => {
    // Headless helpers (Crew's agent runs, the brain's night jobs) have nobody typing.
    disabled = Boolean((await $.env.get("CREW_WORKER")) || (await $.env.get("BRAIN_WORKER")));
    return next(e);
  });

  on("turn.start", async ($, e, next) => {
    const answer = await next(e);
    // A turn inside the running one (a subagent's) belongs to it.
    if (!disabled && !turn) turn = e.turnId;
    return answer;
  });

  on("turn.complete", async ($, e, next) => {
    const answer = await next(e);
    if (disabled || e.agentId || turn !== e.turnId) return answer;
    turn = null;
    const waiting = held.splice(0);
    if (!waiting.length) return answer;
    if (e.isAborted || e.reason === "aborted") {
      // You stopped Claude: don't start the queued messages; put them back in the box instead.
      void $.prompt.fill({ text: waiting.join("\n\n"), mode: "append" }).catch(() => {});
      $.ui.toast("Stopped. Your queued message is back in the box.");
    } else {
      // Sent once the session is idle, as your own words; never awaited inside the turn.
      for (const text of waiting) void $.prompt.submit({ text, asUser: true }).catch(() => {});
    }
    return answer;
  });

  on("prompt.submit", async ($, e, next) => {
    if (disabled) return next(e);
    // "now: ..." is a tweak: let it through (mid-task, Claude reads it at its next step).
    const now = NOW.exec(e.text);
    if (now) return next({ ...e, text: e.text.slice(now[0].length) });

    // A plain message typed while Claude works waits for the task to finish. Pictures can't be
    // sent again later, so a message with any goes in now.
    const midTask = Boolean(turn && e.turnId);
    if (!midTask || !PEOPLE.has(e.origin?.kind) || e.attachments?.length) return next(e);
    held.push(e.text);
    return {
      drop: `Queued: sent when Claude finishes this task. To change the task now, start with "now:" or press ✎.`,
    };
  });
}
