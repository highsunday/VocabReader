import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("renderer content security policy", () => {
  it("allows only local blob media for generated voice previews", async () => {
    const html = await readFile(
      join(process.cwd(), "src", "renderer", "index.html"),
      "utf8"
    );

    expect(html).toContain("media-src 'self' blob:");
    expect(html).not.toContain("media-src *");
  });
});
