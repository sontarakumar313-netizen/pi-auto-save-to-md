import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { discoverAndLoadExtensions, SessionManager } from "@earendil-works/pi-coding-agent";

test("Codex fast mode persists per branch and only rewrites Codex requests", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-codex-fast-"));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    await rm(root, { recursive: true });
  });
  const packageDir = dirname(fileURLToPath(import.meta.url));
  let loaded = await discoverAndLoadExtensions([packageDir], root, join(root, "agent"));
  assert.deepEqual(loaded.errors, []);
  let extension = loaded.extensions[0];
  const session = SessionManager.inMemory(root);
  const notifications = [];
  const statuses = new Map();
  const ctx = {
    cwd: root, hasUI: true, sessionManager: session,
    model: { provider: "openai-codex", api: "openai-codex-responses" },
    ui: {
      notify: (message, level) => notifications.push({ message, level }),
      setStatus: (key, text) => statuses.set(key, text),
    },
  };
  loaded.runtime.appendEntry = (type, data) => session.appendCustomEntry(type, data);
  const emit = (type, fields = {}) => extension.handlers.get(type)[0]({ type, ...fields }, ctx);
  const command = (args) => extension.commands.get("codex-fast").handler(args, ctx);
  const payload = { model: "codex-test", input: [], reasoning: { effort: "high" } };
  const request = () => emit("before_provider_request", { payload });

  await emit("session_start");
  assert.equal(await request(), undefined);
  await command("on");
  const onLeaf = session.getLeafId();
  assert.deepEqual(await request(), { ...payload, service_tier: "priority" });
  assert.equal(payload.service_tier, undefined);
  assert.equal(statuses.get("codex-fast"), "Codex fast: on");
  const entryCount = session.getEntries().length;
  await command("status");
  await command("");
  await command("invalid");
  assert.equal(session.getEntries().length, entryCount);
  assert.equal(notifications.at(-1).level, "error");
  assert.deepEqual(await request(), { ...payload, service_tier: "priority" });

  for (const provider of ["openai", "anthropic", "custom-proxy"]) {
    ctx.model = { provider, api: "openai-responses" };
    await emit("model_select");
    assert.equal(await request(), undefined);
    assert.equal(statuses.get("codex-fast"), "Codex fast: on (inactive)");
  }
  ctx.model = { provider: "openai-codex", api: "openai-codex-responses" };

  // Reloading creates a fresh extension instance; its setting comes from the session.
  loaded = await discoverAndLoadExtensions([packageDir], root, join(root, "agent"));
  assert.deepEqual(loaded.errors, []);
  extension = loaded.extensions[0];
  loaded.runtime.appendEntry = (type, data) => session.appendCustomEntry(type, data);
  await emit("session_start");
  assert.deepEqual(await request(), { ...payload, service_tier: "priority" });
  await command("off");
  const offLeaf = session.getLeafId();
  assert.equal(await request(), undefined);
  assert.equal(statuses.get("codex-fast"), undefined);

  session.branch(onLeaf);
  await emit("session_tree");
  assert.deepEqual(await request(), { ...payload, service_tier: "priority" });
  session.branch(offLeaf);
  await emit("session_tree");
  assert.equal(await request(), undefined);

  ctx.sessionManager = SessionManager.inMemory(root);
  await emit("session_start");
  assert.equal(await request(), undefined);
});

test("Pi loads the package and saves, resumes and branches without duplicate messages", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-auto-save-to-md-"));
  t.after(async () => {
    // Only delete this test's directory directly inside the OS temp directory.
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    await rm(root, { recursive: true });
  });
  const previousDir = process.env.PI_SAVE_CONVERSATION_DIR;
  delete process.env.PI_SAVE_CONVERSATION_DIR;
  t.after(() => {
    if (previousDir === undefined) delete process.env.PI_SAVE_CONVERSATION_DIR;
    else process.env.PI_SAVE_CONVERSATION_DIR = previousDir;
  });

  const packageDir = dirname(fileURLToPath(import.meta.url));
  const loaded = await discoverAndLoadExtensions([packageDir], root, join(root, "agent"));
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  const extension = loaded.extensions[0];
  assert.deepEqual([...extension.commands.keys()].sort(), ["codex-fast", "save-conversation", "save-conversation-all"]);
  assert.equal(extension.handlers.get("agent_settled").length, 1);

  let session = SessionManager.create(root, join(root, "sessions"));
  loaded.runtime.appendEntry = (type, data) => session.appendCustomEntry(type, data);
  const notifications = [];
  const context = () => ({
    cwd: root,
    hasUI: true,
    sessionManager: session,
    ui: { notify: (message, level) => notifications.push({ message, level }) },
  });
  const save = () => extension.handlers.get("agent_settled")[0]({ type: "agent_settled" }, context());
  const user = (text) => session.appendMessage({ role: "user", content: text, timestamp: Date.now() });
  const assistantBlocks = (content, stopReason = "stop") => session.appendMessage({
    role: "assistant", content, api: "openai-responses",
    provider: "test", model: "test-model", stopReason, timestamp: Date.now(),
    usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  });
  const assistant = (text) => assistantBlocks([{ type: "text", text }]);
  const toolResult = (toolCallId) => session.appendMessage({
    role: "toolResult", toolCallId, toolName: "hidden_tool",
    content: [{ type: "text", text: "HIDDEN_TOOL_RESULT" }], isError: false, timestamp: Date.now(),
  });
  const outputDir = join(root, "ai-conversations");
  const firstUser = user("中文提问：如何自动保存？");
  assistant("INTERMEDIATE_UPDATE：我先检查一下。");
  assistantBlocks([
    { type: "thinking", thinking: "先分析保存逻辑。\n\n再检查事件。" },
    { type: "text", text: "INTERMEDIATE_UPDATE：正在读取文件。" },
    { type: "toolCall", id: "call-1", name: "hidden_tool", arguments: { path: "HIDDEN_TOOL_ARGUMENT" } },
  ]);
  toolResult("call-1");
  assistantBlocks([{ type: "toolCall", id: "call-2", name: "hidden_tool", arguments: {} }]);
  toolResult("call-2");
  toolResult("orphan-call");
  // A manual save during tool execution must not export an intermediate reply.
  await extension.commands.get("save-conversation").handler("", context());
  const [pendingFile] = await readdir(outputDir);
  const pending = await readFile(join(outputDir, pendingFile), "utf8");
  assert.match(pending, /中文提问：如何自动保存？/);
  assert.doesNotMatch(pending, /^Assistant |INTERMEDIATE_UPDATE|先分析保存逻辑/gm);
  assistantBlocks([
    { type: "thinking", thinking: "保存逻辑已经确认。" },
    { type: "text", text: "首轮回复 ✅\n\n```js\nconsole.log('你好');\n```" },
  ]);
  await save();
  const [firstFile] = await readdir(outputDir);
  const firstPath = join(outputDir, firstFile);
  const firstContent = await readFile(firstPath, "utf8");
  assert.match(firstContent, /中文提问：如何自动保存？/);
  assert.match(firstContent, /首轮回复 ✅/);
  assert.match(firstContent, /```js\nconsole\.log\('你好'\);\n```/);
  assert.match(firstContent, /session_id:/);
  assert.match(firstContent, /format_version: "2\.1"/);
  assert.doesNotMatch(firstContent, /<details>|Thinking|先分析保存逻辑|保存逻辑已经确认|INTERMEDIATE_UPDATE/);
  assert.doesNotMatch(firstContent, /hidden_tool|HIDDEN_TOOL|Tool Calls|\[!tldr\]|empty response/);
  assert.equal((firstContent.match(/^Assistant /gm) ?? []).length, 1);
  assert.equal((firstContent.match(/^User /gm) ?? []).length, 1);

  await save();
  assert.equal(await readFile(firstPath, "utf8"), firstContent);
  session = SessionManager.open(session.getSessionFile());
  toolResult("late-call");
  user("第二轮提问");
  assistant("INTERMEDIATE_UPDATE：继续检查。");
  assistantBlocks([{ type: "text", text: "FAILED_RETRY" }], "error");
  assistant("第二轮回答");
  user("第三轮提问");
  assistant("INTERMEDIATE_UPDATE：补充检查。");
  assistant("第三轮回答");
  await save();
  assert.deepEqual(await readdir(outputDir), [firstFile]);
  const continued = await readFile(firstPath, "utf8");
  assert.equal(continued.split("首轮回复 ✅").length - 1, 1);
  assert.match(continued, /第二轮回答/);
  assert.match(continued, /第三轮回答/);
  assert.doesNotMatch(continued, /hidden_tool|HIDDEN_TOOL|<details>|INTERMEDIATE_UPDATE|FAILED_RETRY/);
  assert.equal((continued.match(/^Assistant /gm) ?? []).length, 3);
  assert.equal((continued.match(/^User /gm) ?? []).length, 3);

  session.branch(firstUser);
  assistant("另一分支的回答");
  await save();
  const files = await readdir(outputDir);
  assert.equal(files.length, 2);
  assert.equal(await readFile(firstPath, "utf8"), continued);
  const branch = await readFile(join(outputDir, files.find((file) => file !== firstFile)), "utf8");
  assert.match(branch, /另一分支的回答/);
  assert.doesNotMatch(branch, /第二轮回答/);

  session = SessionManager.inMemory(root);
  user("临时会话");
  assistant("手动归档临时回复");
  await save();
  assert.equal((await readdir(outputDir)).length, 2);
  await extension.commands.get("save-conversation").handler("", context());
  assert.equal((await readdir(outputDir)).length, 3);
  assert.deepEqual(notifications.filter(({ level }) => level === "error"), []);
});
