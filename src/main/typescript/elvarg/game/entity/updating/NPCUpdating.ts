
import { World } from '../../../game/World';
import { NPC } from '../../entity/impl/npc/NPC';
import { Player } from '../../entity/impl/player/Player';
import { Flag } from '../../model/Flag';
import { Location } from '../../model/Location';
import { PacketBuilder, AccessType, ValueType } from '../../../net/packet/PacketBuilder';
import { PacketType } from '../../../net/packet/PacketType';
import { ByteOrder } from '../../../net/packet/ByteOrder';
import { GameConstants } from '../../GameConstants';
/**
 * Represents a player's npc updating task, which loops through all local
 * npcs and updates their masks according to their current attributes.
 *
 * @author Relex lawl
 */

/**
 * Handles the actual npc updating for the associated player.
 *
 * @return The NPCUpdating instance.
 */

export class NPCUpdating {
    // 317 NPC local count is encoded on 8 bits (0-255). Using 79 can starve nearby
    // spawns in crowded areas and make newly spawned NPCs (e.g. pets) appear invisible.
    private static readonly MAX_LOCAL_NPCS = 255;

    public static update(player: Player, nearbyNpcs: NPC[] = []): void {
        let update = new PacketBuilder();
        let packet = new PacketBuilder(65, PacketType.VARIABLE_SHORT);
        packet.initializeAccess(AccessType.BIT);
        const localNpcs = player.getLocalNpcs();
        const localNpcIndexes = new Set<number>();
        for (const npc of localNpcs) {
            if (npc) {
                localNpcIndexes.add(npc.getIndex());
            }
        }
        packet.putBits(8, localNpcs.length);

        // Keep iteration order stable to mirror the client-side local NPC list.
        // Remove stale NPC references in-place (Java iterator.remove equivalent).
        for (let index = 0; index < localNpcs.length;) {
            const npc = localNpcs[index];
            const worldNpcAtIndex = World.getNpcs().get(npc.getIndex());
            if (worldNpcAtIndex != null
                && npc.isRegistered()
                && npc.isVisible()
                && player.getLocation().isViewableFrom(npc.getLocation())
                && !npc.isNeedsPlacement()
                && npc.getPrivateArea() == player.getPrivateArea()) {
                NPCUpdating.updateMovement(npc, packet);
                if (npc.getUpdateFlag().isUpdateRequired()) {
                    NPCUpdating.appendUpdates(npc, update);
                }
                index++;
            } else {
                localNpcIndexes.delete(npc.getIndex());
                localNpcs.splice(index, 1);
                packet.putBits(1, 1);
                packet.putBits(2, 3);
            }
        }

        // Keep the owner's active pet in their local NPC list even when normal
        // candidate scans are noisy. This prevents "spawned but invisible" pets
        // when the pet is registered in-world but missed by the regular add pass.
        const currentPet = player.getCurrentPet?.() as NPC | null;
        if (
            currentPet != null
            && currentPet.isRegistered()
            && currentPet.isVisible()
        ) {
            if (currentPet.getPrivateArea() != player.getPrivateArea()) {
                currentPet.setArea(player.getArea());
            }
            if (
                !localNpcIndexes.has(currentPet.getIndex())
                && localNpcs.length < NPCUpdating.MAX_LOCAL_NPCS
                && currentPet.getLocation().isViewableFrom(player.getLocation())
            ) {
                localNpcs.push(currentPet);
                localNpcIndexes.add(currentPet.getIndex());
                NPCUpdating.addNPC(player, currentPet, packet);
                if (currentPet.getUpdateFlag().isUpdateRequired()) {
                    NPCUpdating.appendUpdates(currentPet, update);
                }
            }
        }

        // Keep add-to-local parity with Java: iterate the world NPC list directly.
        for (let npc of nearbyNpcs) {
            if (localNpcs.length >= NPCUpdating.MAX_LOCAL_NPCS) // Originally 255 in legacy.
                break;
            if (npc == null || localNpcIndexes.has(npc.getIndex()) || !npc.isVisible() || npc.isNeedsPlacement()
                || npc.getPrivateArea() != player.getPrivateArea())
                continue;

            if (npc.getLocation().isViewableFrom(player.getLocation())) {
                localNpcs.push(npc);
                localNpcIndexes.add(npc.getIndex());
                NPCUpdating.addNPC(player, npc, packet);
                if (npc.getUpdateFlag().isUpdateRequired()) {
                    NPCUpdating.appendUpdates(npc, update);
                }
            }
        }

        if (update.getBuffer().length > 0) {
            packet.putBits(14, 16383);
            packet.initializeAccess(AccessType.BYTE);
            packet.putBytes(update.getBuffer());
        } else {
            packet.initializeAccess(AccessType.BYTE);
        }

        player.getSession()?.write(packet);
    }


    /**
     * Adds an npc to the associated player's client.
     *
     * @param npc     The npc to add.
     * @param builder The packet builder to write information on.
     * @return The NPCUpdating instance.
     */

    private static addNPC(player: Player, npc: NPC, builder: PacketBuilder) {
        const face = npc.getFace() as any;
        const faceDirection = face?.getDirection ? face.getDirection() : face;
        const faceId = typeof faceDirection?.getId === "function" ? faceDirection.getId() : 0;

        builder.putBits(14, npc.getIndex());
        builder.putBits(5, npc.getLocation().getY() - player.getLocation().getY());
        builder.putBits(5, npc.getLocation().getX() - player.getLocation().getX());
        builder.putBits(1, 0);
        builder.putBits(3, faceId & 0x7);
        builder.putBits(GameConstants.NPC_BITS, npc.getId());
        builder.putBits(1, npc.getUpdateFlag().isUpdateRequired() ? 1 : 0);
    }


    /**
     * Updates the npc's movement queue.
     *
     * @param npc     The npc who's movement is updated.
     * @param builder The packet builder to write information on.
     * @return The NPCUpdating instance.
     */

    private static updateMovement(npc: NPC, out: PacketBuilder) {

        if (npc.getRunningDirection().getId() == -1) {
            if (npc.getWalkingDirection().getId() == -1) {
                if (npc.getUpdateFlag().isUpdateRequired()) {
                    out.putBits(1, 1);
                    out.putBits(2, 0);
                } else {
                    out.putBits(1, 0);
                }
            } else {
                out.putBits(1, 1);
                out.putBits(2, 1);
                out.putBits(3, npc.getWalkingDirection().getId());
                out.putBits(1, npc.getUpdateFlag().isUpdateRequired() ? 1 : 0);
            }
        } else {
            out.putBits(1, 1);
            out.putBits(2, 2);
            out.putBits(3, npc.getWalkingDirection().getId());
            out.putBits(3, npc.getRunningDirection().getId());
            out.putBits(1, npc.getUpdateFlag().isUpdateRequired() ? 1 : 0);
        }
    }

    /**
     * Appends a mask update for {@code npc}.
     *
     * @param npc     The npc to update masks for.
     * @param builder The packet builder to write information on.
     * @return The NPCUpdating instance.
     */

    private static appendUpdates(npc: NPC, block: PacketBuilder) {
        let mask = 0;
        let flag = npc.getUpdateFlag();

        if (flag.flagged(Flag.ANIMATION) && npc.getAnimation() != null) {
            mask |= 0x10;
        }
        if (flag.flagged(Flag.GRAPHIC) && npc.getGraphic() != null) {
            mask |= 0x80;
        }
        if (flag.flagged(Flag.SINGLE_HIT)) {
            mask |= 0x8;
        }
        if (flag.flagged(Flag.ENTITY_INTERACTION)) {
            mask |= 0x20;
        }
        if (flag.flagged(Flag.FORCED_CHAT) && npc.getForcedChat() != null) {
            mask |= 0x1;
        }
        if (flag.flagged(Flag.DOUBLE_HIT)) {
            mask |= 0x40;
        }
        // Keep mask and payload in lockstep: APPEARANCE may be flagged when
        // clearing a transformation (id -> -1). We must still set bit 0x2 or
        // the client decodes subsequent bytes as the wrong update fields.
        if (flag.flagged(Flag.APPEARANCE)) {
            mask |= 0x2;
        }
        if (flag.flagged(Flag.FACE_POSITION) && npc.getPositionToFace() != null) {
            mask |= 0x4;
        }
        block.put(mask);
        if (flag.flagged(Flag.ANIMATION) && npc.getAnimation() != null) {
            NPCUpdating.updateAnimation(block, npc);
        }
        if (flag.flagged(Flag.GRAPHIC) && npc.getGraphic() != null) {
            NPCUpdating.updateGraphics(block, npc);
        }
        if (flag.flagged(Flag.SINGLE_HIT)) {
            NPCUpdating.updateSingleHit(block, npc);
        }
        if (flag.flagged(Flag.ENTITY_INTERACTION)) {
            let entity = npc.getInteractingMobile();
            if (entity == null) {
                block.putShort(-1);
            } else {
                const entityIsPlayer =
                    typeof entity.isPlayer === "function"
                        ? entity.isPlayer()
                        : entity instanceof Player;
                block.putShort(entity.getIndex() + (entityIsPlayer ? 32768 : 0));
            }
        }
        if (flag.flagged(Flag.FORCED_CHAT) && npc.getForcedChat() != null) {
            block.putString(npc.getForcedChat());
        }
        if (flag.flagged(Flag.DOUBLE_HIT)) {
            NPCUpdating.updateDoubleHit(block, npc);
        }
        if ((mask & 0x2) !== 0) {

            let transform = npc.getNpcTransformationId() !== -1;

            block.put(npc.getHeadIcon());

            block.put(transform ? 1 : 0);

            if (transform) {
                block.putShort(npc.getNpcTransformationId(), ValueType.A, ByteOrder.LITTLE);
            }
        }
        if (flag.flagged(Flag.FACE_POSITION) && npc.getPositionToFace() != null) {
            const position: Location = npc.getPositionToFace();
            block.putShorts(position.getX() * 2 + 1, ByteOrder.LITTLE);
            block.putShorts(position.getY() * 2 + 1, ByteOrder.LITTLE);
        }
    }
    /**
     * Updates {@code npc}'s current animation and displays it for all local players.
     *
     * @param builder The packet builder to write information on.
     * @param npc     The npc to update animation for.
     * @return The NPCUpdating instance.
     */

    private static updateAnimation(builder: PacketBuilder, npc: NPC) {

        builder.putShorts(npc.getAnimation().getId(), ByteOrder.LITTLE);
        builder.put(npc.getAnimation().getDelay());
    }

    /**
     * Updates {@code npc}'s current graphics and displays it for all local players.
     *
     * @param builder The packet builder to write information on.
     * @param npc     The npc to update graphics for.
     * @return The NPCUpdating instance.
     */

    private static updateGraphics(builder: PacketBuilder, npc: NPC): void {
        builder.putShort(npc.getGraphic().getId());
        builder.putInt((npc.getGraphic().getHeight().valueOf() << 16) + (npc.getGraphic().getDelay() & 0xffff));
    }

    /**
     * Updates the npc's single hit.
     *
     * @param builder The packet builder to write information on.
     * @param npc     The npc to update the single hit for.
     * @return The NPCUpdating instance.
     */

    private static updateSingleHit(builder: PacketBuilder, npc: NPC): void {
        builder.putShort(npc.getPrimaryHit().getDamage());
        builder.put(npc.getPrimaryHit().getHitmask());
        builder.putShort(npc.getHitpoints());
        builder.putShort(npc.getDefinition().getHitpoints());
    }

    /**
     * Updates the npc's double hit.
     *
     * @param builder The packet builder to write information on.
     * @param npc     The npc to update the double hit for.
     * @return The NPCUpdating instance.
     */

    private static updateDoubleHit(builder: PacketBuilder, npc: NPC): void {
        builder.putShort(npc.getSecondaryHit().getDamage());
        builder.put(npc.getSecondaryHit().getHitmask());
        builder.putShort(npc.getHitpoints());
        builder.putShort(npc.getDefinition().getHitpoints());
    }
}
