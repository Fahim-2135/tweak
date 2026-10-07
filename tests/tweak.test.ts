// Tests for the Tweak mod (hooks/tweak.mjs), run by `claude plugin test`.

import { expect, mock, test } from "claude-code/testing";

const DONE = {
  reason: "answer",
  answer: "",
  durationMs: 1,
  isAborted: false,
  category: null,
  explanation: null,
};

function setup(on, env: Record<string, string> = {}) {
  mock.env(on, env);
  const sent: Array<{ text: string; asUser?: boolean }> = [];
  const filled: string[] = [];
  const entered: string[] = [];
  on("session.start", () => ({ cwd: "/work" }));
  on("turn.start", ($, e) => ({ turnId: e.turnId }));
  on("turn.complete", () => ({ text: "" }));
  on("ui.toast", () => ({ value: undefined }));
  on("prompt.submit", ($, e) => {
    if (e.origin?.kind === "plugin") sent.push({ text: e.text, asUser: e.origin.asUser });
    else entered.push(e.text);
    return { text: e.text };
  });
  on("prompt.fill", ($, e) => {
    filled.push(e.text);
    return { isFilled: true };
  });
  return { sent, filled, entered };
}

const typed = (text: string, turnId?: string) => ({
  text,
  wait: false,
  origin: { kind: "sdk" },
  ...(turnId ? { turnId } : {}),
});

async function working($) {
  await $.session.start({ surface: "vscode", isInteractive: true, cwd: "/work" });
  await $.turn.start({ text: "make a video, then post it", turnId: "t1" });
}

const settle = () => new Promise((r) => setTimeout(r, 20));

test("a plain message typed mid-task waits, then goes in when the task is done", async ($, on) => {
  const seen = setup(on);
  await working($);
  const answer = await $.prompt.submit(typed("after that, write the LinkedIn post", "t1") as any);
  expect(answer.drop).toMatch(/Queued: sent when Claude finishes/);
  expect(seen.entered).toEqual([]);

  await $.turn.complete({ turnId: "t1", ...DONE } as any);
  await settle();
  expect(seen.sent).toEqual([{ text: "after that, write the LinkedIn post", asUser: true }]);
});

test('"now:" goes straight into the running task, without the prefix', async ($, on) => {
  const seen = setup(on);
  await working($);
  const answer = await $.prompt.submit(typed("Now: make it 30 seconds, not 60", "t1") as any);
  expect(answer.drop).toBeUndefined();
  expect(seen.entered).toEqual(["make it 30 seconds, not 60"]);
  await $.turn.complete({ turnId: "t1", ...DONE } as any);
  await settle();
  expect(seen.sent).toEqual([]);
});

test("between tasks, messages go in as usual", async ($, on) => {
  const seen = setup(on);
  await $.session.start({ surface: "vscode", isInteractive: true, cwd: "/work" });
  await $.prompt.submit(typed("hello") as any);
  await $.prompt.submit(typed("now: hi") as any);
  expect(seen.entered).toEqual(["hello", "hi"]);
});

test("stopping Claude puts queued messages back in the box instead of sending them", async ($, on) => {
  const seen = setup(on);
  await working($);
  await $.prompt.submit(typed("then post it", "t1") as any);
  await $.turn.complete({ turnId: "t1", ...DONE, reason: "aborted", isAborted: true } as any);
  await settle();
  expect(seen.sent).toEqual([]);
  expect(seen.filled).toEqual(["then post it"]);
});

test("task notifications, pictures and subagent turns are left alone", async ($, on) => {
  const seen = setup(on);
  await working($);
  await $.prompt.submit({
    text: "<task-notification>done</task-notification>",
    wait: false,
    turnId: "t1",
    origin: { kind: "task-notification" },
  } as any);
  await $.prompt.submit({
    ...typed("look at this", "t1"),
    attachments: [{ kind: "image" }],
  } as any);
  expect(seen.entered).toHaveLength(2);

  await $.turn.start({ text: "", turnId: "sub" });
  await $.prompt.submit(typed("queued while a helper runs", "t1") as any);
  await $.turn.complete({ turnId: "sub", agentId: "a1", ...DONE } as any);
  await settle();
  expect(seen.sent).toEqual([]);
  await $.turn.complete({ turnId: "t1", ...DONE } as any);
  await settle();
  expect(seen.sent.map((s) => s.text)).toEqual(["queued while a helper runs"]);
});

test("off in Crew's agent runs", async ($, on) => {
  const seen = setup(on, { CREW_WORKER: "1" });
  await working($);
  await $.prompt.submit(typed("hold me", "t1") as any);
  expect(seen.entered).toEqual(["hold me"]);
});

test("VS Code's typed messages (origin human) are held too", async ($, on) => {
  const seen = setup(on);
  await working($);
  const answer = await $.prompt.submit({
    text: "after this, also write summary.md",
    wait: false,
    turnId: "t1",
    origin: { kind: "human" },
  } as any);
  expect(answer.drop).toMatch(/Queued/);
  await $.turn.complete({ turnId: "t1", ...DONE } as any);
  await settle();
  expect(seen.sent.map((s) => s.text)).toEqual(["after this, also write summary.md"]);
});

test("held even when the typed message carries no turnId (VS Code)", async ($, on) => {
  const seen = setup(on);
  await working($);
  const answer = await $.prompt.submit({
    text: "after this, also write notes.md",
    wait: false,
    origin: { kind: "human" },
  } as any);
  expect(answer.drop).toMatch(/Queued/);
  await $.turn.complete({ turnId: "t1", ...DONE } as any);
  await settle();
  expect(seen.sent.map((s) => s.text)).toEqual(["after this, also write notes.md"]);
});

test("a message typed while idle goes straight in", async ($, on) => {
  const seen = setup(on);
  await $.session.start({ surface: "vscode", isInteractive: true, cwd: "/work" });
  await $.prompt.submit({ text: "hello", wait: false, origin: { kind: "human" } } as any);
  expect(seen.entered).toEqual(["hello"]);
});
