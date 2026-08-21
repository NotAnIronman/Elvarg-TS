// Exercises the content API end to end: the ItemSpawner plugin registers its resources, a
// search is routed and answered from the active cache, and the interface definition is
// served with an ETag that a second request can revalidate against.
// Usage: TS_NODE_COMPILER_OPTIONS='{"target":"es2020"}' yarn ts-node ./scripts/content-api-smoke.ts
import { strict as assert } from "assert";
import path = require("path");
import { CachePipeline } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import { ContentApi } from "../src/main/typescript/elvarg/net/http/ContentApi";
import { CustomInterfaceRegistry } from "../src/main/typescript/elvarg/game/interfaces/CustomInterfaceRegistry";

const ItemSpawner = require("../plugins/interface/ItemSpawner.plugin");

async function main() {
    await CachePipeline.initialize(path.resolve(__dirname, ".."));

    const api = new Proxy<any>(
        {
            registerContentEndpoint: (name: string, handler: any) =>
                ContentApi.register(name, handler),
            registerCustomInterface: (definition: any) =>
                CustomInterfaceRegistry.register(definition),
        },
        { get: (target, property) => (target as any)[property] ?? (() => undefined) }
    );
    ItemSpawner.register(api);

    const notFound = ContentApi.resolve("GET", "/api/nope");
    assert.equal(notFound?.status, 404, "unknown resources must 404");
    assert.equal(ContentApi.resolve("GET", "/regions"), null, "non-api urls are not ours");

    const posted = ContentApi.resolve("POST", "/api/items?q=whip");
    assert.equal(posted?.status, 405, "these resources are read-only");
    assert.equal(posted?.headers.Allow, "GET, HEAD", "405 must say what is allowed");

    const response = ContentApi.resolve("GET", "/api/items?q=abyssal%20whip&limit=5");
    assert.equal(response?.status, 200, "the item resource must answer");
    const payload = JSON.parse(response!.body) as {
        total: number;
        rows: Array<{ id: number; name: string }>;
    };
    assert.ok(payload.total > 0, "expected matches for 'abyssal whip'");
    assert.ok(payload.rows.length <= 5, "limit must be honoured");
    assert.equal(payload.rows[0].name, "Abyssal whip", "best match ranks first");
    assert.ok(payload.rows[0].id > 0, "rows carry the item id the client renders");

    const empty = JSON.parse(ContentApi.resolve("GET", "/api/items?q=")!.body);
    assert.deepEqual(empty, { total: 0, rows: [] }, "an empty query matches nothing");

    // The interface definition is a resource, not something pushed on every open.
    const definition = ContentApi.resolve("GET", "/api/interfaces/30002");
    assert.equal(definition?.status, 200, "the interface definition must be addressable");
    const parsed = JSON.parse(definition!.body) as {
        groupId: number;
        widgets: unknown[];
        search: { endpoint: string };
        list: { slotCount: number };
    };
    assert.equal(parsed.groupId, 30002);
    assert.equal(parsed.widgets.length, 75, "the widget group travels with the definition");
    assert.equal(parsed.search.endpoint, "/api/items", "rows come from the item resource");
    assert.ok(parsed.list.slotCount > 0, "the client is told how many slots to bind");

    const etag = definition!.headers.ETag;
    assert.ok(etag, "definitions must carry an ETag so the browser can revalidate");
    const revalidated = ContentApi.resolve("GET", "/api/interfaces/30002", etag);
    assert.equal(revalidated?.status, 304, "an unchanged definition revalidates to 304");
    assert.equal(revalidated?.body, "", "304 carries no body");

    const missing = ContentApi.resolve("GET", "/api/interfaces/999999");
    assert.equal(missing?.status, 404, "an unknown interface is a 404");

    console.log(
        `content api ok: /api/items -> '${payload.rows[0].name}' (${payload.rows[0].id}) of ` +
            `${payload.total}; /api/interfaces/30002 -> ${parsed.widgets.length} widgets, ` +
            `${definition!.body.length} bytes, revalidates 304`
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
