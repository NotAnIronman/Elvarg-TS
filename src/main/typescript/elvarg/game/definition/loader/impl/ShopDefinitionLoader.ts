import { DefinitionLoader } from '../DefinitionLoader';
import { ShopDefinition } from '../../ShopDefinition';
import { GameConstants } from '../../../GameConstants';
import { ShopManager } from "../../../model/container/shop/ShopManager"
import { Shop } from "../../../model/container/shop/Shop"
import { Item } from "../../../model/Item";
import { ShopCurrencies } from "../../../model/container/shop/currency/ShopCurrencies";
import * as fs from "fs";


export class ShopDefinitionLoader extends DefinitionLoader {
    load() {
        const content = fs.readFileSync(this.file(), "utf8");
        const defs: Array<{ id: number; name: string; originalStock: Array<{ id: number; amount: number }> }> = JSON.parse(content);
        for (const def of defs) {
            const stock = (def.originalStock ?? []).map(s => new Item(s.id, s.amount));
            ShopManager.shops.set(def.id, new Shop(def.id, def.name, stock, ShopCurrencies.COINS));
        }

    }
    file(): string {
        return GameConstants.DEFINITIONS_DIRECTORY + "shops.json";
    }
}
