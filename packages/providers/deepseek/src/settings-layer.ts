/**
 * 把「另一个 profile 的配置」叠到目标 profile 上（默认：机器级设置住 `web`，自建 profile 跟着它）。
 *
 * 为什么需要：dsh 的组合层只有 `bundle → profile → home → --patch` 四层，**没有 profile 继承 profile**。
 * 于是"在 `dsh web` 里配过的供应商 / 搜索源 / MCP，在自建 profile 里看不到"这件事，只能由**启动者**
 * 用一条额外的 `--patch` 解决（dsh-workbench 的启动器就是这么做的；AIPanel 之前没做，同一台机器上
 * 两条入口的设置因此不一致）。
 *
 * 为什么**默认开着**：机器级设置只配一次是默认预期，不是可选项 —— 要求用户去改配置的方案等于没解决。
 * `providerOptions.settingsFrom` 只在"想换来源 / 想干脆不叠"时才写。
 *
 * 为什么是**目标作主（target wins）**：`--patch` 是最高的层，且 dsh 对同 id 的 patch 是**整段 config
 * 替换**，不是深合并。目标 profile 自己写过的行（如 workbench 的 `llm-pi-ai` / `agent-default-model`）
 * 如果原样照抄来源，来源会把它整段盖掉 —— 工作台自己的模型配置、默认模型全部失效，Settings 里还改不动。
 * 所以只补目标**没写过**的行：目标写了的（含它自己 `- insert:` 的 id）原样留给目标，来源不碰。
 *
 * 为什么还要有跳过名单：有些行是"每个界面自己的偏好"，目标 profile 里常常没写，但仍不该跟来源走。
 * 实测踩过：`ui-theme` 被盖住之后，在工作台里切浅色会**自动跳回** web 的深色。
 */
import fs from "node:fs";
import path from "node:path";
import { AIPANEL_CACHE_DIR, createLogger } from "@aipanel/core/node";
import { dshProfileDir } from "./dsh-install";

const log = createLogger("DeepSeekSettings");

/** 不跟着来源走的那几行（每个界面自己的偏好，目标没写也不继承）；理由见文件头 */
export const INHERIT_SKIP_IDS: readonly string[] = ["ui-theme"];

/** 生成层落在项目缓存目录，与 AIPanel 自己的 overlay 同处 */
export const INHERIT_LAYER_FILENAME = "dsh-inherit.cordis.yml";

/** 目标 profile 自己已经定义/插入的行 id：来源层里同 id 的条目不再继承 */
export interface TargetEntries {
  /** 顶层 `- id:` 条目 */
  ids: ReadonlySet<string>;
  /** 顶层 `- insert:` 里插入的条目 id */
  insertIds: ReadonlySet<string>;
}

/**
 * 该从哪个 profile 继承。
 * @param settingsFrom 解析后的选项：profile 名 / `false`（不叠）
 * @returns 源 profile 名；`null` = 不叠（关掉了，或目标就是它自己）
 */
export function inheritSourceOf(profile: string, settingsFrom: string | false): string | null {
  if (settingsFrom === false) return null;
  return settingsFrom === profile ? null : settingsFrom;
}

/**
 * 读目标 profile 自己的 patch，收集它已经写过 / 插入过的行 id。
 * 这些行由目标作主：来源层里同 id 的条目不能再叠上去（`--patch` 会整段覆盖目标的 config）。
 */
export function collectTargetEntries(text: string): TargetEntries {
  const ids = new Set<string>();
  const insertIds = new Set<string>();
  let inInsert = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("- ")) {
      inInsert = /^- insert:\s*$/.test(line);
      const id = /^- id:\s*"?([^"\s]+)"?\s*$/.exec(line)?.[1];
      if (id !== undefined) ids.add(id);
      continue;
    }
    if (!inInsert) continue;
    const id = /^ {4}- id:\s*"?([^"\s]+)"?\s*$/.exec(line)?.[1];
    if (id !== undefined) insertIds.add(id);
  }
  return { ids, insertIds };
}

/**
 * 按**顶层条目**剥掉若干 `- id:` 块（与 dsh-workbench 启动器里那段 awk 同口径：从命中的 `- ` 行
 * 一路丢到下一个顶层 `- ` 为止）；给了 `skipInsertIds` 时，再把 `- insert:` 里命中 id 的嵌套条目
 * 连同它的续行一起剥掉（整块剥空则连 `- insert:` 头一起丢，避免留下空的 insert 条目）。
 * insert 的嵌套条目按 dsh 示例的 4 空格缩进识别；缩进不认识时整块原样保留，不误删。
 * 手写而不是上 YAML 库：这一层只是转交一份文本，没必要为它引入依赖，
 * 也不能因为来源文件里有 `!!js` 之类的 dsh 扩展标签就解析失败。
 */
export function stripEntries(
  text: string,
  skipIds: readonly string[],
  skipInsertIds: readonly string[] = [],
): string {
  const skip = new Set(skipIds);
  const skipInserts = new Set(skipInsertIds);
  const kept: string[] = [];
  let block: string[] | null = null;
  let dropping = false;

  const flush = (): void => {
    if (block !== null) {
      if (!dropping) kept.push(...filterInserted(block, skipInserts));
      block = null;
      dropping = false;
    }
  };

  for (const line of text.split("\n")) {
    if (line.startsWith("- ")) {
      flush();
      const id = /^- id:\s*"?([^"\s]+)"?\s*$/.exec(line)?.[1];
      dropping = id !== undefined && skip.has(id);
      block = [line];
      continue;
    }
    if (block === null) kept.push(line);
    else block.push(line);
  }
  flush();
  return kept.join("\n");
}

/** 过滤一个顶层块里的 `- insert:` 嵌套条目；非 insert 块（或没给跳过名单）原样返回 */
function filterInserted(block: readonly string[], skipInserts: ReadonlySet<string>): string[] {
  if (skipInserts.size === 0 || !/^- insert:\s*$/.test(block[0])) return [...block];
  if (!block.some((line) => /^ {4}- /.test(line))) return [...block];
  const out: string[] = [block[0]];
  let keeping = true;
  for (const line of block.slice(1)) {
    const id = /^ {4}- id:\s*"?([^"\s]+)"?\s*$/.exec(line)?.[1];
    if (id !== undefined) {
      keeping = !skipInserts.has(id);
      if (keeping) out.push(line);
      continue;
    }
    if (/^ {4}- /.test(line)) {
      keeping = true;
      out.push(line);
      continue;
    }
    if (keeping) out.push(line);
  }
  return out.slice(1).some((line) => /^ {4}- /.test(line)) ? out : [];
}

/**
 * 写出继承层并返回它的路径；来源不存在/读不动时返回 `null`（**不阻断启动**：少了它只是回到老行为）。
 */
export function writeInheritLayer(input: {
  cwd: string;
  home?: string | undefined;
  source: string;
  target: string;
}): string | null {
  const source = path.join(dshProfileDir(input.source, input.home), "cordis.patch.yml");
  let text: string;
  try {
    text = fs.readFileSync(source, "utf8");
  } catch {
    log.debug("来源 profile 没有可叠的配置，跳过", { source });
    return null;
  }

  const owned = readTargetEntries(input.target, input.home);
  const skipIds = inheritSkipIds(owned);
  const skipInsertIds = [...owned.insertIds];

  const dir = path.join(input.cwd, AIPANEL_CACHE_DIR, "dsh");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, INHERIT_LAYER_FILENAME);
  fs.writeFileSync(file, asPatchList(stripEntries(text, skipIds, skipInsertIds)), "utf8");
  log.debug("已叠上来源 profile 的配置", {
    source,
    file,
    skipIds,
    skipInsertIds,
  });
  return file;
}

/**
 * 目标 profile 自己写过的行 + 与它们耦合、不能单独继承的行。
 * `llm-pi-ai` 的 `providers` 是整段替换：目标自己管供应商时，来源的 `agent-default-model`
 * 可能指向目标里不存在的 provider，默认模型会悬空 —— 一并让开（目标没写则由 dsh 自带的默认兜底）。
 */
function inheritSkipIds(owned: TargetEntries): string[] {
  const skip = new Set<string>([...INHERIT_SKIP_IDS, ...owned.ids]);
  if (owned.ids.has("llm-pi-ai")) skip.add("agent-default-model");
  return [...skip];
}

/**
 * dsh 要求 overlay 文件是**顶层 YAML 数组**：来源里每一行都被目标/跳过名单剥掉时，剩下的只有注释，
 * 解析结果是 null，dsh 会直接以「must be a top-level YAML array」拒绝启动。补一个空数组兜底。
 */
function asPatchList(text: string): string {
  return text.split("\n").some((line) => line.startsWith("- ")) ? text : `${text.trimEnd()}\n[]\n`;
}

/** 目标 profile 没有 patch / 读不动时返回空集合：照常继承来源（老行为） */
function readTargetEntries(target: string, home?: string | undefined): TargetEntries {
  try {
    const file = path.join(dshProfileDir(target, home), "cordis.patch.yml");
    return collectTargetEntries(fs.readFileSync(file, "utf8"));
  } catch {
    return { ids: new Set(), insertIds: new Set() };
  }
}
