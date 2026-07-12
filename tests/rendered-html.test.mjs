import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
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
  const [page, apiClient, css, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /requestUploadTicket/);
  assert.match(page, /uploadToObjectStorage/);
  assert.match(page, /createConversionJob/);
  assert.match(page, /mapWithConcurrency\(pendingItems, 3/);
  assert.match(page, /onDrop=\{handleDrop\}/);
  assert.match(page, /WebP.*JPG.*PNG/s);
  assert.match(page, /查看全部图片格式/);
  assert.match(page, /role="status"/);
  assert.match(page, /转换引擎暂未启用/);
  assert.match(apiClient, /NEXT_PUBLIC_API_BASE_URL/);
  assert.match(apiClient, /XMLHttpRequest/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(layout, /og\.png/);
  assert.match(packageJson, /"name": "qingzhuan-file-converter"/);
  assert.match(packageJson, /"apps\/api"/);
  assert.doesNotMatch(page, /convertInBrowser|canvas\.toBlob|下载全部/);
  assert.doesNotMatch(page + layout, /SkeletonPreview|_sites-preview|codex-preview/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
