import { expect, test } from "@playwright/test";

/**
 * T184 [US1] / FR-003 / FR-040：锁死组局页现有的关系选项、今晚氛围选项与尺度 slider 行为。
 * 这些文案与档位属于 V1.0 冻结资产，V1.2 只允许继承，不允许改文案或重做尺度；改了就红。
 */
const RELATIONSHIP_LABELS = ["第一次见 / 拼桌", "刚认识", "普通朋友", "熟人局", "很熟", "情侣 / 暧昧"];
const VIBE_LABELS = ["破冰", "搞笑", "暧昧", "放开玩", "随机"];
const INTENSITY_LABELS: Array<[number, string]> = [
  [1, "安全破冰"],
  [2, "熟悉起来"],
  [3, "有点刺激"],
  [4, "明显暧昧"],
  [5, "高能但有边界"],
];

function sectionOf(page: import("@playwright/test").Page, heading: string) {
  return page.locator("section.setup-section").filter({ has: page.getByRole("heading", { name: heading }) });
}

test("关系选项、今晚氛围选项保持现有文案与档位", async ({ page }) => {
  await page.goto("/setup");

  const relationship = sectionOf(page, "你们之间是什么关系？");
  await expect(relationship.getByRole("button")).toHaveCount(RELATIONSHIP_LABELS.length);
  await expect(relationship.getByRole("button")).toHaveText(RELATIONSHIP_LABELS);
  // 单选：默认普通朋友，点了熟人局之后旧选中必须取消。
  await expect(relationship.getByRole("button", { name: "普通朋友" })).toHaveClass(/is-selected/);
  await relationship.getByRole("button", { name: "熟人局" }).click();
  await expect(relationship.getByRole("button", { name: "熟人局" })).toHaveClass(/is-selected/);
  await expect(relationship.getByRole("button", { name: "普通朋友" })).not.toHaveClass(/is-selected/);

  const vibes = sectionOf(page, "今晚的氛围是？");
  await expect(vibes.getByRole("button")).toHaveCount(VIBE_LABELS.length);
  await expect(vibes.getByRole("button")).toHaveText(VIBE_LABELS);
  // 多选：默认搞笑，再点破冰两项都在，重复点击取消。
  await expect(vibes.getByRole("button", { name: "搞笑" })).toHaveAttribute("aria-pressed", "true");
  await vibes.getByRole("button", { name: "破冰" }).click();
  await expect(vibes.getByRole("button", { name: "搞笑" })).toHaveAttribute("aria-pressed", "true");
  await expect(vibes.getByRole("button", { name: "破冰" })).toHaveAttribute("aria-pressed", "true");
  await vibes.getByRole("button", { name: "破冰" }).click();
  await expect(vibes.getByRole("button", { name: "破冰" })).toHaveAttribute("aria-pressed", "false");
});

test("尺度 slider 保持 1–5 五档与现有档位文案", async ({ page }) => {
  await page.goto("/setup");

  const slider = page.getByLabel("游戏强度");
  await expect(slider).toHaveAttribute("type", "range");
  await expect(slider).toHaveAttribute("min", "1");
  await expect(slider).toHaveAttribute("max", "5");
  await expect(slider).toHaveAttribute("step", "1");
  await expect(slider).toHaveValue("3");

  const label = page.locator(".intensity-label");
  await expect(label.locator("span").first()).toHaveText("安全");
  await expect(label.locator("span").last()).toHaveText("高能");
  for (const [value, text] of INTENSITY_LABELS) {
    await slider.fill(String(value));
    await expect(slider).toHaveValue(String(value));
    await expect(label.locator("strong")).toHaveText(`${value} · ${text}`);
  }
});

test("组局草稿继承所选关系、氛围与强度，不改 SessionConfig 字段名", async ({ page }) => {
  await page.goto("/setup");
  await sectionOf(page, "你们之间是什么关系？").getByRole("button", { name: "情侣 / 暧昧" }).click();
  await sectionOf(page, "今晚的氛围是？").getByRole("button", { name: "搞笑" }).click();
  await sectionOf(page, "今晚的氛围是？").getByRole("button", { name: "暧昧", exact: true }).click();
  await page.getByLabel("游戏强度").fill("5");
  await page.getByRole("button", { name: /下一步：雷区设置/ }).click();
  await expect(page).toHaveURL(/\/boundaries/);

  // B7/D4：草稿外层多了当局参与者段（性别只随本局走），SessionConfig 字段名与形状保持不变。
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem("party-night-session-draft") ?? "null") as {
    config: { relationship: string; vibes: string[]; intensity: number; boundaries: Record<string, unknown> };
    participants: Array<{ playerId: string; active: boolean; pairGender: string | null }>;
  });
  expect(draft.config.relationship).toBe("couple");
  expect(draft.config.vibes).toEqual(["flirty"]);
  expect(draft.config.intensity).toBe(5);
  // 雷区沿用既有 SessionConfig.boundaries，不新增第二套字段。
  expect(Object.keys(draft.config.boundaries)).toContain("noPhysicalContact");
  expect(Object.keys(draft.config.boundaries)).toContain("customText");
  // 未选择时一律 null（默认不填），且人数与玩家数一致。
  expect(draft.participants.length).toBeGreaterThanOrEqual(2);
  expect(draft.participants.every((item) => item.pairGender === null)).toBe(true);
});

test("组局页可逐人录性别（男/女/不填三态），录入随当局草稿传递", async ({ page }) => {
  await page.goto("/setup");

  const first = page.getByRole("group", { name: "玩家 1 性别（可留空）" });
  const second = page.getByRole("group", { name: "玩家 2 性别（可留空）" });
  await expect(first.getByRole("button", { name: "不填" })).toHaveAttribute("aria-pressed", "true");
  await first.getByRole("button", { name: "男" }).click();
  await second.getByRole("button", { name: "女" }).click();
  await expect(first.getByRole("button", { name: "男" })).toHaveAttribute("aria-pressed", "true");
  await expect(second.getByRole("button", { name: "女" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /下一步：雷区设置/ }).click();
  await expect(page).toHaveURL(/\/boundaries/);

  const participants = await page.evaluate(() =>
    (JSON.parse(sessionStorage.getItem("party-night-session-draft") ?? "null") as {
      participants: Array<{ pairGender: string | null }>;
    }).participants.map((item) => item.pairGender),
  );
  expect(participants.slice(0, 2)).toEqual(["male", "female"]);
  expect(participants.slice(2).every((gender) => gender === null)).toBe(true);
});
