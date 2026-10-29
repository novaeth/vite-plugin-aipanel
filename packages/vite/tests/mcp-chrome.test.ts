/**
 * mcp-chrome 其余纯函数/编排函数的 vitest 单元测试（allow-origins.test.ts 之外）：
 * - getProjectOrigins：读 server.resolvedUrls（local/network），无需真实 Vite 服务；
 *   源码字段为 resolvedUrls，不是 config，此处按源码构造最小 stub。
 * - parseListPages / extractEvalValue：纯文本解析。
 * - validatePageId / resolveChromePageId：以 stub mcp（callChromeDevTool）驱动，
 *   不启动真实 Chrome / 进程，覆盖各失败分支与 sessionId 匹配流程。
 */
import { describe, expect, it, vi } from "vitest";
import type { McpProxy } from "../src/core/mcp-proxy";
import {
  extractEvalValue,
  getProjectOrigins,
  isProjectPage,
  parseListPages,
  resolveChromePageId,
  validatePageId,
  type PageInfo,
} from "../src/core/mcp-chrome";

type ServerStub = Parameters<typeof getProjectOrigins>[0];
type McpStub = { isRunning: boolean; callChromeDevTool: ReturnType<typeof vi.fn> };

function asMcp(stub: McpStub): McpProxy {
  return stub as unknown as McpProxy;
}

describe("getProjectOrigins", () => {
  it("从 resolvedUrls.local/network 提取去重后的 origin 列表", () => {
    const server = {
      resolvedUrls: {
        local: ["http://localhost:5173/", "http://localhost:5173/app"],
        network: ["http://192.168.1.2:5173/", "http://localhost:5173/"],
      },
    } as unknown as ServerStub;
    expect(getProjectOrigins(server)).toEqual(["http://localhost:5173", "http://192.168.1.2:5173"]);
  });

  it("缺少 resolvedUrls（如 mcpOnly 或 server 未就绪）时返回空数组", () => {
    expect(getProjectOrigins({} as unknown as ServerStub)).toEqual([]);
  });

  it("URL 尾部路径与查询串不进入 origin", () => {
    const server = {
      resolvedUrls: {
        local: ["http://localhost:5173/path?x=1"],
        network: [],
      },
    } as unknown as ServerStub;
    expect(getProjectOrigins(server)).toEqual(["http://localhost:5173"]);
  });
});

describe("parseListPages", () => {
  it("解析 pageId/title/url 与 selected 标记；无标题行以空 title 解析，垃圾行跳过", () => {
    const text = [
      "0: Example Domain (https://example.com/)",
      "1: DevTools Page (http://localhost:5173/) [selected]",
      "2: (http://no-title/)",
      "garbage line",
      "",
      "3: Docs — Getting Started (http://localhost:5173/docs)",
    ].join("\n");
    const pages = parseListPages(text);
    // "2: (http://no-title/)" 无标题：正则把分隔空白捕获为标题后 trim 为空串，仍解析出页面
    expect(pages).toEqual([
      { pageId: 0, title: "Example Domain", url: "https://example.com/", selected: false },
      { pageId: 1, title: "DevTools Page", url: "http://localhost:5173/", selected: true },
      { pageId: 2, title: "", url: "http://no-title/", selected: false },
      {
        pageId: 3,
        title: "Docs — Getting Started",
        url: "http://localhost:5173/docs",
        selected: false,
      },
    ]);
  });

  it("标题自带括号时仍以行尾括号组为 URL（真实页面：SuperHive (local) 等）", () => {
    const pages = parseListPages(
      [
        "3: 排查 GitOps 工具调不通问题 (1) — DeepSeek Harness (http://127.0.0.1:3080/)",
        "16: SuperHive (local) · 登录 (http://localhost:5173/login)",
      ].join("\n"),
    );
    expect(pages).toEqual([
      {
        pageId: 3,
        title: "排查 GitOps 工具调不通问题 (1) — DeepSeek Harness",
        url: "http://127.0.0.1:3080/",
        selected: false,
      },
      {
        pageId: 16,
        title: "SuperHive (local) · 登录",
        url: "http://localhost:5173/login",
        selected: false,
      },
    ]);
  });

  it("URL 自带括号时按括号深度取完整 URL", () => {
    const pages = parseListPages("4: Foo (https://en.wikipedia.org/wiki/Foo_(bar))");
    expect(pages).toEqual([
      {
        pageId: 4,
        title: "Foo",
        url: "https://en.wikipedia.org/wiki/Foo_(bar)",
        selected: false,
      },
    ]);
  });

  it("标题尾部省略号（...）会被裁剪，pageId 按十进制解析", () => {
    const pages = parseListPages("56: Building the app... (http://localhost:5173/)");
    expect(pages).toHaveLength(1);
    expect(pages[0].pageId).toBe(56);
    expect(pages[0].title).toBe("Building the app");
  });

  it("空输入与无匹配行返回空数组", () => {
    expect(parseListPages("")).toEqual([]);
    expect(parseListPages("   \n   ")).toEqual([]);
  });
});

describe("extractEvalValue", () => {
  const fenced = (json: string) => `Script ran on page and returned:\n\`\`\`json\n${json}\n\`\`\``;

  it("undefined / 空文本返回 undefined", () => {
    expect(extractEvalValue(undefined)).toBeUndefined();
    expect(extractEvalValue("")).toBeUndefined();
  });

  it("无 json 代码块时返回 trim 后的原文", () => {
    expect(extractEvalValue("  hello world  ")).toBe("hello world");
  });

  it("解析 json 代码块内的标量 JSON 值", () => {
    expect(extractEvalValue(fenced('"pk-abc"'))).toBe("pk-abc");
  });

  it("解析 json 代码块内的对象 JSON 值", () => {
    const out = extractEvalValue(fenced('{"a":1,"b":[true,null]}'));
    expect(out as unknown).toEqual({ a: 1, b: [true, null] });
  });

  it("代码块内为非法 JSON 时原样返回内容", () => {
    expect(extractEvalValue(fenced("not-json"))).toBe("not-json");
  });
});

describe("isProjectPage", () => {
  it("命中任一条目即视为项目页（条目匹配语义复用 isOriginEntryMatch）", () => {
    const origins = ["https://www.baidu.com", "https://*.example.com/**"];
    expect(isProjectPage("https://www.baidu.com/s?wd=1", origins)).toBe(true);
    expect(isProjectPage("https://sub.example.com/x", origins)).toBe(true);
    expect(isProjectPage("https://other.org/", origins)).toBe(false);
  });
});

describe("validatePageId", () => {
  const listText = [
    "0: Local App (http://localhost:5173/)",
    "1: External (https://www.baidu.com/)",
    "2: Other (https://other.org/)",
  ].join("\n");

  function stubWithList(callChromeDevTool: McpStub["callChromeDevTool"]): McpProxy {
    return asMcp({ isRunning: true, callChromeDevTool });
  }

  it("pageId 命中可操作范围页面时返回 valid 与过滤后的 allowedPages", async () => {
    const mcp = stubWithList(
      vi.fn().mockResolvedValue({ result: { content: [{ text: listText }] } }),
    );
    const result = await validatePageId(mcp, 1, ["http://localhost:5173", "https://www.baidu.com"]);
    expect(result.valid).toBe(true);
    expect((result as { allowedPages: PageInfo[] }).allowedPages).toEqual([
      { pageId: 0, title: "Local App", url: "http://localhost:5173/", selected: false },
      { pageId: 1, title: "External", url: "https://www.baidu.com/", selected: false },
    ]);
    expect(mcp.callChromeDevTool).toHaveBeenCalledWith("list_pages", {});
  });

  it("范围外的 pageId 返回 invalid，错误信息包含可操作提示，并给出 allowedPages", async () => {
    const mcp = stubWithList(
      vi.fn().mockResolvedValue({ result: { content: [{ text: listText }] } }),
    );
    const result = await validatePageId(mcp, 2, ["http://localhost:5173"]);
    expect(result.valid).toBe(false);
    expect((result as { error: string }).error).toContain("不在可操作范围");
    // 页面 0 属于范围，页面 2 被过滤掉
    const allowed = (result as { allowedPages: PageInfo[] }).allowedPages;
    expect(allowed.map((p) => p.pageId)).toEqual([0]);
  });

  it("list_pages 返回 error（Chrome 未连接等）时透传错误信息", async () => {
    const mcp = stubWithList(
      vi.fn().mockResolvedValue({ error: { message: "Chrome DevTools not connected" } }),
    );
    const result = await validatePageId(mcp, 1, ["http://localhost:5173"]);
    expect(result.valid).toBe(false);
    expect((result as { error: string }).error).toBe("Chrome DevTools not connected");
    expect((result as { allowedPages: PageInfo[] }).allowedPages).toEqual([]);
  });

  it("list_pages 无 result 时给出默认失败原因，而非误报 pageId 无效", async () => {
    const mcp = stubWithList(vi.fn().mockResolvedValue({}));
    const result = await validatePageId(mcp, 1, ["http://localhost:5173"]);
    expect(result.valid).toBe(false);
    expect((result as { error: string }).error).toContain("无法获取 Chrome 页面列表");
  });
});

describe("resolveChromePageId", () => {
  const ALL_PAGES: PageInfo[] = [
    { pageId: 7, url: "https://app.example.com/", title: "App A", selected: false },
    { pageId: 9, url: "https://app.example.com/", title: "App B", selected: false },
  ];
  const OPERATIONS_ORIGINS = ["https://app.example.com"];

  /** 构造 sessionStorage 查询型 mcp：按当前 select 的 pageId 返回 sessionId */
  function sessionStorageStub(sessionByPage: Map<number, string | null>): McpStub {
    let selected = -1;
    const callChromeDevTool = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "select_page") {
        selected = args.pageId as number;
        return { result: {} };
      }
      if (name === "evaluate_script") {
        const sid = sessionByPage.get(selected) ?? null;
        const text =
          sid === null
            ? "Script ran on page and returned:\n```json\nnull\n```"
            : `Script ran on page and returned:\n\`\`\`json\n"${sid}"\n\`\`\``;
        return { result: { content: [{ text }] } };
      }
      return { result: {} };
    });
    return { isRunning: true, callChromeDevTool };
  }

  it("mcp 未初始化时返回明确原因", async () => {
    const result = await resolveChromePageId(
      undefined,
      "https://app.example.com/",
      "App",
      OPERATIONS_ORIGINS,
    );
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toBe("MCP 模块未初始化");
  });

  it("mcp 进程未启动时返回明确原因", async () => {
    const mcp = asMcp({ isRunning: false, callChromeDevTool: vi.fn() });
    const result = await resolveChromePageId(
      mcp,
      "https://app.example.com/",
      "App",
      OPERATIONS_ORIGINS,
    );
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("未启动");
  });

  it("URL 为空时返回原因，不触碰 mcp", async () => {
    const mcp = asMcp({ isRunning: true, callChromeDevTool: vi.fn() });
    const result = await resolveChromePageId(mcp, "", "App", OPERATIONS_ORIGINS);
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("URL 为空");
    expect(mcp.callChromeDevTool).not.toHaveBeenCalled();
  });

  it("按 sessionId 遍历匹配页面，命中后返回 pageId（传入 pages 免重复 list_pages）", async () => {
    const mcp = sessionStorageStub(
      new Map([
        [7, "other"],
        [9, "pk-1"],
      ]),
    );
    const result = await resolveChromePageId(
      mcp as unknown as McpProxy,
      "https://app.example.com/x",
      "App",
      OPERATIONS_ORIGINS,
      "pk-1",
      ALL_PAGES,
    );
    expect(result).toEqual({ ok: true, pageId: 9 });
    // 逐页 select_page + evaluate_script：命中页（第 2 页）也先被 select 后才匹配
    const calls = mcp.callChromeDevTool.mock.calls.map((c) => c[0]);
    expect(calls.filter((n) => n === "select_page").length).toBe(2);
    expect(calls.filter((n) => n === "evaluate_script").length).toBe(2);
  });

  it("命中后若原选中页不同则恢复选中页（避免副作用）", async () => {
    const mcp = sessionStorageStub(
      new Map([
        [7, "pk-1"],
        [9, "other"],
      ]),
    );
    const result = await resolveChromePageId(
      mcp as unknown as McpProxy,
      "https://app.example.com/",
      "App",
      OPERATIONS_ORIGINS,
      "pk-1",
      ALL_PAGES,
      9,
    );
    expect(result).toEqual({ ok: true, pageId: 7 });
    const selects = mcp.callChromeDevTool.mock.calls
      .filter((c) => c[0] === "select_page")
      .map((c) => (c[1] as { pageId: number }).pageId);
    expect(selects).toEqual([7, 9]);
  });

  it("无 sessionId 时不做 URL 降级，返回缺失会话标识错误", async () => {
    const mcp = asMcp({ isRunning: true, callChromeDevTool: vi.fn() });
    const result = await resolveChromePageId(
      mcp as unknown as McpProxy,
      "https://app.example.com/",
      "App",
      OPERATIONS_ORIGINS,
      undefined,
      ALL_PAGES,
    );
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("_aipanel_pk");
    expect(mcp.callChromeDevTool).not.toHaveBeenCalled();
  });

  it("全部页面都未匹配 sessionId 时返回失败，且不误报成功", async () => {
    const mcp = sessionStorageStub(
      new Map([
        [7, "zzz"],
        [9, "yyy"],
      ]),
    );
    const result = await resolveChromePageId(
      mcp as unknown as McpProxy,
      "https://app.example.com/",
      "App",
      OPERATIONS_ORIGINS,
      "pk-1",
      ALL_PAGES,
    );
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("未能通过会话标识找到目标页面");
  });
});
