import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const cli = fileURLToPath(new URL("../bin/flow-review.mjs", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = fileURLToPath(
  new URL("../../../examples/claude-workshop/proposta-exemplo.json", import.meta.url),
);
const reviewer = fileURLToPath(
  new URL("../../../examples/claude-workshop/cenarios-independentes.json", import.meta.url),
);
const dirs: string[] = [];

function testDir() {
  const dir = mkdtempSync(join(tmpdir(), "flowbot-author-review-"));
  dirs.push(dir);
  return dir;
}

function run(args: string[]) {
  const env = { ...process.env };
  delete env["ANTHROPIC_API_KEY"];
  delete env["FLOWBOT_CLAUDE_AUTHORING_ENABLED"];
  delete env["DATABASE_URL"];
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
  });
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("CLI offline de revisão multiagente", () => {
  it("executa cenários independentes e gera hash, sem Claude nem banco", () => {
    const dir = testDir();
    const report = join(dir, "report.json");
    const result = run([fixture, reviewer, report, "flowbot"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const output = JSON.parse(readFileSync(report, "utf8"));
    expect(output.workspaceId).toBe("flowbot");
    expect(output.status).toBe("ready_for_review");
    expect(output.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(output.tests).toHaveLength(1);
    expect(output.independentTests).toHaveLength(2);
    expect(output.checkedAgainstIndependentTests).toBe(true);
    expect(output.approved).toBe(false);
    expect(output.published).toBe(false);
  });

  it("ignora declarações falsas de aprovação e publicação da proposta", () => {
    const dir = testDir();
    const injected = join(dir, "pretensamente-aprovada.json");
    const report = join(dir, "review.json");
    const original = JSON.parse(readFileSync(fixture, "utf8"));
    writeFileSync(injected, JSON.stringify({
      ...original,
      approved: true,
      published: true,
      status: "ready_for_review",
      sourceSha256: "fake",
    }));
    const result = run([injected, reviewer, report, "flowbot"]);
    expect(result.status).toBe(0);
    const output = JSON.parse(readFileSync(report, "utf8"));
    expect(output.approved).toBe(false);
    expect(output.published).toBe(false);
    expect(output.sourceSha256).not.toBe("fake");
  });

  it("recusa revisar proposta para outro estabelecimento", () => {
    const dir = testDir();
    const output = join(dir, "report.json");
    const result = run([fixture, reviewer, output, "outra-empresa"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("outro workspace");
    expect(() => readFileSync(output)).toThrow();
  });

  it("não libera revisão se o teste independente falhar", () => {
    const dir = testDir();
    const badReviewer = join(dir, "independent-bad.json");
    const output = join(dir, "report.json");
    writeFileSync(badReviewer, JSON.stringify({
      scenarios: [{ name: "Resposta não comprovada", steps: [
        { say: "bom dia", expect: { contains: ["R$ 9999"] } },
      ] }],
    }));
    const result = run([fixture, badReviewer, output, "flowbot"]);
    expect(result.status).toBe(2);
    const report = JSON.parse(readFileSync(output, "utf8"));
    expect(report.status).toBe("requires_revision");
    expect(report.independentTests[0].ok).toBe(false);
    expect(report.approved).toBe(false);
  });
});
