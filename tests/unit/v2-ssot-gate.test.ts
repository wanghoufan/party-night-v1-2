import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { materializeFromBytes, readMemberRawBytes, sha256Hex } from "@/scripts/build-v2-ssot";
import {
  V2_SSOT_ARCHIVE_REL_PATH,
  V2_SSOT_EXPANSION_MEMBER,
  V2_SSOT_EXPANSION_SHA256,
  V2_SSOT_MAINLINE_MEMBER,
  V2_SSOT_MAINLINE_SHA256,
} from "@/lib/v2-content/v2-types";
import { validateV13Envelope } from "@/lib/v2-content/v2-validation";

const readArchiveMember = (member: string) => {
  const bytes = readFileSync(V2_SSOT_ARCHIVE_REL_PATH);
  return readMemberRawBytes(bytes, member);
};

describe("v2 content SSOT build gate", () => {
  it("reads the exact frozen archive members and matches R5 fixed SHA256", () => {
    for (const [member, expected] of [
      [V2_SSOT_MAINLINE_MEMBER, V2_SSOT_MAINLINE_SHA256],
      [V2_SSOT_EXPANSION_MEMBER, V2_SSOT_EXPANSION_SHA256],
    ] as const) {
      expect(sha256Hex(readArchiveMember(member))).toBe(expected);
    }
  });

  it("fails closed when a member hash does not match the fixed gate value", () => {
    const mainline = readArchiveMember(V2_SSOT_MAINLINE_MEMBER);
    const expansion = readArchiveMember(V2_SSOT_EXPANSION_MEMBER);
    const corrupted = Buffer.from(mainline);
    corrupted[0] = corrupted[0] ^ 0xff;

    expect(() => materializeFromBytes({ mainlineBytes: corrupted, expansionBytes: expansion })).toThrow(/SHA256 Gate FAILED/);
    expect(() =>
      materializeFromBytes({ mainlineBytes: mainline, expansionBytes: Buffer.from("{}", "utf8") }),
    ).toThrow(/SHA256 Gate FAILED/);
  });

  it("fails closed on schema/quantity/enum violations before producing a snapshot", () => {
    expect(
      validateV13Envelope({
        mainlineSchemaVersion: "2.3",
        mainlineCards: [],
        expansionSchemaVersion: "2.3",
        expansionCards: [],
        runtimeRules: {},
      }).ok,
    ).toBe(false);

    const mainline = JSON.parse(readArchiveMember(V2_SSOT_MAINLINE_MEMBER).toString("utf8")) as Record<string, unknown>;
    const expansion = JSON.parse(readArchiveMember(V2_SSOT_EXPANSION_MEMBER).toString("utf8")) as Record<string, unknown>;

    const bad = validateV13Envelope({
      mainlineSchemaVersion: mainline.schemaVersion,
      mainlineCards: (mainline.cards as unknown[]).slice(0, 10),
      expansionSchemaVersion: expansion.schemaVersion,
      expansionCards: expansion.cards,
      runtimeRules: mainline.runtimeRules,
    });
    expect(bad.ok).toBe(false);
  });

  it("materializes a valid snapshot with provenance from the live frozen zip", () => {
    const snapshot = materializeFromBytes({
      mainlineBytes: readArchiveMember(V2_SSOT_MAINLINE_MEMBER),
      expansionBytes: readArchiveMember(V2_SSOT_EXPANSION_MEMBER),
    });
    expect(snapshot.mainlineCards).toHaveLength(350);
    expect(snapshot.expansionCards).toHaveLength(40);
    expect(snapshot.provenance.mainline.sha256).toBe(V2_SSOT_MAINLINE_SHA256);
    expect(snapshot.provenance.expansion.sha256).toBe(V2_SSOT_EXPANSION_SHA256);
    expect(snapshot.provenance.migrationIdPolicy).toBe("NONE");
  });
});