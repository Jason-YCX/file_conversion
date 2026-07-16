import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: handler } = await import(workerUrl.href);

  return handler(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
  );
}

test("server-renders the light conversion homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]+lang="zh-CN"/i);
  assert.match(html, /<title>轻转 · 在线图片格式转换工具<\/title>/i);
  assert.match(html, /想把图片转成什么？/);
  assert.match(html, /上传图片/);
  assert.match(html, /大家常用/);
  assert.match(html, /更多文件工具/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps the server-backed conversion experience interactive and responsive", async () => {
  const [page, apiClient, css, layout, packageJson, apiPackageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../apps/api/package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /requestUploadTicket/);
  assert.match(page, /uploadToObjectStorage/);
  assert.match(page, /createConversionJob/);
  assert.match(page, /mapWithConcurrency\(pendingItems, 3/);
  assert.match(page, /items\.map\(\(item\)/);
  assert.doesNotMatch(page, /items\.slice\(0, 3\)/);
  assert.match(page, /onDrop=\{handleDrop\}/);
  assert.match(page, /WebP.*JPG.*PNG/s);
  assert.doesNotMatch(page, /"BMP"|\.bmp|image\/bmp/i);
  assert.match(page, /查看全部图片格式/);
  assert.match(page, /role="status"/);
  assert.match(page, /pollConversion/);
  assert.match(page, /打包下载/);
  assert.match(apiClient, /createArchive/);
  assert.match(apiClient, /getConversionJob/);
  assert.match(apiClient, /NEXT_PUBLIC_API_BASE_URL/);
  assert.match(apiClient, /XMLHttpRequest/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.queue-list[\s\S]*max-height: 240px[\s\S]*overflow-y: auto/);
  assert.match(css, /\.toast[\s\S]*top: calc\(104px \+ env\(safe-area-inset-top, 0px\)\)/);
  assert.doesNotMatch(css.match(/\.toast \{[\s\S]*?\}/)?.[0] ?? "", /bottom:/);
  assert.match(css, /:focus-visible/);
  assert.match(layout, /og\.png/);
  assert.match(packageJson, /"name": "qingzhuan-file-converter"/);
  assert.match(packageJson, /"apps\/api"/);
  assert.match(apiPackageJson, /"start:worker:dev": "nest start --watch --entryFile worker"/);
  assert.doesNotMatch(apiPackageJson, /tsx watch src\/worker\.ts/);
  assert.doesNotMatch(page, /convertInBrowser|canvas\.toBlob|转换引擎暂未启用/);
  assert.doesNotMatch(page + layout, /SkeletonPreview|codex-preview/);

  assert.match(page, /PixelCursor/);
  assert.match(page, /pixel-horizon\.png/);
  assert.match(page, /pixel-ufo\.png/);
  assert.match(page, /pixel-rocket\.png/);
  assert.match(page, /pixel-stars\.png/);
  assert.match(page, /celebrating/);
  assert.match(css, /@font-face[\s\S]*Ark Pixel/);
  assert.match(css, /\(hover: none\), \(pointer: coarse\)/);
  assert.match(css, /\.pixel-cursor-halo\.is-active/);

  await Promise.all([
    access(new URL("../public/pixel/pixel-horizon.png", import.meta.url)),
    access(new URL("../public/pixel/pixel-ufo.png", import.meta.url)),
    access(new URL("../public/pixel/pixel-rocket.png", import.meta.url)),
    access(new URL("../public/pixel/pixel-stars.png", import.meta.url)),
    access(new URL("../public/pixel/pixel-orbit-trail.png", import.meta.url)),
    access(new URL("../public/fonts/ark-pixel/OFL.txt", import.meta.url)),
  ]);
});
