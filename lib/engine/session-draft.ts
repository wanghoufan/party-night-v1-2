/**
 * 组局草稿契约（setup → boundaries → createSession 的唯一传递口径）。
 *
 * B7 / D4 起草稿不再只是 `SessionConfig`：当局性别录入（`participants.pairGender`）不落 Player 档案、
 * 也不进偏好设置，只随这一局的草稿传递。为兼容旧草稿（纯 config），读取端同时接受两种形态。
 */

import { sessionConfigSchema, type SessionConfig } from "@/lib/domain/schemas";
import { createSessionParticipants, normalizeParticipants } from "@/lib/v2-relationship/v2-participants";
import type { SessionParticipant } from "@/lib/v2-relationship/v2-state";

export const SESSION_DRAFT_KEY = "party-night-session-draft";

export interface SessionDraft {
  config: SessionConfig;
  participants: SessionParticipant[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const configFrom = (raw: unknown): SessionConfig | undefined => {
  const parsed = sessionConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
};

/**
 * 解析草稿（幂等、宽容、不猜）：
 * - 新形态 `{ config, participants }` → 用 config.players 规范化参与者（悬空/重复/非法值安全处理）；
 * - 旧形态（纯 SessionConfig，B7 之前写入的草稿）→ 按 players 补 `pairGender=null`；
 * - 解析不出合法 config → undefined（调用方回 /setup，不激活不可玩的局）。
 */
export function parseSessionDraft(raw: unknown): SessionDraft | undefined {
  if (!isRecord(raw)) return undefined;

  if ("config" in raw) {
    const config = configFrom(raw.config);
    if (!config) return undefined;
    return { config, participants: normalizeParticipants(raw.participants, config.players) };
  }

  const config = configFrom(raw);
  if (!config) return undefined;
  return { config, participants: createSessionParticipants(config.players) };
}

/** 写草稿（setup 用）：性别随当局草稿走，不进任何长期存储。 */
export function serializeSessionDraft(config: SessionConfig, participants: SessionParticipant[]): string {
  return JSON.stringify({ config, participants } satisfies SessionDraft);
}
