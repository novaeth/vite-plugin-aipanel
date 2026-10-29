/**
 * mcp-tools 纯逻辑的 vitest 单元测试（官方默认工具面快照在 official-default.test.ts）：
 * - displayToolName / MCP_PREFIX / withPageIdSchema / PAGE_ID_PROP；
 * - officialDefaultShorts 与元数据规则、OFFICIAL_GLOBAL_POLICY 的关系；
 * - isOfficialExtraTool / extraToolFlag / officialExtraCandidates（从官方 meta 派生）；
 * - configureToolScope 的 extra/deny 过滤与告警、currentOfficialShorts、isAllowedToolName 白名单守卫。
 * configureToolScope 持有模块级状态，afterEach 用空配置复位。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MCP_PREFIX,
  OFFICIAL_GLOBAL_POLICY,
  OFFICIAL_NO_PAGE_TOOLS,
  PAGE_ID_PROP,
  PROJECT_DESCRIPTION_NOTES,
  CUSTOM_TOOLS,
  configureToolScope,
  currentOfficialShorts,
  displayToolName,
  extraToolFlag,
  isAllowedToolName,
  isOfficialExtraTool,
  officialDefaultShorts,
  officialExtraCandidates,
  VUE_DEVTOOLS_TOOLS,
  withPageIdSchema,
} from "../src/core/mcp-tools";
import { SANITIZE_PLACEHOLDERS, SKIP_STATE_TYPES } from "../src/client/vue-devtools-sanitize";
import { VUE_DEVTOOLS_TIMELINE_DEFAULTS, VUE_DEVTOOLS_TIMELINE_INCLUDES } from "@aipanel/core";
import { OFFICIAL_TOOL_META } from "../src/core/official-meta";

/** 非 safe 分类（与源码 UNSAFE_CATEGORIES 一致，用于白名单外推校验） */
const UNSAFE_CATEGORIES = new Set(["EXTENSIONS", "PWA", "THIRD_PARTY", "WEBMCP"]);
const GLOBAL_POLICY = [...OFFICIAL_GLOBAL_POLICY];

afterEach(() => {
  // 复位模块级 extra/deny 状态
  configureToolScope();
});

describe("displayToolName / MCP_PREFIX", () => {
  it("displayToolName 前缀使用 MCP_PREFIX", () => {
    expect(MCP_PREFIX).toBe("chrome-devtools_");
    expect(displayToolName("click")).toBe("chrome-devtools_click");
    expect(displayToolName("")).toBe("chrome-devtools_");
  });
});

describe("withPageIdSchema / PAGE_ID_PROP", () => {
  it("保留原 properties 与 required，pageId 置为首位必填", () => {
    const schema = withPageIdSchema({
      type: "object",
      properties: { foo: { type: "string" }, bar: { type: "number" } },
      required: ["foo"],
    });
    expect(schema.type).toBe("object");
    expect(schema.properties.pageId).toEqual(PAGE_ID_PROP.pageId);
    expect(schema.properties.foo).toEqual({ type: "string" });
    expect(schema.required).toEqual(["pageId", "foo"]);
  });

  it("无 required 的原 schema 追加后仅必填 pageId", () => {
    const schema = withPageIdSchema({ type: "object", properties: {} });
    expect(schema.required).toEqual(["pageId"]);
    expect(Object.keys(schema.properties)).toEqual(["pageId"]);
  });
});

describe("officialDefaultShorts 推导规则", () => {
  it("页面级无条件安全工具排序在前，GLOBAL_POLICY 特例追加在后", () => {
    const shorts = officialDefaultShorts();
    // 尾部追加的是全局特例（顺序固定）
    expect(shorts.slice(-GLOBAL_POLICY.length)).toEqual(GLOBAL_POLICY);
    // 其余部分按名称升序
    const pagePart = shorts.slice(0, -GLOBAL_POLICY.length);
    expect(pagePart).toEqual([...pagePart].sort());
    // 每项都能在官方 meta 中找到（排除特例与 unsafe 分类的页面级工具）
    for (const short of pagePart) {
      const meta = OFFICIAL_TOOL_META.find((m) => m.name === short);
      expect(meta).toBeDefined();
      expect(meta!.pageScoped).toBe(true);
      expect(meta!.conditions).toHaveLength(0);
      expect(UNSAFE_CATEGORIES.has(meta!.category)).toBe(false);
    }
  });

  it("GLOBAL_POLICY 工具（列表/新建/求值等）始终在默认面内", () => {
    const shorts = officialDefaultShorts();
    for (const short of GLOBAL_POLICY) {
      expect(shorts).toContain(short);
    }
  });

  it("受条件限制或 unsafe 分类的工具不出现在默认面", () => {
    const shorts = officialDefaultShorts();
    expect(shorts).not.toContain("get_tab_id"); // experimentalInteropTools 条件
    expect(shorts).not.toContain("get_devtools_comments"); // devtoolsComments 条件
    expect(shorts).toContain("screencast_start"); // 官方已无条件，默认暴露
    expect(shorts).not.toContain("install_extension"); // EXTENSIONS
    expect(shorts).not.toContain("execute_webmcp_tool"); // WEBMCP
    expect(shorts).not.toContain("list_3p_developer_tools"); // THIRD_PARTY
  });
});

describe("isOfficialExtraTool / extraToolFlag / officialExtraCandidates", () => {
  it("isOfficialExtraTool 仅认官方声明条件且分类安全的工具", () => {
    expect(isOfficialExtraTool("get_tab_id")).toBe(true);
    expect(isOfficialExtraTool("click_at")).toBe(true);
    // 无条件（本就默认暴露）或 unsafe 分类不算 extra
    expect(isOfficialExtraTool("click")).toBe(false);
    expect(isOfficialExtraTool("install_extension")).toBe(false);
    expect(isOfficialExtraTool("unknown_tool")).toBe(false);
  });

  it("extraToolFlag 把 experimental 条件转成 CLI flag（camelCase → kebab）", () => {
    expect(extraToolFlag("get_tab_id")).toBe("--experimental-interop-tools");
    expect(extraToolFlag("click_at")).toBe("--experimental-vision");
    expect(extraToolFlag("click")).toBeUndefined();
    expect(extraToolFlag("unknown")).toBeUndefined();
  });

  it("officialExtraCandidates 与 meta 中带条件的非 unsafe 工具一一对应", () => {
    const expected = OFFICIAL_TOOL_META.filter(
      (m) => m.conditions.length > 0 && !UNSAFE_CATEGORIES.has(m.category),
    ).map((m) => m.name);
    expect([...officialExtraCandidates()].sort()).toEqual([...expected].sort());
  });
});

describe("configureToolScope / currentOfficialShorts / isAllowedToolName", () => {
  it("空配置时当前面与默认面一致", () => {
    configureToolScope();
    expect(currentOfficialShorts()).toEqual(officialDefaultShorts());
  });

  it("extra 增加二级工具（get_tab_id）后可调用、并入当前面", () => {
    configureToolScope(["get_tab_id"]);
    expect(currentOfficialShorts()).toContain("get_tab_id");
    expect(isAllowedToolName(displayToolName("get_tab_id"))).toBe(true);
    expect(isAllowedToolName("chrome-devtools_get_tab_id")).toBe(true);
  });

  it("extra 传入非二级/默认工具名时告警并忽略", () => {
    const warn = vi.fn();
    configureToolScope(["click", "totally-unknown"], [], warn);
    // click 属于默认面，extra 无需重复加入 —— 仍应被忽略并告警
    expect(warn).toHaveBeenCalledTimes(2);
    const msgs = warn.mock.calls.map((c) => String(c[0]));
    expect(msgs.some((m) => m.includes("click"))).toBe(true);
    expect(msgs.some((m) => m.includes("totally-unknown"))).toBe(true);
    expect(currentOfficialShorts()).toEqual(officialDefaultShorts());
    expect(isAllowedToolName("chrome-devtools_totally-unknown")).toBe(false);
  });

  it("deny 移除默认工具（click），其余默认工具不受影响", () => {
    configureToolScope([], ["click"]);
    expect(currentOfficialShorts()).not.toContain("click");
    expect(isAllowedToolName(displayToolName("click"))).toBe(false);
    expect(isAllowedToolName(displayToolName("fill"))).toBe(true);
  });

  it("deny 未知工具名时告警并忽略", () => {
    const warn = vi.fn();
    configureToolScope([], ["no-such-tool"], warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("no-such-tool");
    expect(currentOfficialShorts()).toEqual(officialDefaultShorts());
  });

  it("同一工具同时进 extra 与 deny 时 deny 生效：列表与调用守卫一致移除", () => {
    configureToolScope(["get_tab_id"], ["get_tab_id"]);
    expect(isAllowedToolName("chrome-devtools_get_tab_id")).toBe(false);
    expect(currentOfficialShorts()).not.toContain("get_tab_id");
  });

  it("current_page 作为自定义工具始终可用，deny 也无法关闭（完整工具名）", () => {
    const customName = displayToolName("current_page");
    expect(CUSTOM_TOOLS.map((t) => t.name)).toContain(customName);
    configureToolScope([], ["current_page"]);
    // 守卫对带 MCP_PREFIX 的完整工具名做硬特判
    expect(isAllowedToolName(customName)).toBe(true);
    // 裸短名不享受特判，仍受 deny 影响
    expect(isAllowedToolName("current_page")).toBe(false);
  });

  it("白名单守卫同时接受带前缀与裸短名（按 default/extra/deny 判定）", () => {
    configureToolScope(["get_tab_id"], ["click"]);
    expect(isAllowedToolName("click")).toBe(false);
    expect(isAllowedToolName("chrome-devtools_click")).toBe(false);
    expect(isAllowedToolName("get_tab_id")).toBe(true);
  });
});

describe("vue-devtools 工具描述 — 不得承诺实现里没有的能力", () => {
  const descriptionOf = (name: string): string => {
    const tool = VUE_DEVTOOLS_TOOLS.find((item) => item.name === name);
    if (!tool) throw new Error(`缺少工具定义: ${name}`);
    return tool.description;
  };

  it("被裁剪的状态分类必须在 get_component_state 描述里逐一说明（否则模型会读成「不存在」）", () => {
    const description = descriptionOf("vue-devtools_get_component_state");
    for (const skipped of SKIP_STATE_TYPES) {
      expect(description).toContain(skipped);
    }
    expect(description).toContain("被刻意裁掉");
  });

  it("值级占位记号必须在描述里解释（否则 __undefined__ 会被读成一个字符串值）", () => {
    const state = descriptionOf("vue-devtools_get_component_state");
    for (const placeholder of SANITIZE_PLACEHOLDERS) {
      expect(state).toContain(placeholder);
    }
    expect(state).toContain("(N chars)");
    // timeline 的 data 用同一套裁剪，描述里要点明不是另一套规则
    expect(descriptionOf("vue-devtools_get_timeline")).toContain("占位记号含义相同");
  });

  it("get_component_tree 描述写明 filter 大小写敏感（否则驼峰查询必然空手而归）", () => {
    const description = descriptionOf("vue-devtools_get_component_tree");
    expect(description).toContain("大小写敏感");
    expect(description).toContain("app-1:root");
  });

  it("get_timeline 描述写明读数契约：缺失 ≠ 0ms、明细非全量、summary 为准", () => {
    const description = descriptionOf("vue-devtools_get_timeline");
    expect(description).toContain("缺失");
    expect(description).toContain("summary 为准");
    expect(description).toContain("windowTruncated");
  });

  it("每个 vue-devtools 工具描述都有一行式能力说明且带 pageId", () => {
    for (const tool of VUE_DEVTOOLS_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.required).toContain("pageId");
    }
  });

  it("get_timeline 的 limit 语义写清楚（slow 档不是总条数上限）", () => {
    const tool = VUE_DEVTOOLS_TOOLS.find((item) => item.name === "vue-devtools_get_timeline");
    const limit = tool?.inputSchema.properties.limit as { description?: string } | undefined;
    expect(limit?.description).toContain("2×limit");
    expect(limit?.description).toContain("slow");
  });

  it("get_timeline 的 schema 默认值与档位枚举与 @aipanel/core 常量同源", () => {
    const tool = VUE_DEVTOOLS_TOOLS.find((item) => item.name === "vue-devtools_get_timeline");
    const props = tool?.inputSchema.properties as Record<string, { enum?: string[]; default?: unknown }>;
    expect(props.include?.enum).toEqual([...VUE_DEVTOOLS_TIMELINE_INCLUDES]);
    expect(props.include?.default).toBe(VUE_DEVTOOLS_TIMELINE_DEFAULTS.include);
    expect(props.limit?.default).toBe(VUE_DEVTOOLS_TIMELINE_DEFAULTS.limit);
    expect(props.minDurationMs?.default).toBe(VUE_DEVTOOLS_TIMELINE_DEFAULTS.minDurationMs);
    expect(props.windowMs?.default).toBe(VUE_DEVTOOLS_TIMELINE_DEFAULTS.windowMs);
    // "明细是否完整"的判定字段必须出现在描述里（否则 agent 会用 truncated 误判）
    expect(tool?.description).toContain("detailComplete");
    // 语料里的两个易误读点：summary 档口径、byComponent 有淘汰
    expect(tool?.description).toContain("按请求口径");
    expect(tool?.description).toContain("componentEvictions");
  });

  it("get_routes 描述与真实返回一致：扁平列表（不是嵌套结构）", () => {
    const tool = VUE_DEVTOOLS_TOOLS.find((item) => item.name === "vue-devtools_get_routes");
    expect(tool?.description).toContain("扁平");
    expect(tool?.description).not.toContain("嵌套结构");
  });
});

describe("PROJECT_DESCRIPTION_NOTES / OFFICIAL_NO_PAGE_TOOLS 一致性", () => {
  it("notes 覆盖的工具都声明在官方 meta 或 GLOBAL_POLICY 中", () => {
    const allKnown = new Set([
      ...officialDefaultShorts(),
      ...officialExtraCandidates(),
      ...OFFICIAL_GLOBAL_POLICY,
    ]);
    for (const short of Object.keys(PROJECT_DESCRIPTION_NOTES)) {
      expect(allKnown.has(short)).toBe(true);
    }
  });

  it("无目标页工具集合（list_pages/new_page）不要求 pageId", () => {
    expect(OFFICIAL_NO_PAGE_TOOLS).toEqual(new Set(["list_pages", "new_page"]));
  });
});
