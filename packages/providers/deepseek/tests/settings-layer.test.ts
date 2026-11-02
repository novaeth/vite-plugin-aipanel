/**
 * @aipanel/provider-deepseek settings-layer（把来源 profile 的配置叠到目标 profile 上）单元测试。
 *
 * 覆盖目标：
 *   - inheritSourceOf：默认就叠（目标 ≠ 来源）、目标就是来源时不叠、`false` 关掉；
 *   - collectTargetEntries：读目标 profile 自己写了哪些顶层行、insert 了哪些 id；
 *   - stripEntries：按顶层 `- id:` 剥块（只剥命中的那一段、不碰别的、不碰注释与嵌套行），
 *     以及按 id 剥 `- insert:` 的嵌套条目（剥空则连 insert 头一起丢）；
 *   - writeInheritLayer：目标写过的行不继承（target wins）、目标没写过的照常补、insert 不重复；
 *     来源存在 → 写出剥好的层；来源缺失/读不动 → null 且不留文件（不阻断启动）。
 *
 * Stub 策略：fs 用真实临时目录；不 mock 任何东西（本模块只写项目缓存目录）。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AIPANEL_CACHE_DIR } from "@aipanel/core/node";
import { DSH_DEFAULT_PROFILE } from "../src/constants";
import {
  INHERIT_LAYER_FILENAME,
  INHERIT_SKIP_IDS,
  collectTargetEntries,
  inheritSourceOf,
  stripEntries,
  writeInheritLayer,
} from "../src/settings-layer";

vi.mock("@aipanel/core/node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aipanel/core/node")>();
  return {
    ...actual,
    createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  };
});

const roots: string[] = [];

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

function writeSource(home: string, profile: string, text: string): string {
  const dir = path.join(home, "profiles", profile);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "cordis.patch.yml");
  fs.writeFileSync(file, text);
  return file;
}

afterEach(() => {
  for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("inheritSourceOf", () => {
  it("默认叠：目标 profile 不是 web 时，来源是 web", () => {
    expect(inheritSourceOf("workbench", DSH_DEFAULT_PROFILE)).toBe("web");
    expect(inheritSourceOf("codexlab", DSH_DEFAULT_PROFILE)).toBe("web");
  });

  it("目标就是来源（profile 默认 web）：不叠", () => {
    expect(inheritSourceOf("web", DSH_DEFAULT_PROFILE)).toBeNull();
  });

  it("`false` = 关掉", () => {
    expect(inheritSourceOf("workbench", false)).toBeNull();
  });

  it("显式指别的来源：用它", () => {
    expect(inheritSourceOf("workbench", "codexlab")).toBe("codexlab");
  });
});

describe("collectTargetEntries", () => {
  const text = [
    "- id: llm-pi-ai",
    "  name: '@deepseek-ai/dsh-llm-pi-ai'",
    "  config:",
    "    providers:",
    "      pagoda-llm:",
    "        models:",
    "          - id: deepseek-flash",
    "- insert:",
    "    - id: web-search-exa",
    "      name: '@deepseek-ai/dsh-web-search-exa'",
    "    - id: aipanel-mcp",
    "      name: '@deepseek-ai/dsh-mcp-client'",
  ].join("\n");

  it("顶层 `- id:` 与 `- insert:` 里的嵌套 id 分开收集", () => {
    const owned = collectTargetEntries(text);
    expect([...owned.ids]).toEqual(["llm-pi-ai"]);
    expect([...owned.insertIds]).toEqual(["web-search-exa", "aipanel-mcp"]);
  });

  it("不把 config 里更深的 `- id:`（models 列表）当成条目", () => {
    const owned = collectTargetEntries(text);
    expect(owned.ids.has("deepseek-flash")).toBe(false);
    expect(owned.insertIds.has("deepseek-flash")).toBe(false);
  });

  it("没有可收集的行：两个集合都为空", () => {
    const owned = collectTargetEntries("# 注释\n");
    expect(owned.ids.size).toBe(0);
    expect(owned.insertIds.size).toBe(0);
  });
});

describe("stripEntries", () => {
  const source = [
    "# 注释留着",
    "- id: agent-default-model",
    "  name: '@deepseek-ai/dsh-agent-default-model'",
    "  config:",
    "    provider: huoyong",
    "- id: ui-theme",
    "  name: '@deepseek-ai/dsh-client-ui-theme'",
    "  config:",
    "    preference: dark",
    "- id: llm-deepseek",
    "  name: '@deepseek-ai/dsh-llm-deepseek'",
    "",
  ].join("\n");

  it("剥掉命中那一段（含它的嵌套行），别的原样留着", () => {
    const out = stripEntries(source, INHERIT_SKIP_IDS);
    expect(out).not.toContain("ui-theme");
    expect(out).not.toContain("preference: dark");
    expect(out).toContain("- id: agent-default-model");
    expect(out).toContain("provider: huoyong");
    expect(out).toContain("- id: llm-deepseek");
    expect(out).toContain("# 注释留着");
  });

  it("命中的是最后一段时也剥得干净（丢到文件末尾）", () => {
    const out = stripEntries(source, ["llm-deepseek"]);
    expect(out).not.toContain("llm-deepseek");
    expect(out).toContain("ui-theme");
    expect(out.trimEnd().endsWith("preference: dark")).toBe(true);
  });

  it("跳过名单为空 / 没命中：逐字不变", () => {
    expect(stripEntries(source, [])).toBe(source);
    expect(stripEntries(source, ["nope"])).toBe(source);
  });

  it("只认顶层条目：嵌套的 `- ` 不会被当成新条目头", () => {
    const nested = ["- id: keep", "  config:", "  list:", "    - id: ui-theme"].join("\n");
    expect(stripEntries(nested, ["ui-theme"])).toBe(nested);
  });

  const inserts = [
    "- insert:",
    "    - id: web-search-exa",
    "      name: '@deepseek-ai/dsh-web-search-exa'",
    "    - id: mcp-extra",
    "      name: '@deepseek-ai/dsh-mcp-client'",
    "- id: keep",
  ].join("\n");

  it("按 id 剥 insert 里的嵌套条目：连同续行一起丢，兄弟条目留着", () => {
    const out = stripEntries(inserts, [], ["web-search-exa"]);
    expect(out).not.toContain("web-search-exa");
    expect(out).toContain("- insert:");
    expect(out).toContain("mcp-extra");
    expect(out).toContain("@deepseek-ai/dsh-mcp-client");
    expect(out).toContain("- id: keep");
  });

  it("insert 被剥空：连 `- insert:` 头一起丢，不留空条目", () => {
    const out = stripEntries(inserts, [], ["web-search-exa", "mcp-extra"]);
    expect(out).not.toContain("- insert:");
    expect(out).toContain("- id: keep");
  });

  it("没给 insert 跳过名单：insert 块逐字保留", () => {
    expect(stripEntries(inserts, [])).toBe(inserts);
  });

  it("insert 条目不是 4 空格缩进：不认识就原样保留（不误删）", () => {
    const odd = ["- insert:", "  - id: web-search-exa", "    name: x"].join("\n");
    expect(stripEntries(odd, [], ["web-search-exa"])).toBe(odd);
  });
});

describe("writeInheritLayer", () => {
  it("来源存在、目标没有 patch：整层照抄（只剥界面偏好）", () => {
    const home = tempDir("aipanel-home-");
    const cwd = tempDir("aipanel-cwd-");
    writeSource(
      home,
      "web",
      [
        "- id: ui-theme",
        "  config:",
        "    preference: dark",
        "- id: llm-x",
        "  config: {}",
        "",
      ].join("\n"),
    );

    const file = writeInheritLayer({ cwd, home, source: "web", target: "workbench" });

    expect(file).toBe(path.join(cwd, AIPANEL_CACHE_DIR, "dsh", INHERIT_LAYER_FILENAME));
    const written = fs.readFileSync(file as string, "utf8");
    expect(written).toContain("llm-x");
    expect(written).not.toContain("ui-theme");
  });

  it("目标写过的行不继承（target wins），目标没写过的照常补", () => {
    const home = tempDir("aipanel-home-");
    const cwd = tempDir("aipanel-cwd-");
    writeSource(
      home,
      "web",
      [
        "- id: llm-pi-ai",
        "  name: '@deepseek-ai/dsh-llm-pi-ai'",
        "  config:",
        "    providers:",
        "      pagoda-llm:",
        "        models:",
        "          - id: qwen3.8:27b",
        "- id: llm-x",
        "  config: {}",
      ].join("\n"),
    );
    writeSource(
      home,
      "workbench",
      [
        "- id: llm-pi-ai",
        "  name: '@deepseek-ai/dsh-llm-pi-ai'",
        "  config:",
        "    providers: {}",
      ].join("\n"),
    );

    const file = writeInheritLayer({ cwd, home, source: "web", target: "workbench" });
    const written = fs.readFileSync(file as string, "utf8");

    expect(written).not.toContain("llm-pi-ai");
    expect(written).not.toContain("qwen3.8:27b");
    expect(written).toContain("llm-x");
  });

  it("目标自己管 llm-pi-ai：来源的 agent-default-model 也不继承（避免默认模型指向不存在的 provider）", () => {
    const home = tempDir("aipanel-home-");
    const cwd = tempDir("aipanel-cwd-");
    writeSource(
      home,
      "web",
      [
        "- id: llm-pi-ai",
        "  config:",
        "    providers:",
        "      xiaoming: {}",
        "- id: agent-default-model",
        "  config:",
        "    provider: xiaoming",
        "    model: deepseek-flash",
      ].join("\n"),
    );
    writeSource(home, "workbench", "- id: llm-pi-ai\n  config:\n    providers: {}\n");

    const file = writeInheritLayer({ cwd, home, source: "web", target: "workbench" });
    const written = fs.readFileSync(file as string, "utf8");

    expect(written).not.toContain("agent-default-model");
    expect(written.trimEnd().endsWith("[]")).toBe(true);
  });

  it("目标自己 insert 过的 id 不再叠一遍，来源独有的 insert 保留", () => {
    const home = tempDir("aipanel-home-");
    const cwd = tempDir("aipanel-cwd-");
    writeSource(
      home,
      "web",
      [
        "- insert:",
        "    - id: web-search-exa",
        "      name: '@deepseek-ai/dsh-web-search-exa'",
        "    - id: mcp-extra",
        "      name: '@deepseek-ai/dsh-mcp-client'",
      ].join("\n"),
    );
    writeSource(
      home,
      "workbench",
      [
        "- insert:",
        "    - id: web-search-exa",
        "      name: '@deepseek-ai/dsh-web-search-exa'",
      ].join("\n"),
    );

    const file = writeInheritLayer({ cwd, home, source: "web", target: "workbench" });
    const written = fs.readFileSync(file as string, "utf8");

    expect(written).not.toContain("web-search-exa");
    expect(written).toContain("mcp-extra");
    expect(written.match(/- insert:/g)).toHaveLength(1);
  });

  it("来源每一行都被目标/跳过名单剥掉：补一个顶层空数组，dsh 才认", () => {
    const home = tempDir("aipanel-home-");
    const cwd = tempDir("aipanel-cwd-");
    writeSource(home, "web", "# 来源只剩注释\n- id: llm-pi-ai\n  config: {}\n");
    writeSource(home, "workbench", "- id: llm-pi-ai\n  config: {}\n");

    const file = writeInheritLayer({ cwd, home, source: "web", target: "workbench" });
    const written = fs.readFileSync(file as string, "utf8");

    expect(written).not.toContain("llm-pi-ai");
    expect(written.trimEnd().endsWith("[]")).toBe(true);
  });

  it("来源不存在：返回 null，且不留下任何文件（不阻断启动）", () => {
    const home = tempDir("aipanel-home-");
    const cwd = tempDir("aipanel-cwd-");

    expect(writeInheritLayer({ cwd, home, source: "web", target: "workbench" })).toBeNull();
    expect(fs.existsSync(path.join(cwd, AIPANEL_CACHE_DIR, "dsh", INHERIT_LAYER_FILENAME))).toBe(
      false,
    );
  });

  it("`home` 缺省时跟随 $DSH_HOME（与 dshProfileDir 同口径，不在这里另立一份）", () => {
    const home = tempDir("aipanel-home-");
    const cwd = tempDir("aipanel-cwd-");
    writeSource(home, "web", "- id: llm-x\n  config: {}\n");
    const before = process.env.DSH_HOME;
    process.env.DSH_HOME = home;
    try {
      expect(writeInheritLayer({ cwd, source: "web", target: "workbench" })).not.toBeNull();
    } finally {
      if (before === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = before;
    }
  });
});
