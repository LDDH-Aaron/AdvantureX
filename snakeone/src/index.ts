import { Spectrum } from "spectrum-ts";
import { imessage } from "@spectrum-ts/imessage";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

/**
 * Wingman Photon Agent
 *
 * Inbound commands use the current iMessage conversation. The local control
 * endpoint below provides a separate cold-start DM path for the web dashboard.
 */
const app = await Spectrum({
  projectId: process.env.PROJECT_ID!,
  projectSecret: process.env.PROJECT_SECRET!,
  providers: [imessage.config()],
});

const DEFAULT_DELAY_SECONDS = 10;
const DEFAULT_REMINDER = "Wingman：你请求的私人提醒已到。需要继续时回复“延后 30 秒”，回复“取消”可停止。";
const CONTROL_HOST = "127.0.0.1";
const CONTROL_PORT = Number(process.env.WINGMAN_PORT ?? 8787);
const CONTROL_SECRET = process.env.WINGMAN_SHARED_SECRET?.trim();

type Rescue = { dueAt: Date; timer: NodeJS.Timeout; message: string };
const rescues = new Map<string, Rescue>();

const normalize = (text: string) => text.trim().toLowerCase().replaceAll(" ", "");

function readDelay(text: string): number | null {
  const match = text.match(/(?:救场|救我|延后|再等|改成|提醒我|倒计时)\D*(\d{1,3})\s*(?:秒|s)?/i);
  return match ? Math.min(Math.max(Number(match[1]), 1), 3_600) : null;
}

function isRescueRequest(text: string): boolean {
  return ["救我", "救场", "救救我", "帮我离开", "发个提醒", "启动救场"].some((word) => text.includes(word));
}

function coachReply(text: string): string | null {
  return text.includes("下一句") || text.includes("聊什么") || text.includes("自然一点")
    ? "你可以问：你们最开始怎么想到这个方向的？"
    : null;
}

async function cancelRescue(spaceId: string): Promise<boolean> {
  const rescue = rescues.get(spaceId);
  if (!rescue) return false;
  clearTimeout(rescue.timer);
  rescues.delete(spaceId);
  return true;
}

async function scheduleRescue(
  space: { id: string; send: (content: string) => Promise<unknown> },
  seconds: number,
  message = DEFAULT_REMINDER,
): Promise<void> {
  await cancelRescue(space.id);
  const dueAt = new Date(Date.now() + seconds * 1_000);
  const timer = setTimeout(() => {
    // Proactive follow-up: this sends without a second inbound message.
    void space.send(message).catch((error: unknown) => {
      console.error("Rescue delivery failed", error);
    }).finally(() => rescues.delete(space.id));
  }, seconds * 1_000);
  rescues.set(space.id, { dueAt, timer, message });
}

function remainingSeconds(spaceId: string): number | null {
  const rescue = rescues.get(spaceId);
  return rescue ? Math.max(0, Math.ceil((rescue.dueAt.getTime() - Date.now()) / 1_000)) : null;
}

function help(): string {
  return [
    "我是 Wingman，你的私密社交僚机。",
    "发送“救我”启动 10 秒救场提醒；也可以说“救场 30 秒”。",
    "发送“取消”“延后 30 秒”“状态”。",
    "发送“下一句聊什么？”获取一句聊天建议。",
    "在群聊中使用相同命令，提醒只会发送回该群。",
  ].join("\n");
}

function json(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += data.length;
    if (length > 16_384) throw new Error("Request body is too large.");
    chunks.push(data);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Opens or reuses a DM and sends from the Agent's own iMessage identity. */
async function sendPrivateMessage(to: string, text: string): Promise<string | null> {
  const im = imessage(app);
  const recipient = await im.user(to);
  const dm = await im.space.create(recipient);
  const sent = await dm.send(text);
  return Array.isArray(sent) ? (sent.at(-1)?.id ?? null) : (sent?.id ?? null);
}

function startControlServer(): void {
  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", `http://${CONTROL_HOST}:${CONTROL_PORT}`);
    if (req.method === "GET" && requestUrl.pathname === "/health") {
      json(res, 200, { ok: true, provider: "iMessage", control: "ready" });
      return;
    }
    if (req.method !== "POST" || requestUrl.pathname !== "/send") {
      json(res, 404, { detail: "Not found" });
      return;
    }
    if (!CONTROL_SECRET) {
      json(res, 503, { detail: "WINGMAN_SHARED_SECRET is not configured on the Agent." });
      return;
    }
    if (req.headers["x-wingman-secret"] !== CONTROL_SECRET) {
      json(res, 401, { detail: "Unauthorized" });
      return;
    }
    try {
      const body = await readJson(req);
      const { to, text } = body as { to?: unknown; text?: unknown };
      if (typeof to !== "string" || !to.trim() || typeof text !== "string" || !text.trim()) {
        json(res, 422, { detail: "Both 'to' and 'text' are required." });
        return;
      }
      if (to.length > 120 || text.length > 2_000) {
        json(res, 422, { detail: "Recipient or message is too long." });
        return;
      }
      const messageId = await sendPrivateMessage(to.trim(), text.trim());
      console.log("Dashboard initiated iMessage", { to: to.trim(), messageId });
      json(res, 200, { mode: "live", message_id: messageId });
    } catch (error) {
      console.error("Dashboard message failed", error);
      json(res, 502, { detail: error instanceof Error ? error.message : "Spectrum delivery failed." });
    }
  });
  server.listen(CONTROL_PORT, CONTROL_HOST, () => {
    console.log(`Wingman web control is ready at http://${CONTROL_HOST}:${CONTROL_PORT}`);
  });
}

startControlServer();
console.log("Wingman Photon Agent is online. Waiting for iMessage conversations...");

for await (const [space, message] of app.messages) {
  if (message.content.type !== "text") continue;
  const text = normalize(message.content.text);
  const delay = readDelay(text);

  if (text === "帮助" || text === "help" || text === "菜单") {
    await space.send(help());
  } else if (text === "取消" || text === "停" || text === "算了") {
    const cancelled = await cancelRescue(space.id);
    await space.send(cancelled ? "已取消当前救场提醒。" : "当前没有待执行的救场提醒。");
  } else if (text === "状态") {
    const seconds = remainingSeconds(space.id);
    await space.send(seconds === null ? "当前没有待执行的救场提醒。" : `救场提醒将在 ${seconds} 秒后发送。`);
  } else if (text.includes("延后") && delay !== null) {
    await scheduleRescue(space, delay);
    await space.send(`已调整为 ${delay} 秒后提醒。回复“取消”可停止。`);
  } else if (isRescueRequest(text)) {
    const seconds = delay ?? DEFAULT_DELAY_SECONDS;
    await scheduleRescue(space, seconds);
    await space.send(`救场已启动。${seconds} 秒后我会在这里主动发提醒；回复“取消”可停止。`);
  } else {
    const advice = coachReply(text);
    await space.send(advice ?? "我在。发送“帮助”查看可用指令。");
  }
}
