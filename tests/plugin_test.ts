import { ServerContext, Status } from "../server.ts";
import {
  assert,
  assertEquals,
  assertStringIncludes,
  delay,
  puppeteer,
} from "./deps.ts";
import manifest from "./fixture_plugin/fresh.gen.ts";
import options from "./fixture_plugin/options.ts";
import { startFreshServer } from "./test_utils.ts";

const ctx = await ServerContext.fromManifest(manifest, options);
const handler = ctx.handler();
const router = (req: Request) => {
  return handler(req, {
    remoteAddr: {
      transport: "tcp",
      hostname: "127.0.0.1",
      port: 80,
    },
  });
};

Deno.test("/static page prerender", async () => {
  const resp = await router(new Request("https://fresh.deno.dev/static"));
  assert(resp);
  assertEquals(resp.status, Status.OK);
  const body = await resp.text();
  assertStringIncludes(body, '<style id="abc">body { color: red; }</style>');
  assert(!body.includes(`>{"v":[[],[]]}</script>`));
  assert(!body.includes(`import`));
  assertStringIncludes(
    body,
    '<style id="def">h1 { text-decoration: underline; }</style>',
  );
});

Deno.test("/with-island prerender", async () => {
  const resp = await router(new Request("https://fresh.deno.dev/with-island"));
  assert(resp);
  assertEquals(resp.status, Status.OK);
  const body = await resp.text();
  assertStringIncludes(
    body,
    '<style id="abc">body { color: red; } h1 { color: blue; }</style>',
  );
  assertStringIncludes(body, `>{"v":[[{}],["JS injected!"]]}</script>`);
  assertStringIncludes(body, `/plugin-js-inject-main.js"`);
  assertStringIncludes(
    body,
    '<style id="def">h1 { text-decoration: underline; } h1 { font-style: italic; }</style>',
  );
});

Deno.test("plugin routes and middleware", async () => {
  const resp = await router(new Request("https://fresh.deno.dev/test"));
  assert(resp);
  assertEquals(resp.status, Status.OK);
  const body = await resp.text();
  assertStringIncludes(
    body,
    `<h1>look, i'm set from a plugin!</h1>`,
  );
  assertStringIncludes(
    body,
    `<title>Title Set From Plugin Config</title>`,
  );
});

Deno.test("plugin middleware multiple handlers", async () => {
  const resp = await router(
    new Request("https://fresh.deno.dev/lots-of-middleware"),
  );
  assert(resp);
  assertEquals(resp.status, Status.OK);
  const body = await resp.text();
  assertStringIncludes(
    body,
    `<h1>3</h1>`,
  );
});

Deno.test("plugin route no leading slash", async () => {
  const resp = await router(
    new Request("https://fresh.deno.dev/no-leading-slash-here"),
  );
  assert(resp);
  assertEquals(resp.status, Status.OK);
  const body = await resp.text();
  assertStringIncludes(
    body,
    `<div>Hello</div>`,
  );
});

Deno.test({
  name: "/with-island hydration",
  async fn(t) {
    // Preparation
    const { lines, serverProcess, address } = await startFreshServer({
      args: ["run", "-A", "./tests/fixture_plugin/main.ts"],
    });

    await delay(100);

    const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage();

    await page.goto(`${address}/with-island`, {
      waitUntil: "networkidle2",
    });

    await t.step("island is revived", async () => {
      await page.waitForSelector("#csr");
    });

    await t.step("title was updated", async () => {
      const title = await page.title();
      assertEquals(title, "JS injected!");
    });

    await browser.close();

    await lines.cancel();
    serverProcess.kill("SIGTERM");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
