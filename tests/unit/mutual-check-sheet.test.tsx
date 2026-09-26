import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { MutualCheckSheet, type MutualCheckPlayer } from "@/components/game/MutualCheckSheet";
import { singleAnchorPlayerId } from "@/lib/v2-relationship/v2-routing";
import { createInitialRelationshipState, type SessionParticipant } from "@/lib/v2-relationship/v2-state";

/* ------------------------------------------------------------------ */
/* 装置：4 人 2 男 2 女，合法边 p1::p2 / p1::p4 / p2::p3 / p3::p4          */
/* ------------------------------------------------------------------ */

const participants: SessionParticipant[] = [
  { playerId: "p1", active: true, pairGender: "male" },
  { playerId: "p2", active: true, pairGender: "female" },
  { playerId: "p3", active: true, pairGender: "male" },
  { playerId: "p4", active: true, pairGender: "female" },
];

const players: MutualCheckPlayer[] = [
  { id: "p1", displayName: "小A" },
  { id: "p2", displayName: "小B" },
  { id: "p3", displayName: "小C" },
  { id: "p4", displayName: "小D" },
];

const openSheet = () => {
  const onFinished = vi.fn();
  const onCancelled = vi.fn();
  render(
    <MutualCheckSheet
      open
      players={players}
      participants={participants}
      checkpoint={9}
      relationship={createInitialRelationshipState()}
      onFinished={onFinished}
      onCancelled={onCancelled}
    />,
  );
  return { onFinished, onCancelled };
};

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

/** 点名 → 身份确认 → 准备好（进入选择页）。 */
const handOver = () => {
  tap("已交给 TA");
  tap("是，继续");
  tap("我准备好了");
};

/** 选一人并提交。 */
const submitTo = (target: string) => {
  tap(target);
  tap("提交");
};

/** 提交后的遮罩与交接：SUBMITTED → MASKED → NEXT。 */
const maskAndHandOff = () => {
  tap("继续");
  tap("已遮好");
  tap("继续");
};

/** 跳过后的交接：READY/SELECT 跳过 → MASKED → NEXT。 */
const maskAfterSkip = () => {
  tap("已遮好");
  tap("继续");
};

describe("MutualCheckSheet（B9 私密互选面板）", () => {
  it("点名遮罩只显示交接文案，不渲染任何选项或候选人", () => {
    openSheet();
    expect(screen.getByRole("dialog", { name: "私密互选" })).toBeInTheDocument();
    expect(screen.getByText("请把手机交给 小A")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "小B" })).toBeNull();
    expect(screen.queryByRole("button", { name: "小C" })).toBeNull();
  });

  it("身份确认是必经步骤：确认前不显示任何选项", () => {
    openSheet();
    tap("已交给 TA");
    expect(screen.getByText("你是 小A 吗？")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "小B" })).toBeNull();

    tap("是，继续");
    expect(screen.getByText("准备好后再点开")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "小B" })).toBeNull();

    tap("我准备好了");
    expect(screen.getByRole("button", { name: "小B" })).toBeInTheDocument();
  });

  it("身份不符 → 中性遮罩，不公开任何人，也不自动收束", () => {
    const { onCancelled, onFinished } = openSheet();
    tap("已交给 TA");
    tap("不是，交还主持人");
    expect(screen.getByText("请交还主持人")).toBeInTheDocument();
    expect(screen.queryByText("小B")).toBeNull();
    expect(onCancelled).not.toHaveBeenCalled();
    expect(onFinished).not.toHaveBeenCalled();

    tap("结束本轮私密互动");
    expect(onCancelled).toHaveBeenCalledTimes(1);
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("未选人时不能提交；提交后不回显答案（不显示所选对象）", () => {
    openSheet();
    handOver();
    expect(screen.getByRole("button", { name: "提交" })).toBeDisabled();

    submitTo("小B");
    expect(screen.getByText("已提交")).toBeInTheDocument();
    expect(screen.queryByText("小B")).toBeNull();
    expect(screen.queryByRole("button", { name: "小B" })).toBeNull();
  });

  it("下一位必须从点名遮罩重新起步，不能直达选择页", () => {
    openSheet();
    handOver();
    submitTo("小B");
    maskAndHandOff();

    expect(screen.getByText("请把手机交给 小B")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "小C" })).toBeNull();
    expect(screen.queryByText("已提交")).toBeNull();
  });

  it("跳过无惩罚：直接进遮罩交接，对公不出现任何跳过/未选提示", () => {
    openSheet();
    handOver();
    tap("跳过");
    expect(screen.getByText("答案已隐藏")).toBeInTheDocument();
    expect(screen.queryByText(/跳过|未选|未提交/)).toBeNull();

    maskAfterSkip();
    expect(screen.getByText("请把手机交给 小B")).toBeInTheDocument();
  });

  it("全部完成后只公布双方互选的结果", () => {
    const { onFinished } = openSheet();
    handOver();
    submitTo("小B");
    maskAndHandOff();
    handOver();
    submitTo("小A");
    maskAndHandOff();
    handOver();
    tap("跳过");
    maskAfterSkip();
    handOver();
    tap("跳过");
    maskAfterSkip();

    expect(screen.getByText("互选成功")).toBeInTheDocument();
    expect(screen.getByText("小A × 小B")).toBeInTheDocument();
    expect(screen.queryByText("小C")).toBeNull();
    expect(screen.queryByText("小D")).toBeNull();

    tap("继续游戏");
    expect(onFinished).toHaveBeenCalledTimes(1);
    const payload = onFinished.mock.calls[0]![0];
    expect(payload.checkpoint).toBe(9);
    expect(payload.runId).toBeTruthy();
    expect(payload.matches).toEqual([{ pairKey: "p1::p2", playerIds: ["p1", "p2"] }]);
  });

  it("无交集只给中性文案，不公开任何参与者", () => {
    const { onFinished } = openSheet();
    for (let index = 0; index < players.length; index += 1) {
      handOver();
      tap("跳过");
      maskAfterSkip();
    }

    expect(screen.getByText("本轮已完成，继续游戏")).toBeInTheDocument();
    for (const player of players) expect(screen.queryByText(player.displayName)).toBeNull();

    tap("继续游戏");
    expect(onFinished.mock.calls[0]![0].matches).toEqual([]);
  });

  it("取消本轮：不产生结果、不计一次常规互选", () => {
    const { onCancelled, onFinished } = openSheet();
    tap("取消本轮");
    expect(onCancelled).toHaveBeenCalledTimes(1);
    expect(onFinished).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* R-CB9｜Mutual UI 按「当前合法异性候选数」分支（与 Single-Anchor Guard 解耦）  */
/* ------------------------------------------------------------------ */

const male = (playerId: string, active = true): SessionParticipant => ({ playerId, active, pairGender: "male" });
const female = (playerId: string, active = true): SessionParticipant => ({ playerId, active, pairGender: "female" });
const named = (entries: readonly (readonly [string, string])[]): MutualCheckPlayer[] =>
  entries.map(([id, displayName]) => ({ id, displayName }));

/** 1男3女：f1/f2/f3 女、m1 男（Single-Anchor 桌，多数方每人只有 m1 一个合法候选）。 */
const ANCHOR_TABLE: SessionParticipant[] = [female("f1"), male("m1"), female("f2"), female("f3")];
const ANCHOR_NAMES = named([["f1", "小美"], ["m1", "阿豪"], ["f2", "小丽"], ["f3", "小雅"]]);

/** 1男2女：3 人桌，Single-Anchor Guard 不触发（max=2 < 3）。 */
const SMALL_TABLE: SessionParticipant[] = [female("f1"), male("m1"), female("f2")];
const SMALL_NAMES = named([["f1", "小美"], ["m1", "阿豪"], ["f2", "小丽"]]);

const renderSheet = (table: SessionParticipant[], list: MutualCheckPlayer[]) => {
  const onFinished = vi.fn();
  const onCancelled = vi.fn();
  const view = (t: SessionParticipant[], l: MutualCheckPlayer[]) => (
    <MutualCheckSheet
      open
      players={l}
      participants={t}
      checkpoint={9}
      relationship={createInitialRelationshipState()}
      onFinished={onFinished}
      onCancelled={onCancelled}
    />
  );
  const { rerender } = render(view(table, list));
  return {
    onFinished,
    onCancelled,
    rerender: (t: SessionParticipant[], l: MutualCheckPlayer[] = list) => rerender(view(t, l)),
  };
};

/** 走完一位参与者的交接并进入选择页。 */
const enterSelect = () => { tap("已交给 TA"); tap("是，继续"); tap("我准备好了"); };
/** 提交后交接下一位：SUBMITTED → MASKED → NEXT。 */
const handOffAfterSubmit = () => { tap("继续"); tap("已遮好"); tap("继续"); };

describe("MutualCheckSheet｜R-CB9 单候选 Yes/No 与多人候选 UI 分支", () => {
  it("1男3女：多数方只剩单一候选 → 显示 Yes/No 文案与「愿意 / 暂时没有」两个选项", () => {
    renderSheet(ANCHOR_TABLE, ANCHOR_NAMES);
    enterSelect();
    expect(screen.getByText("今晚到现在，你愿意继续了解 TA 吗？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "愿意" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "暂时没有" })).toBeInTheDocument();
    // Yes/No 分支不列名单、不给第三人（含异性但非候选）任何选项
    expect(screen.queryByRole("button", { name: "小丽" })).toBeNull();
    expect(screen.queryByRole("button", { name: "小雅" })).toBeNull();
    expect(screen.queryByRole("button", { name: "阿豪" })).toBeNull();
  });

  it("1男3女：anchor 本人有多候选 → 仍是现有多人候选 UI（不强制 Yes/No）", () => {
    renderSheet(ANCHOR_TABLE, ANCHOR_NAMES);
    enterSelect();
    tap("暂时没有");
    handOffAfterSubmit();
    enterSelect(); // 轮到 anchor m1
    expect(screen.getByText("只选一个人，或跳过")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "小美" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "小丽" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "小雅" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "愿意" })).toBeNull();
    expect(screen.queryByRole("button", { name: "暂时没有" })).toBeNull();
  });

  it("1男2女（Guard 不触发）多数方唯一候选 → 仍用 Yes/No，证明 UI 与 Guard 解耦", () => {
    expect(singleAnchorPlayerId(SMALL_TABLE)).toBeNull(); // Guard=false
    renderSheet(SMALL_TABLE, SMALL_NAMES);
    enterSelect();
    expect(screen.getByText("今晚到现在，你愿意继续了解 TA 吗？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "愿意" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "暂时没有" })).toBeInTheDocument();
  });

  it("愿意 → 映射到唯一候选：双方愿意才成 MATCH", () => {
    const table = [female("f1"), male("m1")];
    const names = named([["f1", "小美"], ["m1", "阿豪"]]);
    const { onFinished } = renderSheet(table, names);

    enterSelect();
    tap("愿意");
    handOffAfterSubmit();
    enterSelect();
    tap("愿意");
    handOffAfterSubmit();

    expect(screen.getByText("互选成功")).toBeInTheDocument();
    expect(screen.getByText("小美 × 阿豪")).toBeInTheDocument();
    tap("继续游戏");
    expect(onFinished.mock.calls[0]![0].matches).toEqual([{ pairKey: "f1::m1", playerIds: ["f1", "m1"] }]);
  });

  it("暂时没有 → null：单向不成立、不公开任何结果", () => {
    const table = [female("f1"), male("m1")];
    const names = named([["f1", "小美"], ["m1", "阿豪"]]);
    const { onFinished } = renderSheet(table, names);

    enterSelect();
    tap("暂时没有");
    handOffAfterSubmit();
    enterSelect();
    tap("愿意");
    handOffAfterSubmit();

    expect(screen.getByText("本轮已完成，继续游戏")).toBeInTheDocument();
    expect(screen.queryByText("互选成功")).toBeNull();
    tap("继续游戏");
    expect(onFinished.mock.calls[0]![0].matches).toEqual([]);
  });

  it("唯一候选在提交前失效（暂离/候选变化）→ 拒绝提交并给可读提示，不产生非法 MATCH", () => {
    const table = [female("f1"), male("m1")];
    const names = named([["f1", "小美"], ["m1", "阿豪"]]);
    const { rerender, onFinished } = renderSheet(table, names);

    enterSelect();
    expect(screen.getByRole("button", { name: "愿意" })).toBeInTheDocument();

    // 作答期间 m1 暂离：真实合法边消失，快照里的唯一候选已失效
    rerender([female("f1"), male("m1", false)]);
    tap("愿意");

    expect(screen.getByText("TA 现在不在可选范围内，先跳过吧。")).toBeInTheDocument();
    // 仍停在选择页：没有提交、没有公开结果
    expect(screen.getByRole("button", { name: "愿意" })).toBeInTheDocument();
    expect(screen.queryByText("已提交")).toBeNull();

    // 走完流程：失效目标只能按「暂时没有」（= null）收场，最终空结果，不产生非法 MATCH
    tap("暂时没有");
    handOffAfterSubmit();
    enterSelect();
    tap("跳过");
    tap("已遮好");
    tap("继续");
    tap("继续游戏");
    expect(onFinished.mock.calls[0]![0].matches).toEqual([]);
  });
});
