"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecondGroundItemOptionPacketListener = void 0;
// import { ItemOnGroundManager } from '../../../game/entity/impl/grounditem/ItemOnGroundManager';
// import { Firemaking } from '../../../game/content/skill/skillable/impl/Firemaking';
// import { Location } from '../../../game/model/Location';
// import { LightableLog } from '../../../game/content/skill/skillable/impl/Firemaking'
class SecondGroundItemOptionPacketListener {
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        const y = packet.readLEShort();
        const itemId = packet.readShort();
        const x = packet.readLEShort();
        // const position = new Location(x, y, player.getLocation().getZ());
        if (!player || player.getHitpoints() <= 0) {
            return;
        }
        player.getSkillManager().stopSkillable();
        if (!player.getLastItemPickup().elapsed())
            return;
        if (player.busy())
            return;
        if (Math.abs(player.getLocation().getX() - x) > 25 ||
            Math.abs(player.getLocation().getY() - y) > 25) {
            player.getMovementQueue().reset();
            return;
        }
        // player.getMovementQueue().walkToGroundItem(position, () => {
        //     const item = ItemOnGroundManager.getGroundItem(player.getUsername(), itemId, position);
        //     if (item) {
        //         const log = LightableLog.getForItem(item.getItem().getId());
        //         if (log) {
        //             player.getSkillManager().startSkillable(new Firemaking(LightableLog.getForItem(0)));
        //         }
        //     }
        // });
    }
}
exports.SecondGroundItemOptionPacketListener = SecondGroundItemOptionPacketListener;
//# sourceMappingURL=SecondGroundItemOptionPacketListener.js.map