/**
 * dsh-ark-usage — host half.
 *
 * 注册一个 HTTP 路由：
 *
 *   GET /api/ark-usage   火山方舟 Coding Plan 的用量（5 小时 / 周 / 月）与重置时间
 *
 * 数据来源：本机已登录的 arkcli（等价于 `arkcli usage plan --format json`）。
 * 走的是你本机 `~/.arkcli` 里那套 SSO 会话，插件本身不存任何密钥。
 *
 * 为什么不直接用 API：Coding Plan 的配额查询在控制面，要 SSO/STS 签名，
 * API Key 只能打推理接口。让已经登录过的 arkcli 去查，是当前最稳的路子；
 * 没装 arkcli 时卡片显示一句人话，不会静默显示 0。
 *
 * 为什么要自己找 node：Windows 上 `arkcli.cmd` 是个批处理垫片，必须过 cmd.exe，
 * 而 cmd 的引号规则和 Node 的 spawn 规则叠在一起很容易把路径吃掉。
 * 垫片实际做的就是 `node <npm>/node_modules/@volcengine/ark-cli/scripts/run.js`，
 * 那我们就照着做——绕开 cmd，直接起 node。
 *
 * 缓存：成功 60 秒（百分比变化很慢，而且每次查询要起一个进程）；
 * 失败只缓存 10 秒，用户修好登录后不用等一分钟。
 */
import { execFile } from "node:child_process";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const name = "dsh-ark-usage";
export const inject = ["webServer"];

const ROUTE_PATH = "/api/ark-usage";
const OK_CACHE_MS = 60 * 1000;
const ERR_CACHE_MS = 10 * 1000;
const CLI_TIMEOUT_MS = 30 * 1000;

const LABELS = {
  session: "近 5 小时",
  weekly: "近一周",
  monthly: "近一月",
};

const MESSAGES = {
  arkcliMissing: "没找到 arkcli。先装：npm i -g @volcengine/ark-cli，再运行 arkcli auth login",
  notLoggedIn: "arkcli 还没登录。在终端运行：arkcli auth login",
  timeout: "查询超时，稍后再试",
  parse: "arkcli 返回的内容看不懂，可能是版本更新了",
  network: "查询失败，检查网络或 arkcli 是否可用",
  method: "只支持 GET",
  forbidden: "只允许本机访问",
};

let cache = { at: 0, ok: false, body: null };

/* ---------------------------------------------------------------- 定位 CLI */

/** npm 全局目录（Windows）。非 Windows 返回 null。 */
function npmGlobalDir() {
  if (process.platform !== "win32") return null;
  const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appdata, "npm");
}

/** 可能的 node 可执行文件，按优先级排列。 */
function nodeCandidates() {
  const list = [];
  if (process.env.ARK_NODE_PATH) list.push(process.env.ARK_NODE_PATH);
  // 宿主进程若是普通 node，直接用自己最稳。
  if (!process.versions.electron) list.push(process.execPath);
  const npmDir = npmGlobalDir();
  if (npmDir) list.push(path.join(npmDir, "node.exe"));
  if (process.platform === "win32") {
    list.push(path.join("C:", "Program Files", "nodejs", "node.exe"));
  }
  list.push("node"); // 交给 PATH
  return [...new Set(list)];
}

async function exists(file) {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * 列出可用的启动方式：
 *   { file, args0 }  —— 把 usage 参数接在 args0 后面。
 */
async function runners() {
  const out = [];
  const npmDir = npmGlobalDir();
  if (npmDir) {
    const runJs = path.join(npmDir, "node_modules", "@volcengine", "ark-cli", "scripts", "run.js");
    if (await exists(runJs)) {
      for (const node of nodeCandidates()) out.push({ file: node, args0: [runJs], via: "node+run.js" });
    }
  }
  const override = process.env.ARKCLI_PATH;
  if (override) out.push({ file: override, args0: [], via: "ARKCLI_PATH" });
  if (process.platform !== "win32") out.push({ file: "arkcli", args0: [], via: "PATH" });
  return out;
}

/** 起一次 arkcli，返回 stdout 文本。 */
async function runArkcli(args) {
  const list = await runners();
  const failures = [];
  for (const runner of list) {
    try {
      const { stdout } = await execFileP(runner.file, [...runner.args0, ...args], {
        timeout: CLI_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        encoding: "utf8",
      });
      return stdout;
    } catch (error) {
      failures.push(error);
      // 只有「这个启动方式根本不存在」才换下一种；其余错误已经代表真实结果。
      if (!/ENOENT|EACCES/i.test(String(error?.code || ""))) throw error;
    }
  }
  const error = failures[0] || new Error("arkcli not found");
  error.code = error.code || "ENOENT";
  throw error;
}

/* ---------------------------------------------------------------- 数据整理 */

/** 把 arkcli 的 JSON 结果压成卡片要的形状；解析不出来返回 null。 */
function shape(raw) {
  let doc;
  try {
    doc = JSON.parse(String(raw).trim());
  } catch {
    return null;
  }
  const item = Array.isArray(doc?.items) ? doc.items[0] : null;
  if (!item || !Array.isArray(item.periods)) return null;
  const windows = item.periods
    .filter((p) => p && typeof p.percent === "number")
    .map((p) => {
      // arkcli 给的是 0–1 的比例（0.04998 = 5%）；老版本若给 0–100，这里也兼容。
      const ratio = p.percent <= 1 ? p.percent * 100 : p.percent;
      return {
        key: String(p.label || ""),
        label: LABELS[p.label] || String(p.label || ""),
        percent: Math.round(ratio * 100) / 100,
        resetsAt: typeof p.reset_at === "string" ? p.reset_at : null,
      };
    });
  const viewer = doc?.viewer || {};
  return {
    ok: true,
    plan: {
      product: item.product || "coding-plan",
      edition: item.edition || "",
      subscribed: item.subscribed === true,
      region: viewer.region || "",
      account: viewer.user_name || "",
    },
    windows,
    fetchedAt: new Date().toISOString(),
  };
}

function classify(error) {
  const all = `${String(error?.message || "")}\n${String(error?.stderr || "")}`;
  if (/ENOENT|不是内部或外部命令|not recognized/i.test(all)) {
    return { ok: false, error: "arkcli-missing", message: MESSAGES.arkcliMissing };
  }
  if (/not logged in|未登录|无法识别当前用户身份|authentication|401|Unauthorized|SSO/i.test(all)) {
    return { ok: false, error: "not-logged-in", message: MESSAGES.notLoggedIn };
  }
  if (/timeout|ETIMEDOUT|timed out/i.test(all)) {
    return { ok: false, error: "timeout", message: MESSAGES.timeout };
  }
  return { ok: false, error: "network", message: MESSAGES.network };
}

async function fetchUsage() {
  const ttl = cache.body && Date.now() - cache.at < (cache.ok ? OK_CACHE_MS : ERR_CACHE_MS);
  if (cache.body && ttl) return cache.body;

  let body;
  try {
    const out = await runArkcli(["usage", "plan", "--format", "json"]);
    body = shape(out) || { ok: false, error: "parse", message: MESSAGES.parse };
  } catch (error) {
    body = classify(error);
  }
  cache = { at: Date.now(), ok: body.ok === true, body };
  return body;
}

/* ---------------------------------------------------------------- HTTP 路由 */

function sendJson(res, status, value) {
  const text = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(text);
}

/** 只接受本机来源：Host 头必须是回环地址（防 DNS rebinding / 局域网直连）。 */
function isLoopbackHost(headerHost) {
  if (typeof headerHost !== "string" || headerHost === "") return false;
  let host = headerHost.trim().toLowerCase();
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end === -1) return false;
    host = host.slice(1, end);
  } else {
    // 只有「恰好一个冒号」时才是 v4:port；没有冒号说明就是主机名本身。
    const idx = host.lastIndexOf(":");
    if (idx !== -1 && idx === host.indexOf(":")) host = host.slice(0, idx);
  }
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "0:0:0:0:0:0:0:1";
}

export function apply(ctx) {
  const register = () => ctx.webServer.register({
    kind: "exact",
    path: ROUTE_PATH,
    handler: async (req, res) => {
      try {
        if (req.method !== "GET" && req.method !== "HEAD") {
          return sendJson(res, 405, { ok: false, error: "method", message: MESSAGES.method });
        }
        if (!isLoopbackHost(req.headers?.host)) {
          return sendJson(res, 403, { ok: false, error: "forbidden", message: MESSAGES.forbidden });
        }
        const body = await fetchUsage();
        return sendJson(res, 200, body);
      } catch {
        return sendJson(res, 200, { ok: false, error: "network", message: MESSAGES.network });
      }
    },
  });

  if (typeof ctx.effect === "function") {
    ctx.effect(register, "dsh-ark-usage: usage route");
  } else {
    register();
  }
}
