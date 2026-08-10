import { CacheIndexDat2 } from "./codec/rs/cache/CacheIndex";
import type { CacheInfo } from "./codec/rs/cache/CacheInfo";
import { ConfigType } from "./codec/rs/cache/ConfigType";
import { IndexType } from "./codec/rs/cache/IndexType";
import { ArchiveLocTypeLoader } from "./codec/rs/config/loctype/LocTypeLoader";
import type { LocType } from "./codec/rs/config/loctype/LocType";
import { ArchiveNpcTypeLoader } from "./codec/rs/config/npctype/NpcTypeLoader";
import type { NpcType } from "./codec/rs/config/npctype/NpcType";
import {
    ArchiveObjTypeLoader,
    PostProcessedObjTypeLoader,
} from "./codec/rs/config/objtype/ObjTypeLoader";
import type { ObjType } from "./codec/rs/config/objtype/ObjType";
import { CachePipeline } from "./CachePipeline";

export class CacheDefinitions {
    private static readonly SPELL_WIDGET_PARAM_ID = 596;
    private static readonly SPELL_NAME_PARAM_ID = 601;
    private static spellNamesByWidget?: Map<number, string>;
    private static state?: {
        npcs: ArchiveNpcTypeLoader;
        items: PostProcessedObjTypeLoader;
        objects: ArchiveLocTypeLoader;
    };

    private static getState() {
        if (this.state) return this.state;

        const active = CachePipeline.getActive();
        const info: CacheInfo = {
            name: active.name,
            game: "oldschool",
            environment: "live",
            revision: active.revision,
            timestamp: active.timestamp,
            size: 0,
        };
        const store = CachePipeline.getStore();
        const configs = CacheIndexDat2.fromStore(IndexType.DAT2.configs, store);
        this.state = {
            npcs: new ArchiveNpcTypeLoader(info, configs.getArchive(ConfigType.DAT2.npcs)),
            items: new PostProcessedObjTypeLoader(
                new ArchiveObjTypeLoader(info, configs.getArchive(ConfigType.DAT2.objs)),
            ),
            objects: new ArchiveLocTypeLoader(info, configs.getArchive(ConfigType.DAT2.locs)),
        };
        console.info(
            `[cache] definitions npc=${this.state.npcs.getCount()} item=${this.state.items.getCount()} object=${this.state.objects.getCount()}`,
        );
        return this.state;
    }

    static getNpc(id: number): NpcType {
        return this.getState().npcs.load(id);
    }

    static getItem(id: number): ObjType {
        return this.getState().items.load(id);
    }

    static getObject(id: number): LocType {
        return this.getState().objects.load(id);
    }

    static getCounts(): { npcs: number; items: number; objects: number } {
        const state = this.getState();
        return {
            npcs: state.npcs.getCount(),
            items: state.items.getCount(),
            objects: state.objects.getCount(),
        };
    }

    static getSpellName(widgetId: number, itemId: number): string | undefined {
        if (itemId > 0 && itemId < this.getState().items.getCount()) {
            const name = this.getItem(itemId).params?.get(this.SPELL_NAME_PARAM_ID);
            if (typeof name === "string") return name;
        }
        if (!this.spellNamesByWidget) {
            this.spellNamesByWidget = new Map();
            for (let id = 0; id < this.getState().items.getCount(); id++) {
                const params = this.getItem(id).params;
                const widget = params?.get(this.SPELL_WIDGET_PARAM_ID);
                const name = params?.get(this.SPELL_NAME_PARAM_ID);
                if (typeof widget === "number" && typeof name === "string") {
                    this.spellNamesByWidget.set(widget, name);
                }
            }
        }
        return this.spellNamesByWidget.get(widgetId);
    }
}
