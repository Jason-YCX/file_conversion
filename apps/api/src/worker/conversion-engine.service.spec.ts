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

const compressionOptions = {
  preset: "balanced" as const,
  quality: 80,
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

  it("compresses every supported format without changing its format", async () => {
    const source = sharp({
      create: { width: 24, height: 16, channels: 4, background: { r: 36, g: 98, b: 172, alpha: 0.8 } },
    });
    const inputs = {
      JPG: await source.clone().jpeg().toBuffer(),
      PNG: await source.clone().png().toBuffer(),
      WebP: await source.clone().webp().toBuffer(),
      AVIF: await source.clone().avif().toBuffer(),
      GIF: await source.clone().gif().toBuffer(),
      TIFF: await source.clone().tiff().toBuffer(),
    } as const;

    for (const [format, input] of Object.entries(inputs)) {
      const result = await engine.compress(input, compressionOptions);
      expect(result.targetFormat).toBe(format);
      expect(result.detectedSourceFormat).toBe(format);
      expect(result.data.length).toBeGreaterThan(0);
    }
  });

  it("supports proportional and bounded resizing without enlargement", async () => {
    const input = await sharp({
      create: { width: 100, height: 50, channels: 3, background: "#7356c8" },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
    const scaled = await engine.compress(input, { ...compressionOptions, scale: 0.5 });
    expect(await sharp(scaled.data).metadata()).toMatchObject({ width: 50, height: 25 });

    const bounded = await engine.compress(input, {
      ...compressionOptions,
      resizeWidth: 20,
      resizeHeight: 20,
    });
    expect(await sharp(bounded.data).metadata()).toMatchObject({ width: 20, height: 10 });

    const notEnlarged = await engine.compress(input, {
      ...compressionOptions,
      resizeWidth: 1000,
      resizeHeight: 1000,
    });
    expect(await sharp(notEnlarged.data).metadata()).toMatchObject({ width: 100, height: 50 });
  });

  it("removes orientation metadata when it emits a recompressed file", async () => {
    const input = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "#ff734e" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(input).metadata()).orientation).toBe(6);

    const result = await engine.compress(input, { ...compressionOptions, scale: 0.5 });
    expect((await sharp(result.data).metadata()).orientation).toBeUndefined();
  });

  it("keeps the original bytes when same-size compression has no benefit", async () => {
    const input = await sharp({
      create: { width: 1, height: 1, channels: 4, background: "transparent" },
    })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    const result = await engine.compress(input, {
      ...compressionOptions,
      preset: "high_quality",
      quality: 90,
    });
    expect(result.keptOriginal).toBe(true);
    expect(result.data.equals(input)).toBe(true);
  });

  it("preserves animated GIF/WebP and multi-page TIFF during compression", async () => {
    const red = await sharp({ create: { width: 3, height: 2, channels: 4, background: "red" } })
      .png()
      .toBuffer();
    const blue = await sharp({ create: { width: 3, height: 2, channels: 4, background: "blue" } })
      .png()
      .toBuffer();
    const sources = {
      GIF: await sharp([red, blue], { join: { animated: true } })
        .gif({ delay: [80, 120], loop: 0 })
        .toBuffer(),
      WebP: await sharp([red, blue], { join: { animated: true } })
        .webp({ delay: [80, 120], loop: 0 })
        .toBuffer(),
      TIFF: await sharp([red, blue], { join: { animated: true } }).tiff().toBuffer(),
    } as const;

    for (const input of Object.values(sources)) {
      const result = await engine.compress(input, {
        ...compressionOptions,
        preset: "small_file",
      });
      expect((await sharp(result.data, { animated: true }).metadata()).pages).toBe(2);
    }
  });

  it("rejects animated AVIF before decoding it as a still image", async () => {
    const animatedAvifHeader = Buffer.from("000000006674797061766973", "hex");
    await expect(engine.compress(animatedAvifHeader, compressionOptions)).rejects.toMatchObject({
      code: "ANIMATED_AVIF_NOT_SUPPORTED",
    });
  });
});
