import { ServerContext } from "../server.ts";
import { assert, assertEquals, assertStringIncludes } from "./deps.ts";
import manifest from "./fixture/fresh.gen.ts";

const ctx = await ServerContext.fromManifest(manifest);
const router = (req: Request) => {
  return ctx.handler()(req, {
    localAddr: {
      transport: "tcp",
      hostname: "127.0.0.1",
      port: 80,
    },
    remoteAddr: {
      transport: "tcp",
      hostname: "127.0.0.1",
      port: 80,
    },
  });
};

Deno.test("/ page prerender", async () => {
  const resp = await router(new Request("https://fresh.deno.dev/"));
  assert(resp);
  assertEquals(resp.status, 200);
  assertEquals(resp.headers.get("content-type"), "text/html; charset=utf-8");
  assertEquals(resp.headers.get("server"), "fresh test server");
  const body = await resp.text();
  assertStringIncludes(body, `<html lang="en">`);
  assertStringIncludes(body, "test.js");
  assertStringIncludes(body, "<p>Hello!</p>");
  assertStringIncludes(body, "<p>Viewing JIT render.</p>");
  assertStringIncludes(body, `>[{"message":"Hello!"}]</script>`);
  assertStringIncludes(
    body,
    `<meta name="description" content="Hello world!" />`,
  );
});

Deno.test("/props/123 page prerender", async () => {
  const resp = await router(new Request("https://fresh.deno.dev/props/123"));
  assert(resp);
  assertEquals(resp.status, 200);
  assertEquals(resp.headers.get("content-type"), "text/html; charset=utf-8");
  const body = await resp.text();
  assertStringIncludes(
    body,
    `{&quot;params&quot;:{&quot;id&quot;:&quot;123&quot;},&quot;url&quot;:&quot;https://fresh.deno.dev/props/123&quot;,&quot;route&quot;:&quot;/props/:id&quot;}`,
  );
});

Deno.test("/[name] page prerender", async () => {
  const resp = await router(new Request("https://fresh.deno.dev/bar"));
  assert(resp);
  assertEquals(resp.status, 200);
  assertEquals(resp.headers.get("content-type"), "text/html; charset=utf-8");
  const body = await resp.text();
  assertStringIncludes(body, "<div>Hello bar</div>");
});

Deno.test("/intercept - GET html", async () => {
  const req = new Request("https://fresh.deno.dev/intercept", {
    headers: { "accept": "text/html" },
  });
  const resp = await router(req);
  assert(resp);
  assertEquals(resp.status, 200);
  const body = await resp.text();
  assertStringIncludes(body, "<div>This is HTML</div>");
});

Deno.test("/intercept - GET text", async () => {
  const req = new Request("https://fresh.deno.dev/intercept", {
    headers: { "accept": "text/plain" },
  });
  const resp = await router(req);
  assert(resp);
  assertEquals(resp.status, 200);
  const body = await resp.text();
  assertEquals(body, "This is plain text");
});

Deno.test("/intercept - POST", async () => {
  const req = new Request("https://fresh.deno.dev/intercept", {
    method: "POST",
  });
  const resp = await router(req);
  assert(resp);
  assertEquals(resp.status, 200);
  const body = await resp.text();
  assertEquals(body, "POST response");
});

Deno.test("/intercept - DELETE", async () => {
  const req = new Request("https://fresh.deno.dev/intercept", {
    method: "DELETE",
  });
  const resp = await router(req);
  assert(resp);
  assertEquals(resp.status, 405);
});

Deno.test("/intercept_args - GET html", async () => {
  const req = new Request("https://fresh.deno.dev/intercept_args", {
    headers: { "accept": "text/html" },
  });
  const resp = await router(req);
  assert(resp);
  assertEquals(resp.status, 200);
  const body = await resp.text();
  assertStringIncludes(body, "<div>intercepted</div>");
});

Deno.test("/api/get_only - NOTAMETHOD", async () => {
  const resp = await router(
    new Request("https://fresh.deno.dev/api/get_only", {
      method: "NOTAMETHOD",
    }),
  );
  assert(resp);
  assertEquals(resp.status, 405);
});

Deno.test("/api/xyz not found", async () => {
  const resp = await router(new Request("https://fresh.deno.dev/api/xyz"));
  assert(resp);
  assertEquals(resp.status, 404);
  const body = await resp.text();
  assertStringIncludes(body, "404 not found: /api/xyz");
});

Deno.test("/static page prerender", async () => {
  const resp = await router(new Request("https://fresh.deno.dev/static"));
  assert(resp);
  assertEquals(resp.status, 200);
  assertEquals(resp.headers.get("content-type"), "text/html; charset=utf-8");
  const body = await resp.text();
  assert(!body.includes(`main.js`));
  assert(!body.includes(`island-test.js`));
  assertStringIncludes(body, "<p>This is a static page.</p>");
  assertStringIncludes(body, `src="/_frsh/static`);
  assert(!body.includes("__FRSH_ISLAND_PROPS"));
});

Deno.test("/books/:id page - /books/123", async () => {
  const resp = await router(new Request("https://fresh.deno.dev/books/123"));
  assert(resp);
  assertEquals(resp.status, 200);
  assertEquals(resp.headers.get("content-type"), "text/html; charset=utf-8");
  const body = await resp.text();
  assertStringIncludes(body, "<div>Book 123</div>");
});

Deno.test("/books/:id page - /books/abc", async () => {
  const resp = await router(new Request("https://fresh.deno.dev/books/abc"));
  assert(resp);
  assertEquals(resp.status, 404);
});

Deno.test("redirect /pages/fresh/ to /pages/fresh", async () => {
  const resp = await router(new Request("https://fresh.deno.dev/pages/fresh/"));
  assert(resp);
  assertEquals(resp.status, 307);
  assertEquals(
    resp.headers.get("location"),
    "https://fresh.deno.dev/pages/fresh",
  );
});

Deno.test("/failure", async () => {
  const resp = await router(new Request("https://fresh.deno.dev/failure"));
  assert(resp);
  assertEquals(resp.status, 500);
  const body = await resp.text();
  assert(body.includes("500 internal error: it errored!"));
});

Deno.test("/foo/:path*", async () => {
  const resp = await router(new Request("https://fresh.deno.dev/foo/bar/baz"));
  assert(resp);
  assertEquals(resp.status, 200);
  const body = await resp.text();
  assert(body.includes("bar/baz"));
});

Deno.test("static file - by file path", async () => {
  const resp = await router(new Request("https://fresh.deno.dev/foo.txt"));
  assertEquals(resp.status, 200);
  const body = await resp.text();
  assert(body.startsWith("bar"));
  assert(resp.headers.get("etag"));

  const resp2 = await router(
    new Request("https://fresh.deno.dev/foo.txt", {
      headers: {
        "if-none-match": resp.headers.get("etag")!,
      },
    }),
  );
  assertEquals(resp2.status, 304);
});

Deno.test("static file - by 'hashed' path", async () => {
  // Check that the file path have the BUILD_ID
  const resp = await router(new Request("https://fresh.deno.dev/"));
  const body = await resp.text();
  const imgFilePath = body.match(/img src="(.*?)"/)?.[1];
  assert(imgFilePath);
  assert(imgFilePath.includes(globalThis.__FRSH_BUILD_ID));

  // check the static file is served corectly under its cacheable route
  const resp2 = await router(
    new Request(`https://fresh.deno.dev${imgFilePath}`),
  );
  const _ = await resp2.text();
  assertEquals(resp2.status, 200);
  assertEquals(
    resp2.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );

  const resp3 = await router(
    new Request(`https://fresh.deno.dev${imgFilePath}`, {
      headers: {
        "if-none-match": resp2.headers.get("etag")!,
      },
    }),
  );
  assertEquals(resp3.status, 304);
});

Deno.test("/params/:path*", async () => {
  const resp = await router(
    new Request("https://fresh.deno.dev/params/bar/baz"),
  );
  assert(resp);
  assertEquals(resp.status, 200);
  const body = await resp.text();
  assertEquals(body, "bar/baz");
});

Deno.test("/connInfo", async () => {
  const resp = await router(new Request("https://fresh.deno.dev/connInfo"));
  assert(resp);
  assertEquals(resp.status, 200);
  const body = await resp.text();
  assertEquals(body, "127.0.0.1");
});

Deno.test({
  name: "/middleware - root",
  only: true,
  fn: async () => {
    const resp = await router(
      new Request("https://fresh.deno.dev/api/middleware_data"),
    );
    assert(resp);
    assertEquals(resp.status, 200);
    const body = await resp.text();
    assertStringIncludes(body, "root_mw");
    assert(!body.includes("layer1_mw"));
  },
});

Deno.test({
  name: "/middleware - layer 2 middleware",
  only: true,
  fn: async () => {
    const resp = await router(
      new Request("https://fresh.deno.dev/layeredMdw/layer2/abc"),
    );
    assert(resp);
    assertEquals(resp.status, 200);
    const body = await resp.text();
    assertStringIncludes(body, "root_mw");
    assertStringIncludes(body, "layer1_mw");
    assertStringIncludes(body, "layer2_mw");
    // layered 2 should not run layer 3 middleware
    assert(!body.includes("layer3_mw"));

    const resp1 = await router(
      new Request("https://fresh.deno.dev/layeredMdw/layer2-no-mw/without_mw"),
    );
    assert(resp1);
    assertEquals(resp1.status, 200);
    const body1 = await resp.text();
    assertStringIncludes(body1, "root_mw");
    assertStringIncludes(body1, "layer1_mw");
    // layered 2 should not run layer 2 or 3 middleware
    assert(!body1.includes("layer2_mw"));
    assert(!body1.includes("layer3_mw"));
  },
});

Deno.test({
  name: "/middleware - layer 3 middleware ",
  only: true,
  fn: async () => {
    // layered 3 should contain layer 3 middleware data
    const resp = await router(
      new Request("https://fresh.deno.dev/layeredMdw/layer2/layer3/abc"),
    );
    assert(resp);
    assertEquals(resp.status, 200);
    const body = await resp.text();
    assertStringIncludes(body, "root_mw");
    assertStringIncludes(body, "layer1_mw");
    assertStringIncludes(body, "layer3_mw");
    // the response should be the 
    assertEquals(resp.headers.get("server"), "fresh test server");
    assertEquals(resp.headers.get("layer3"), "fresh test server layer3");
  },
});