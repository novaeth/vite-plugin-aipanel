/**
 * MCP Chrome 页面相关工具
 *
 * 专注于 Chrome DevTools 页面匹配与解析逻辑
 */
import type { ViteDevServer } from "vite";
import picomatch from "picomatch";
import { createLogger } from "@aipanel/core/node";
import type { McpProxy } from "./mcp-proxy";

const log = createLogger("McpChrome");

// ========== Origin 匹配 ==========

/** 从 Vite 服务器解析的所有 URL 中提取项目 origin 列表 */
export function getProjectOrigins(server: ViteDevServer): string[] {
  const local = server.resolvedUrls?.local ?? [];
  const network = server.resolvedUrls?.network ?? [];
  const origins = [...new Set([...local, ...network].map((u) => new URL(u).origin))];
  log.debug("project origins", { origins });
  return origins;
}

// ========== allowOrigins 条目匹配 ==========

/**
 * allowOrigins 条目匹配：单条目写法决定匹配方式（编译结果缓存复用，单一来源）。
 * - 精确 origin（无 glob 语法、非正则字面量）：如 "https://example.com"，startsWith 前缀匹配，
 *   覆盖该 origin 下的任意路径（与现状行为一致）。
 * - glob 通配符：如 "https://*.example.com/**"，由 picomatch 匹配完整 URL
 *   （glob 中 * 不跨 /，需要放开路径时以 /** 结尾）。
 * - 正则字面量：形如 /pattern/ 或 /pattern/flags，对完整 URL 执行 RegExp.test（锚点由用户自控）。
 */
type OriginEntryMatcher =
  | { kind: "prefix" }
  | { kind: "glob"; match: (url: string) => boolean }
  | { kind: "regex"; re: RegExp };

const entryMatcherCache = new Map<string, OriginEntryMatcher>();

/** 解析正则字面量条目；不是正则写法时返回 undefined */
function parseRegexEntry(entry: string): OriginEntryMatcher | undefined {
  if (!entry.startsWith("/")) return undefined;
  const lastSlash = entry.lastIndexOf("/");
  if (lastSlash <= 0) return undefined;
  const source = entry.slice(1, lastSlash);
  const flags = entry.slice(lastSlash + 1);
  if (!/^[a-z]*$/.test(flags)) return undefined;
  try {
    return { kind: "regex", re: new RegExp(source, flags) };
  } catch {
    return undefined;
  }
}

function compileEntryMatcher(entry: string): OriginEntryMatcher {
  const cached = entryMatcherCache.get(entry);
  if (cached) return cached;
  let compiled: OriginEntryMatcher = { kind: "prefix" };
  const regexMatcher = parseRegexEntry(entry);
  if (regexMatcher) {
    compiled = regexMatcher;
  } else if (picomatch.scan(entry).isGlob) {
    compiled = { kind: "glob", match: picomatch(entry) };
  }
  entryMatcherCache.set(entry, compiled);
  return compiled;
}

/** 判断页面 URL 是否命中某个范围条目（allowOrigins 三种写法，见模块注释） */
export function isOriginEntryMatch(url: string, entry: string): boolean {
  const matcher = compileEntryMatcher(entry);
  if (matcher.kind === "regex") return matcher.re.test(url);
  if (matcher.kind === "glob") return matcher.match(url);
  return url.startsWith(entry);
}

/** 判断页面 URL 是否命中某组范围条目（可为精确 origin / 通配符 / 正则） */
export function isProjectPage(url: string, origins: string[]): boolean {
  return origins.some((entry) => isOriginEntryMatch(url, entry));
}
/** 判断页面 URL 是否属于可操作范围（范围条目，或启用时的扩展页） */
export function isPageAllowed(
  url: string,
  origins: string[],
  includeExtensions: boolean,
): boolean {
  if (origins.some((entry) => isOriginEntryMatch(url, entry))) return true;
  return includeExtensions && url.startsWith("chrome-extension://");
}


// ========== 页面解析 ==========

export interface PageInfo {
  pageId: number;
  url: string;
  title: string;
  /** Chrome DevTools 当前选中的页面 */
  selected: boolean;
}

/**
 * 从 "Title (URL)" 中拆出标题与 URL。
 * 标题和 URL 都可能自带括号（如 "SuperHive (local) · 登录"、"…/Foo_(bar)"），
 * 所以从行尾按括号深度反向定位 URL 的最外层左括号，而不是从左往右取第一对括号。
 */
function splitTitleAndUrl(content: string): { title: string; url: string } | null {
  if (!content.endsWith(")")) return null;
  let depth = 0;
  for (let i = content.length - 1; i >= 0; i--) {
    const ch = content[i];
    if (ch === ")") depth++;
    else if (ch === "(") {
      depth--;
      if (depth === 0) {
        const url = content.slice(i + 1, -1);
        if (!url || /\s/.test(url)) return null;
        return { title: content.slice(0, i).trim(), url };
      }
    }
  }
  return null;
}

/** 解析 list_pages 返回的文本。格式："56: Title (URL) [selected]" */
export function parseListPages(text: string): PageInfo[] {
  const pages: PageInfo[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    const selected = /\[selected\]/i.test(line);
    const match = line.replace(/\s*\[selected\]$/i, "").match(/^(\d+):\s*(.*)$/);
    if (!match) continue;
    const parsed = splitTitleAndUrl(match[2]);
    if (!parsed) continue;
    pages.push({
      pageId: parseInt(match[1], 10),
      title: parsed.title.replace(/\s*\.{3}$/, "").trim(),
      url: parsed.url,
      selected,
    });
  }
  return pages;
}

/** 从 evaluate_script 返回的格式化文本中提取 JSON 值 */
export function extractEvalValue(text: string | undefined): string | undefined {
  if (!text) return undefined;
  // evaluate_script 返回格式：
  // "Script ran on page and returned:\n```json\n\"value\"\n```"
  const marker = "```json\n";
  const startIdx = text.indexOf(marker);
  if (startIdx < 0) return text.trim();
  const contentStart = startIdx + marker.length;
  const endIdx = text.indexOf("\n```", contentStart);
  const jsonStr = endIdx < 0 ? text.substring(contentStart) : text.substring(contentStart, endIdx);
  try {
    return JSON.parse(jsonStr.trim());
  } catch {
    return jsonStr.trim();
  }
}

// ========== 页面定位 ==========

type PageIdResult = { ok: true; pageId: number } | { ok: false; error: string };

/**
 * 校验 pageId 是否属于可操作范围（项目页 ∪ allowOrigins）
 *
 * 调用 list_pages → 过滤允许页面 → 检查 pageId 是否在范围内。
 * 供 MCP 代理层和 Vue DevTools 端点共用。
 */
export async function validatePageId(
  mcp: McpProxy,
  pageId: number,
  operationsOrigins: string[],
  includeExtensions = false,
): Promise<
  | { valid: true; allowedPages: PageInfo[] }
  | { valid: false; error: string; allowedPages: PageInfo[] }
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listResult: any = await mcp.callChromeDevTool("list_pages", {});
  // list_pages 报错（Chrome 未连接等）时明确失败原因，避免误报"pageId 无效"
  if (listResult?.error || !listResult?.result) {
    return {
      valid: false,
      error:
        listResult?.error?.message ?? "无法获取 Chrome 页面列表，请确认 Chrome DevTools 已连接",
      allowedPages: [],
    };
  }
  const text: string | undefined = listResult?.result?.content?.[0]?.text;
  const allPages = text ? parseListPages(text) : [];
  const allowedPages = allPages.filter((p) =>
    isPageAllowed(p.url, operationsOrigins, includeExtensions),
  );
  const isValid = allowedPages.some((p) => p.pageId === pageId);

  if (!isValid) {
    return {
      valid: false,
      error: `pageId ${pageId} 不在可操作范围（项目页或 allowOrigins 白名单页），请先用 list_pages 获取有效页面 ID`,
      allowedPages,
    };
  }
  return { valid: true, allowedPages };
}

/**
 * 通过 MCP 解析当前页面对应的 Chrome DevTools pageId
 *
 * 策略：
 * 1. list_pages → 解析每行的 "pageId: title (URL)" 格式
 * 2. 仅用 sessionId（_aipanel_pk）匹配，跨导航可靠；不做 URL 降级匹配
 *
 * 失败时返回具体原因，由调用方透传给 Agent。
 */
export async function resolveChromePageId(
  mcp: McpProxy | undefined,
  url: string,
  title: string,
  operationsOrigins: string[],
  sessionId?: string,
  pages?: PageInfo[],
  /** Chrome 当前选中的 pageId（调用方传入，避免过滤后丢失范围外页面信息） */
  chromeSelectedPageId?: number,
): Promise<PageIdResult> {
  if (!mcp || !mcp.isRunning) {
    const reason = !mcp ? "MCP 模块未初始化" : "Chrome DevTools MCP 进程未启动";
    log.debug(`resolveChromePageId: ${reason}`);
    return { ok: false, error: reason };
  }
  if (!url) {
    return { ok: false, error: "页面 URL 为空，尚未收到上下文信息" };
  }

  try {
    // 支持传入已解析的页面列表，避免重复 list_pages 调用
    if (!pages) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listResult = (await mcp.callChromeDevTool("list_pages", {})) as any;
      const text: string | undefined = listResult?.result?.content?.[0]?.text;
      if (!text) {
        return { ok: false, error: "无法获取 Chrome 页面列表，请确认已打开目标页面" };
      }
      const allPages = parseListPages(text);

      // 保存 Chrome 原始选中页（可能不在项目页面中）
      chromeSelectedPageId = allPages.find((p) => p.selected)?.pageId;

      // 只匹配可操作范围页面，避免遍历无关标签页
      pages = allPages.filter((p) => isProjectPage(p.url, operationsOrigins));
    }
    log.debug("resolveChromePageId: list_pages result", {
      pages: pages.map((p) => ({ id: p.pageId, url: p.url, title: p.title.substring(0, 40) })),
      target: { url, title },
    });

    // 仅用 sessionId 匹配（跨导航可靠，遍历所有页面 evaluate_script）
    if (sessionId) {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      let matchedPageId: number | null = null;

      for (const page of pages) {
        await mcp.callChromeDevTool("select_page", { pageId: page.pageId, bringToFront: false });
        const evalResult: any = await mcp.callChromeDevTool("evaluate_script", {
          function: "() => sessionStorage.getItem('_aipanel_pk')",
        });
        const rawText: string | undefined = evalResult?.result?.content?.[0]?.text;
        const extracted = extractEvalValue(rawText);
        if (extracted === sessionId) {
          matchedPageId = page.pageId;
          break;
        }
      }

      // 恢复 Chrome 原来的选中页，避免副作用影响 selected 标记
      if (chromeSelectedPageId != null && chromeSelectedPageId !== matchedPageId) {
        await mcp.callChromeDevTool("select_page", {
          pageId: chromeSelectedPageId,
          bringToFront: false,
        });
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */

      if (matchedPageId != null) {
        return { ok: true, pageId: matchedPageId };
      }
      return {
        ok: false,
        error: `未能通过会话标识找到目标页面，请确认目标页面已打开`,
      };
    }

    // 无 sessionId：不做 URL 兜底，明确报错
    return {
      ok: false,
      error: `上下文缺少会话标识（_aipanel_pk），无法定位页面，请刷新目标页面后重试`,
    };
  } catch (err) {
    const msg = `MCP 调用失败: ${(err as Error).message}`;
    log.debug("Failed to resolve pageId via MCP", { error: (err as Error).message });
    return { ok: false, error: msg };
  }
}
