import type { ResultPromise } from "execa";
import { sleep } from "@aipanel/core";
import type {
  AIPanelWidgetTheme,
  ChatSession,
  DiagnosticsPolicy,
  ProviderConfig,
  ProviderEnvironmentInfo,
  ProviderEvent,
  ProviderStartOptions,
  ProviderStartResult,
  WebProvider,
} from "@aipanel/core";
import { DEFAULT_DIAGNOSTICS_POLICY, resolveDiagnosticsPolicy } from "@aipanel/core";
import { createLogger } from "@aipanel/core/node";
import type { DeepSeekBusyEnter, DeepSeekPermissionPreset, DeepSeekResolvedOptions } from "./types";
import type { SessionSummary } from "@deepseek-ai/dsh-api-session-controller/types";
import {
  DEFAULT_DEEPSEEK_PROVIDER_OPTIONS,
  DSH_DEFAULT_PROFILE,
  DSH_LOOPBACK_HOST,
} from "./constants";
import { DeepSeekAPI } from "./api";
import { LaunchToken, startDeepSeekWeb } from "./deepseek-web";
import { buildDshOverlay, writeDshOverlay } from "./profile";
import { describeDshProfile, inspectDshProfile, profileProblemText } from "./profile-check";
import { inheritSourceOf, writeInheritLayer } from "./settings-layer";
import {
  checkDeepSeekInstalled,
  getDeepSeekVersion,
  isDeepSeekVersionAtLeast,
  killOrphanDeepSeekProcesses,
  MIN_DSH_VERSION,
} from "./system";
import {
  DSH_CLIENT_PACKAGE,
  DSH_PLUGIN_PACKAGE,
  dshProfileDir,
  ensureDshPackage,
  readProviderVersion,
  resolveDevDshPackageSource,
} from "./dsh-install";

const log = createLogger("DeepSeekWebProvider");

/** DeepSeekWebProvider 构造配置（核心层传入的运行时参数） */
export interface DeepSeekWebProviderConfig {
  /** 服务主机名 */
  hostname: string;
}

/** DeepSeekWebProvider 构造依赖（端口等运行时状态由编排层提供） */
export interface DeepSeekWebProviderDeps {
  /** 实际 Web 端口读取器 */
  getWebPort: () => number;
  /** 实际代理端口读取器 */
  getProxyPort: () => number;
}

/**
 * DeepSeek Harness Web Provider
 * 组合 CLI 进程管理、RPC 会话 API、dsh 侧插件编排（host 插件 + 浏览器 client 插件），
 * 向核心层暴露 WebProvider 契约。dsh 页内行为（会话聚焦/主题/布局/选中元素）全部
 * 由浏览器插件 @aipanel/dsh-client 承担，不再注入 bridge 脚本。
 */
export class DeepSeekWebProvider implements WebProvider {
  readonly id = "deepseek";
  readonly displayName = "DeepSeek Harness";

  /** SPA 型无 URL 深链：iframe 保持应用壳，切会话通过 FOCUS_SESSION 消息完成 */
  readonly capabilities = { deepLink: false } as const;

  private readonly api: DeepSeekAPI;
  private deps: DeepSeekWebProviderDeps;
  private process: ResultPromise | null = null;
  /** 本次启动的 token 捕获器：stop 时令其等待者快速失败，避免请求一直挂起 */
  private launchToken: LaunchToken | null = null;
  /** AIPanel 侧下发的主题偏好（AIPanelWidgetTheme，default auto）：随 client 插件 config 注入，作为启动初值 */
  private uiTheme: AIPanelWidgetTheme = "auto";
  private readonly opts: DeepSeekResolvedOptions;

  constructor(
    config: DeepSeekWebProviderConfig,
    deps: DeepSeekWebProviderDeps,
    options?: Record<string, unknown>,
  ) {
    this.deps = deps;
    this.opts = resolveDeepSeekOptions(options);
    this.api = new DeepSeekAPI(DSH_LOOPBACK_HOST, deps.getWebPort);
  }

  /** 记录 AIPanel 侧主题偏好（applyConfig 在 start 前调用；start 时随 client 插件 config 下发） */
  applyConfig(config: ProviderConfig): void {
    const t = config.theme;
    this.uiTheme = t === "light" || t === "dark" || t === "auto" ? t : "auto";
  }

  async checkEnvironment(): Promise<ProviderEnvironmentInfo> {
    if (!(await checkDeepSeekInstalled())) {
      return {
        ok: false,
        message: `DeepSeek Harness (dsh) is not installed!

Please install dsh first:

  npm install -g @deepseek-ai/dsh

or run without installing:

  npx @deepseek-ai/dsh web
        `,
      };
    }
    const version = await getDeepSeekVersion();
    log.debug("Detected dsh version", { version: version ?? "unknown" });
    // 0.1.2 起 API/认证协议（browser-session、{args} RPC、remote.mux）不向下兼容：
    // 低于最低版本直接给明确指引，避免启动后干等 token 并逐个 RPC 失败。
    const compatible = version === null ? true : isDeepSeekVersionAtLeast(version);
    if (compatible === false) {
      return {
        ok: false,
        message: `DeepSeek Harness (dsh) ${version} is too old: this provider requires dsh >= ${MIN_DSH_VERSION} (browser-session auth / Remote RPC protocol).

Please upgrade:

  npm install -g @deepseek-ai/dsh@latest
`,
      };
    }
    return { ok: true, version: version ?? undefined };
  }

  async start(options: ProviderStartOptions): Promise<ProviderStartResult> {
    log.debug("Starting dsh web process", {
      port: options.port,
      hostname: DSH_LOOPBACK_HOST,
      cwd: options.cwd,
      profile: this.opts.profile,
      vitePort: options.vitePort,
    });
    // 统一官方方案安装 dsh 侧插件（dsh plugin --profile <name> add）：
    //   - dsh-client 浏览器插件（@ 菜单 chip 高亮）
    //   - dsh-plugin 宿主插件（审查工具 / 编辑后自动诊断）
    // dev 装本地目录（改代码 → 重建 → 重启生效）；生产装 npm 包。
    // 未就绪时 overlay 停用对应行，避免 dsh 因无法解析而 fail-loud，仅失去该能力。
    // profile 由 providerOptions.profile 指定（默认 web，见 DSH_DEFAULT_PROFILE）。
    const profileDir = dshProfileDir(this.opts.profile, this.opts.home);

    // 尽早绑定 launch token 等待源：start 中段有耗时装机（ensureDshPackage），启动早期
    // widget 的会话请求可能在源绑定前到达。提前绑定让其在 ensureAuthenticated 走等待路径而非误报。
    const launchToken = new LaunchToken();
    this.launchToken = launchToken;
    this.api.setLaunchTokenSource(() => launchToken.wait());
    // 超时诊断上下文：profile 在哪、声明了哪些 bundle（stdout/stderr 尾部由 LaunchToken 自己回填）
    launchToken.attachContext(() => describeDshProfile(profileDir, this.opts.profile));

    // profile 预检必须排在 ensureDshPackage **之前**：
    // `dsh plugin --profile <名> add …` 在 profile 缺失时会自己初始化一个空壳（只有 dsh-base），
    // 那一步一旦发生，后面只会表现为"启动超时"，而且机器上会留下一个看起来存在的 profile。
    // 判据只用 dsh 自己的 profile 契约（目录在不在、bundles 里有没有 web 应用），不认识任何具体插件。
    const profileCheck = inspectDshProfile(profileDir);
    if (!profileCheck.ok) {
      const reason = profileProblemText(profileCheck, profileDir, this.opts.profile);
      log.error(reason);
      launchToken.fail(new Error(reason));
      throw new Error(reason);
    }

    const devClientDir = resolveDevDshPackageSource(import.meta.url, "dsh-client", "lib/client.js");
    // 与插件保持同步的基准版本 = 当前 provider 版本（dsh-client/plugin 与其锁步发布）
    const providerVersion = readProviderVersion(import.meta.url);
    // 生产用显式版本号 target（@pkg@<版本>）强制每次启动落精确版本；裸包名可能沿用 profile 里旧的
    // 精确 pin 而不更新，正是用户反馈“插件没更新”的场景。dev 用本地 link，随源码重建生效。
    const clientTarget =
      devClientDir ??
      (providerVersion
        ? `${DSH_CLIENT_PACKAGE}@${providerVersion}`
        : `${DSH_CLIENT_PACKAGE}@latest`);
    const clientAvailable = await ensureDshPackage(
      profileDir,
      DSH_CLIENT_PACKAGE,
      clientTarget,
      this.opts.profile,
      this.opts.home,
      providerVersion,
    );
    if (!clientAvailable) {
      log.warn("@aipanel/dsh-client unavailable; @ menu chip highlight disabled", {
        metaUrl: import.meta.url,
      });
    }

    const devPluginDir = resolveDevDshPackageSource(import.meta.url, "dsh-plugin", "dist/index.js");
    const pluginTarget =
      devPluginDir ??
      (providerVersion
        ? `${DSH_PLUGIN_PACKAGE}@${providerVersion}`
        : `${DSH_PLUGIN_PACKAGE}@latest`);
    const pluginAvailable = await ensureDshPackage(
      profileDir,
      DSH_PLUGIN_PACKAGE,
      pluginTarget,
      this.opts.profile,
      this.opts.home,
      providerVersion,
    );
    if (!pluginAvailable) {
      log.warn("@aipanel/dsh-plugin unavailable; run_diagnostics & settings application disabled", {
        metaUrl: import.meta.url,
      });
    }

    // 生成 cordis overlay：接入 AIPanel MCP（浏览器控制/Debug 等）+ aipanel 宿主/浏览器插件。
    // providerOptions（agentPreset/permissionPreset/busyEnter）随 host 插件 config 下发，
    // 由 dsh-plugin 在启动期经 ctx.settings 应用；诊断开关/主题初值随 client 插件 config 下发。
    const overlay = buildDshOverlay({
      vitePort: options.vitePort,
      viteHost: options.viteHost,
      cwd: options.cwd,
      pluginAvailable,
      clientAvailable,
      diagnostics: this.opts.diagnostics,
      // 宿主事件推送令牌（core 每轮启动随机）：随 plugin config 注入 dsh-plugin 用于回推鉴权
      eventsToken: options.eventsToken,
      agentPreset: this.opts.agentPreset,
      permissionPreset: this.opts.permissionPreset,
      busyEnter: this.opts.busyEnter,
      theme: this.uiTheme,
    });
    const patchPath = writeDshOverlay(options.cwd, overlay);

    // 机器级设置住在默认 profile（`web`）里；目标 profile 是自建的（workbench/codexlab…）时，
    // 把它那层叠上来 —— 默认就叠（用户不会去改配置），见 settings-layer.ts。来源缺失时返回 null。
    const inheritSource = inheritSourceOf(this.opts.profile, this.opts.settingsFrom);
    const settingsPatchPath =
      inheritSource === null
        ? null
        : writeInheritLayer({
            cwd: options.cwd,
            home: this.opts.home,
            source: inheritSource,
            target: this.opts.profile,
          });

    // dsh 服务 schema 只接受 127.0.0.1 / 0.0.0.0，且 CLI 拒绝 0.0.0.0 —— 强制 loopback
    const proc = startDeepSeekWeb({
      port: options.port,
      hostname: DSH_LOOPBACK_HOST,
      cwd: options.cwd,
      profile: this.opts.profile,
      patchPath,
      ...(settingsPatchPath === null ? {} : { settingsPatchPath }),
      home: this.opts.home,
      verbose: options.verbose,
      launchToken,
    });
    this.process = proc;

    // dsh 0.1.2+ 在索引页与 /api 强制 browser-session 认证：用 launch token 换签名 Cookie，
    // 便于后续 RPC 直连通过 401 门禁，并把同一 Cookie 交代理注入转发请求。
    // Cookie 必须在代理启动前就绪，否则经代理访问的 UI 将永久 401，因此这里带短退避重试；
    // 全部失败才降级告警（未认证直连，界面可能 401），不阻塞 dsh 启动。
    let webAuthCookie: string | undefined;
    try {
      const token = await launchToken.wait();
      this.api.setLaunchToken(token);
      const maxAuthAttempts = 3;
      for (let attempt = 1; ; attempt++) {
        try {
          await this.api.authenticate();
          break;
        } catch (e) {
          if (attempt >= maxAuthAttempts) throw e;
          log.debug("dsh browser-session auth bootstrap attempt failed, retrying", {
            attempt,
            error: e instanceof Error ? e.message : String(e),
          });
          await sleep(250 * attempt);
        }
      }
      webAuthCookie = this.api.getAuthCookie();
    } catch (e) {
      log.warn(
        "failed to establish dsh web browser-session auth; UI may show authentication required",
        {
          error: e instanceof Error ? e.message : String(e),
        },
      );
    }

    // 注：providerOptions 指定的 dsh 用户设置（agent 预设 / 权限 / 繁忙 Enter）不再由本
    // provider 在启动后经 RPC settings/mutate 写入 —— 已随 overlay 的 host 插件 config 下发，
    // 由 @aipanel/dsh-plugin 在 dsh boot 期经 ctx.settings.update 应用（见 dsh-plugin/applyProviderSettings）。

    return { url: this.api.shellUrl, processHandle: proc, webAuthCookie };
  }

  async stop(): Promise<void> {
    // 进程停止后 stdout 不会再有 token：让仍在等待的调用方快速失败，而不是一直挂着
    this.launchToken?.fail(new Error("dsh web stopped before launch token was captured"));
    this.launchToken = null;
    if (this.process) {
      log.debug("Killing dsh web process", { pid: this.process.pid });
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }

  async killOrphans(): Promise<number> {
    return killOrphanDeepSeekProcesses();
  }

  async listSessions(projectDir: string, activeSessionId?: string): Promise<ChatSession[]> {
    const sessions = await this.api.listSessions(projectDir, activeSessionId);
    // 无 deepLink：所有会话共用应用壳 URL
    const url = this.buildSessionUrl(projectDir, "");
    return sessions.map((s) => toChatSession(s, url));
  }

  async createSession(projectDir: string, title?: string): Promise<ChatSession> {
    // dsh session.create 仅返回 { sessionId }，不含标题/时间；title 由 dsh 侧自动生成前先用空
    const url = this.buildSessionUrl(projectDir, "");
    const created = await this.api.createSession(projectDir);
    return {
      id: created.sessionId,
      title: title ?? "",
      updatedAt: Date.now(),
      url,
    };
  }

  // 删除走归档：dsh 无硬删除语义（workspace.archiveSession），
  // 归档后 listSessions 按 archivedSessionIds 过滤即从列表消失。
  async deleteSession(sessionId: string): Promise<void> {
    await this.api.archiveSession(sessionId);
  }

  buildSessionUrl(projectDir: string, sessionId: string): string {
    void projectDir;
    void sessionId;
    // 无 deepLink 能力：所有会话共用应用壳 URL。必须走代理（proxyPort）而非直连 dsh，
    // 使 dsh-client 能收到父窗消息（页面与核心层同域转发）。
    return `http://${DSH_LOOPBACK_HOST}:${this.deps.getProxyPort()}/`;
  }

  subscribeEvents(handler: (e: ProviderEvent) => void): () => void {
    void handler;
    // dsh 0.1.2+ 移除了旧的 /api/events.mux 与 /api/events.host（全局下推帧流），provider
    // 直连侧不再订阅事件。running/thinking 事件由宿主内 @aipanel/dsh-plugin 监听 session/event
    // 总线并经 core 的 HOST_EVENTS_API_PATH 中继广播（与服务端 provider.subscribeEvents 同一
    // SESSION_EVENT 通道），本通道保持为空即可。
    log.debug("dsh 事件经宿主插件(dsh-plugin)中继推送，provider 直连事件通道为空");
    return () => {};
  }
}

/** 归一化：dsh 会话摘要 → ChatSession（无 deepLink，url 为共用应用壳地址） */
function toChatSession(s: SessionSummary, url?: string): ChatSession {
  // title 投影值为 JsonValue，需收窄为 string
  const title = s.projections?.values?.title;
  return {
    id: s.sessionId,
    title: typeof title === "string" ? title : "",
    updatedAt: s.updatedAt,
    parentId: s.parentSessionId,
    url,
  };
}

/**
 * 从用户完整插件配置中解析 DeepSeek 专属配置
 * 优先级：providerOptions（新写法）> 顶层字段（旧写法）> provider 默认值。
 * 注：agentPreset 已无内置默认（交由 dsh 自身默认预设），仅当用户显式配置时才写 settings；
 * 诊断策略在这里归一化成完整值（默认值单一来源 = @aipanel/core 的 DEFAULT_DIAGNOSTICS_POLICY）。
 */
function resolveDeepSeekOptions(options?: Record<string, unknown>): DeepSeekResolvedOptions {
  const po = (options?.providerOptions ?? {}) as Record<string, unknown>;
  return {
    ...DEFAULT_DEEPSEEK_PROVIDER_OPTIONS,
    home: (po.home as string) ?? (options?.home as string | undefined),
    profile:
      (po.profile as string) ?? (options?.profile as string | undefined) ?? DSH_DEFAULT_PROFILE,
    // 默认就叠（见 settings-layer.ts）：用户不会去改配置，机器级设置只配一次是默认预期。
    settingsFrom:
      po.settingsFrom === false
        ? false
        : typeof po.settingsFrom === "string"
          ? po.settingsFrom
          : DSH_DEFAULT_PROFILE,
    agentPreset: (po.agentPreset as string) ?? (options?.agentPreset as string | undefined),
    permissionPreset:
      (po.permissionPreset as DeepSeekPermissionPreset) ??
      (options?.permissionPreset as DeepSeekPermissionPreset | undefined),
    busyEnter:
      (po.busyEnter as DeepSeekBusyEnter) ?? (options?.busyEnter as DeepSeekBusyEnter | undefined),
    diagnostics: resolveDiagnosticsPolicy(
      [DEFAULT_DIAGNOSTICS_POLICY, po.diagnostics as Partial<DiagnosticsPolicy> | undefined],
      (message) => log.warn(message),
    ),
  };
}
