import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { discoverAndLoadExtensions, SessionManager } from "@earendil-works/pi-coding-agent";

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
  assert.deepEqual([...extension.commands.keys()].sort(), ["save-conversation", "save-conversation-all"]);
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
  const assistant = (text) => session.appendMessage({
    role: "assistant", content: [{ type: "text", text }], api: "openai-responses",
    provider: "test", model: "test-model", stopReason: "stop", timestamp: Date.now(),
    usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  });
  const outputDir = join(root, "ai-conversations");
  const firstUser = user("中文提问：如何自动保存？");
  assistant("首轮回复 ✅\n\n```js\nconsole.log('你好');\n```");
  await save();
  const [firstFile] = await readdir(outputDir);
  const firstPath = join(outputDir, firstFile);
  const firstContent = await readFile(firstPath, "utf8");
  assert.match(firstContent, /中文提问：如何自动保存？/);
  assert.match(firstContent, /首轮回复 ✅/);
  assert.match(firstContent, /```js\nconsole\.log\('你好'\);\n```/);
  assert.match(firstContent, /session_id:/);

  await save();
  assert.equal(await readFile(firstPath, "utf8"), firstContent);
  session = SessionManager.open(session.getSessionFile());
  user("第二轮提问");
  assistant("第二轮回答");
  await save();
  assert.deepEqual(await readdir(outputDir), [firstFile]);
  const continued = await readFile(firstPath, "utf8");
  assert.equal(continued.split("首轮回复 ✅").length - 1, 1);
  assert.match(continued, /第二轮回答/);

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
