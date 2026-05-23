import type {
  CapabilityDependency,
  CapabilityIssue,
  CapabilityKind,
  CapabilityRecord,
  CapabilityScanResult,
  CapabilitySummary
} from "../../shared/types.js";
import type { CapabilitySection } from "./navigation.js";
import { getCapabilitySectionKind } from "./navigation.js";

export interface CapabilityIssueView {
  code: string;
  detail: string;
  severity: CapabilityIssue["severity"];
  title: string;
}

const KIND_LABELS: Record<CapabilityKind, string> = {
  automation: "Automations",
  command: "Commands",
  mcp: "MCP",
  plugin: "Plugins",
  skill: "Skills"
};

const KIND_NAMES: Record<CapabilityKind, string> = {
  automation: "Automation",
  command: "Command",
  mcp: "MCP",
  plugin: "Plugin",
  skill: "Skill"
};

const ISSUE_COPY: Record<string, { detail: string; title: string }> = {
  "automation-paused": {
    title: "自动化已暂停",
    detail: "它存在于本地，但不会自动运行。需要恢复后才会按计划唤醒。"
  },
  "duplicate-capability-name": {
    title: "名称重复",
    detail: "同类能力里存在相同名称，用户定位和 Codex 选择时都更容易混淆。"
  },
  "mcp-list-failed": {
    title: "MCP 读取失败",
    detail: "CoMate 没能读取 Codex MCP 列表，相关运行时能力可能不完整。"
  },
  "mcp-status-unknown": {
    title: "MCP 状态未知",
    detail: "Codex 返回的 MCP 状态无法识别，暂时不能确认它是否可用。"
  },
  "plugin-state-unknown": {
    title: "插件启用状态未知",
    detail: "本地有插件缓存，但 config.toml 里没有明确启用状态，可能只是缓存残留。"
  },
  "skill-description-long": {
    title: "Description 偏长",
    detail: "Codex 会把 skill 描述放进上下文。描述过长时，skills 较多会更容易消耗上下文预算。"
  },
  "skill-description-missing": {
    title: "缺少 Description",
    detail: "Codex 主要靠 description 判断何时使用 skill。缺少它会明显降低触发稳定性。"
  },
  "skill-name-missing": {
    title: "缺少名称",
    detail: "SKILL.md frontmatter 里缺少 name，界面和调用时只能退回到文件夹名。"
  }
};

export function filterCapabilities(
  capabilities: CapabilityScanResult | null,
  section: CapabilitySection,
  query: string
): CapabilityRecord[] {
  if (!capabilities) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();
  const kind = getCapabilitySectionKind(section);

  return capabilities.items.filter((item) => {
    if (section === "issues" && item.issues.length === 0) {
      return false;
    }
    if (kind && item.kind !== kind) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }

    return [item.name, item.description, item.origin, item.path, item.trigger]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery));
  });
}

export function groupCapabilities(items: CapabilityRecord[]): Array<{ kind: CapabilityKind; label: string; items: CapabilityRecord[] }> {
  const groups = new Map<CapabilityKind, CapabilityRecord[]>();
  for (const item of items) {
    groups.set(item.kind, [...(groups.get(item.kind) ?? []), item]);
  }

  return (["skill", "plugin", "mcp", "command", "automation"] as CapabilityKind[])
    .map((kind) => ({ kind, label: KIND_LABELS[kind], items: groups.get(kind) ?? [] }))
    .filter((group) => group.items.length > 0);
}

export function getCapabilityMenuCount(summary: CapabilitySummary | null, section: CapabilitySection): number {
  if (!summary) {
    return 0;
  }
  if (section === "overview") {
    return summary.total;
  }
  if (section === "issues") {
    return summary.issueCount;
  }

  const kind = getCapabilitySectionKind(section);
  return kind ? summary.byKind[kind] : 0;
}

export function getSelectedCapability(
  items: CapabilityRecord[],
  selectedId: string | null
): CapabilityRecord | null {
  return items.find((item) => item.id === selectedId) ?? items[0] ?? null;
}

export function getCapabilityKindName(kind: CapabilityKind): string {
  return KIND_NAMES[kind];
}

export function getCapabilitySummaryText(capability: CapabilityRecord, maxLength = 150): string {
  return trimText(stripTriggerHints(capability.description ?? getFallbackCapabilitySummary(capability)), maxLength);
}

export function getCapabilityIssueViews(capability: CapabilityRecord): CapabilityIssueView[] {
  return capability.issues.map((issue) => {
    const copy = ISSUE_COPY[issue.code];
    return {
      code: issue.code,
      detail: copy?.detail ?? issue.message,
      severity: issue.severity,
      title: copy?.title ?? issue.message
    };
  });
}

export function getCapabilityUsageLines(capability: CapabilityRecord): string[] {
  if (capability.kind === "skill") {
    return [
      "隐式：Codex 根据 description 判断是否使用。",
      `显式：$${capability.name}`
    ];
  }

  if (capability.kind === "plugin") {
    return ["由 Codex 插件系统加载，提供 skills、commands、MCP 或连接器能力。"];
  }

  if (capability.kind === "mcp") {
    return [`由 codex mcp list 管理，当前状态为 ${capability.status}。`];
  }

  if (capability.kind === "command") {
    return [`通过 ${capability.trigger ?? `/${capability.name}`} 调用。`];
  }

  return [capability.status === "disabled" ? "当前已暂停，不会自动运行。" : "按 automation 计划由 Codex 自动唤醒。"];
}

export function getUsefulDependencies(capability: CapabilityRecord): Array<CapabilityDependency & { purpose: string }> {
  return capability.dependencies
    .filter((dependency) => dependency.status === "available")
    .map((dependency) => ({
      ...dependency,
      purpose: getDependencyPurpose(dependency)
    }));
}

export function getIssueSummary(summary: CapabilitySummary | null): string | null {
  if (!summary || summary.issueCount === 0) {
    return null;
  }

  return `${summary.issueCount} issues need attention`;
}

function getDependencyPurpose(dependency: CapabilityDependency): string {
  switch (dependency.kind) {
    case "agents":
      return "定义此能力的专用执行规则";
    case "app":
      return "连接 Codex app 能力";
    case "assets":
      return "提供图标、模板或素材";
    case "commands":
      return "提供可直接调用的命令";
    case "mcp":
      return "声明运行时工具服务";
    case "references":
      return "提供参考资料和流程说明";
    case "scripts":
      return "执行本地辅助逻辑";
    case "skills":
      return "插件内置的 skills";
    default:
      return "本地配置或工作目录";
  }
}

function getFallbackCapabilitySummary(capability: CapabilityRecord): string {
  if (capability.kind === "mcp") {
    return "Codex 可调用的本地工具服务。";
  }
  if (capability.kind === "automation") {
    return "Codex 后台自动化任务。";
  }
  if (capability.kind === "command") {
    return "Codex 命令入口。";
  }
  if (capability.kind === "plugin") {
    return "Codex 插件能力入口。";
  }
  return "Codex skill 能力入口。";
}

function trimText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function stripTriggerHints(value: string): string {
  const cleaned = value
    .replace(/\s+Triggers?:\s+.*$/i, "")
    .replace(/\s+Trigger\b[^.。]*[.。]?/gi, "")
    .trim();
  return cleaned || value;
}
