import type sharpFactory from "sharp";
import { describe, expect, it } from "vitest";
import { TARGET_FORMATS } from "../conversion/formats";
import { ConversionEngineService } from "./conversion-engine.service";

const sharp: typeof sharpFactory = require("sharp");

const HEIC_FIXTURE = Buffer.from(
  "AAAAKGZ0eXBoZWljAAAAAG1pZjFNaUhFTWlQcm1pYWZNaUhCaGVpYwAAArNtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAA5waXRtAAAAAAABAAAATWlpbmYAAAAAAAMAAAAVaW5mZQIAAAAAAQAAaHZjMQAAAAAVaW5mZQIAAAEAAgAAaHZjMQAAAAAVaW5mZQIAAAEAAwAARXhpZgAAAAAoaXJlZgAAAAAAAAAOYXV4bAACAAEAAQAAAA5jZHNjAAMAAQABAAABpWlwcnAAAAF8aXBjbwAAABNjb2xybmNseAACAAIABoAAAAAMY2xsaQDLAEAAAAAUaXNwZQAAAAAAAAACAAAAAgAAAAlpcm90AAAAABBwaXhpAAAAAAMICAgAAAAOcGl4aQAAAAABCAAAADdhdXhDAAAAAHVybjptcGVnOmhldmM6MjAxNTphdXhpZDoxAAAAAAwAAAAITgGlBAAB/kAAAAByaHZjQwEDcAAAALAAAAAAAB7wAPz9+PgAAAsDoAABABdAAQwB//8DcAAAAwCwAAADAAADAB5wJKEAAQAkQgEBA3AAAAMAsAAAAwAAAwAeoBQgQcChBBiHuRZVNwICBgCAogABAAlEAcBhcshAUyQAAABxaHZjQwEECAAAAL/IAAAAAB7wAPz8+PgAAAsDoAABABdAAQwB//8ECAAAAwC/yAAAAwAAHhcCQKEAAQAjQgEBBAgAAAMAv8gAAAMAAB7AUIEHAT8H+IF7kWVTcCAgIAiiAAEACUQBwGHSyEBTJAAAACFpcG1hAAAAAAAAAAIAAQaBAgMFiIQAAgUDBoeJhAAAADppbG9jAAAAAEQAAAMAAQAAAAEAAAM3AAAAPwACAAAAAQAAA3YAAAAUAAMAAAABAAAC6wAAAEwAAAABbWRhdAAAAAAAAACvAAAABkV4aWYAAE1NACoAAAAIAAMBGgAFAAAAAQAAADIBGwAFAAAAAQAAADoBKAADAAAAAQACAAAAAAAAAAAAGQAAAAEAAAAZAAAAAQAAADsoAa+i+kaBfP/92s//9uX7L9AKPVf/tCfI+buy/6ZQ90yyZ/og+cI53hzw5nPv9uVCL2FfgrcISbIrgAAAABAoAa9OwJKQI0XxQGFlGcE+",
  "base64",
);

const options = {
  quality: 86,
  scale: 1,
  maxInputPixels: 40_000_000,
  timeoutMs: 10_000,
};

describe("ConversionEngineService", () => {
  const engine = new ConversionEngineService();

  it("encodes a raster source to every supported target", async () => {
    const input = await sharp({
      create: { width: 4, height: 2, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } },
    })
      .png()
      .toBuffer();
    for (const targetFormat of TARGET_FORMATS) {
      const result = await engine.convert(input, { ...options, targetFormat });
      expect(result.detectedSourceFormat).toBe("PNG");
      expect(result.data.length).toBeGreaterThan(0);
      const expectedFormat = targetFormat === "JPG"
        ? "jpeg"
        : targetFormat === "AVIF"
          ? "heif"
          : targetFormat.toLowerCase();
      expect((await sharp(result.data).metadata()).format).toBe(expectedFormat);
    }
  });

  it("uses the dedicated HEIC decoder", async () => {
    await expect(
      engine.convert(HEIC_FIXTURE, { ...options, targetFormat: "JPG" }),
    ).resolves.toMatchObject({ detectedSourceFormat: "HEIC", mimeType: "image/jpeg" });
  });

  it("rejects BMP input", async () => {
    const input = Buffer.from(
      "Qk1GAAAAAAAAADYAAAAoAAAAAgAAAP7///8BABgAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//wD/AAAA//////8AAA==",
      "base64",
    );
    await expect(
      engine.convert(input, { ...options, targetFormat: "PNG" }),
    ).rejects.toThrow(/unsupported image format/i);
  });

  it("preserves animation only for animated targets", async () => {
    const red = await sharp({ create: { width: 2, height: 2, channels: 4, background: "red" } })
      .png()
      .toBuffer();
    const blue = await sharp({ create: { width: 2, height: 2, channels: 4, background: "blue" } })
      .png()
      .toBuffer();
    const animated = await sharp([red, blue], { join: { animated: true } })
      .gif({ delay: [80, 120], loop: 0 })
      .toBuffer();

    for (const targetFormat of ["GIF", "WebP"] as const) {
      const animatedResult = await engine.convert(animated, { ...options, targetFormat });
      expect((await sharp(animatedResult.data, { animated: true }).metadata()).pages).toBe(2);
    }
    const avif = await engine.convert(animated, { ...options, targetFormat: "AVIF" });
    expect(avif.data.toString("ascii", 8, 12)).toBe("avis");
    const png = await engine.convert(animated, { ...options, targetFormat: "PNG" });
    expect((await sharp(png.data).metadata()).pages ?? 1).toBe(1);
  });

  it("scales dimensions and uses a white background for JPG", async () => {
    const input = await sharp({
      create: { width: 10, height: 6, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const result = await engine.convert(input, { ...options, targetFormat: "JPG", scale: 0.5 });
    const metadata = await sharp(result.data).metadata();
    expect({ width: metadata.width, height: metadata.height }).toEqual({ width: 5, height: 3 });
    expect(metadata.hasAlpha).toBe(false);
  });
});
