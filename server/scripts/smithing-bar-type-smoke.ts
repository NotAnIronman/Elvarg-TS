// Asserts the smithing bar-type varbit values we send match enum 1253 in the cache,
// which is what clientscript 430 uses to pick which product set interface 312 draws.
// Usage: TS_NODE_COMPILER_OPTIONS='{"target":"es2020"}' yarn ts-node ./scripts/smithing-bar-type-smoke.ts
import assert = require("assert");
import path = require("path");
import { CachePipeline } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import { CacheIndexDat2 } from "../src/main/typescript/elvarg/game/cache/codec/rs/cache/CacheIndex";
import { ConfigType } from "../src/main/typescript/elvarg/game/cache/codec/rs/cache/ConfigType";
import { IndexType } from "../src/main/typescript/elvarg/game/cache/codec/rs/cache/IndexType";
import { ByteBuffer } from "../src/main/typescript/elvarg/game/cache/codec/rs/io/ByteBuffer";

const SMITHING_BAR_TYPE_ENUM = 1253;

function decodeIntEnum(data: Int8Array): Map<number, number> {
    const buf = new ByteBuffer(data);
    const values = new Map<number, number>();
    for (;;) {
        const op = buf.readUnsignedByte();
        if (op === 0) return values;
        if (op === 1 || op === 2) buf.readUnsignedByte();
        else if (op === 3) buf.readString();
        else if (op === 4) buf.readInt();
        else if (op === 5) {
            let size = buf.readUnsignedShort();
            while (size-- > 0) { buf.readInt(); buf.readString(); }
        } else if (op === 6) {
            let size = buf.readUnsignedShort();
            while (size-- > 0) values.set(buf.readInt(), buf.readInt());
        } else throw new Error(`unknown enum opcode ${op}`);
    }
}

async function main() {
    await CachePipeline.initialize(path.resolve(__dirname, ".."));
    const enums = CacheIndexDat2.fromStore(IndexType.DAT2.configs, CachePipeline.getStore())
        .getArchive(ConfigType.DAT2.enums);
    const file = enums.getFile(SMITHING_BAR_TYPE_ENUM);
    assert(file, `enum ${SMITHING_BAR_TYPE_ENUM} missing from cache`);
    const barByVarbitValue = decodeIntEnum(new Int8Array(file.data));

    // ItemIdentifiers/WeaponProfile first: the plugin's require chain has a cycle that only
    // resolves when ItemIdentifiers is already loaded (the server boot order does this for us).
    require("../src/main/typescript/elvarg/util/ItemIdentifiers");
    require("../src/main/typescript/elvarg/game/content/combat/WeaponProfile");
    const { SMITHING_BAR_TYPE_BY_ITEM_ID } = require("../plugins/skills/Smithing.plugin.js");
    for (const [barId, varbitValue] of SMITHING_BAR_TYPE_BY_ITEM_ID as Map<number, number>) {
        assert.equal(
            barByVarbitValue.get(varbitValue),
            barId,
            `varbit 3216 = ${varbitValue} draws bar ${barByVarbitValue.get(varbitValue)}, not ${barId}`,
        );
    }
    console.log(`ok: ${SMITHING_BAR_TYPE_BY_ITEM_ID.size} bar types match enum ${SMITHING_BAR_TYPE_ENUM}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
