import { describe, expect, it } from "vitest";
import { SOURCE_FORMATS, TARGET_FORMATS, outputFileName, outputInfo } from "./formats";

describe("conversion format contract", () => {
  it("contains all 42 cross-format routes", () => {
    const sources = SOURCE_FORMATS.filter((format) => format !== "自动识别");
    const routes = sources.flatMap((source) =>
      TARGET_FORMATS.filter((target) => target !== source).map((target) => `${source}->${target}`),
    );
    expect(routes).toHaveLength(42);
    expect(new Set(routes)).toHaveLength(42);
  });

  it("maps every target to a safe file name and MIME type", () => {
    for (const target of TARGET_FORMATS) {
      expect(outputInfo(target).mimeType).toMatch(/^image\//);
      expect(outputFileName("../危险 photo.png", target)).not.toContain("/");
    }
  });
});
