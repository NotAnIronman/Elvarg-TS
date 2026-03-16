import {World} from '../../World'
import {ItemDefinition} from '../../definition/ItemDefinition'
import {Player} from '../impl/player/Player'
import {Equipment} from '../../model/container/impl/Equipment'
import { PacketType } from '../../../net/packet/PacketType'
import { PacketBuilder, AccessType, ValueType } from '../../../net/packet/PacketBuilder'
import { EquipmentType } from '../../model/EquipmentType'
import { Appearance } from '../../model/Appearance'
import { Flag } from '../../model/Flag'
import { ByteOrder } from '../../../net/packet/ByteOrder'
import { Skill } from '../../model/Skill'
import { Misc } from '../../../util/Misc'
import { DonatorRights } from '../../model/rights/DonatorRights'
import * as fs from "fs";
import * as path from "path";

export class PlayerUpdating {
    private static MAX_NEW_PLAYERS_PER_CYCLE = 25;
    private static readonly GLOW_PRESET_ATTRIBUTE = "visual:glowPreset";
    private static readonly GLOW_INTENSITY_ATTRIBUTE = "visual:glowIntensity";
    // Player local count is encoded on 8 bits. Keeping this at 79 starves nearby
    // interactable players in bot-heavy scenes even though the client can track more.
    private static readonly MAX_LOCAL_PLAYERS = 255;
    private static readonly CANDIDATE_COMPARE_ENABLED =
        (process.env.PLAYER_UPDATE_BUCKET_COMPARE ?? "0") === "1";
    private static readonly CANDIDATE_COMPARE_LOG_COOLDOWN_MS = 3000;
    private static readonly DEBUG_ENABLED =
        (process.env.PLAYER_UPDATE_DEBUG ?? "0") === "1";
    private static readonly DEBUG_RECEIVER_FILTER = (
        process.env.PLAYER_UPDATE_DEBUG_RECEIVER ?? "happysham31"
    )
        .trim()
        .toLowerCase();
    private static readonly DEBUG_TARGET_FILTER = (
        process.env.PLAYER_UPDATE_DEBUG_TARGET ?? "playerbot1"
    )
        .trim()
        .toLowerCase();
    private static readonly DEBUG_LOG_DIR = path.join(process.cwd(), "logs");
    private static readonly DEBUG_LOG_FILE = path.join(
        PlayerUpdating.DEBUG_LOG_DIR,
        "player-update-bits.log"
    );
    private static debugReady = false;
    private static updateSequence = 0;
    private static lastCandidateCompareLogAt = 0;

    private static nextUpdateId(): number {
        PlayerUpdating.updateSequence += 1;
        return PlayerUpdating.updateSequence;
    }

    private static playerName(player: Player | null | undefined): string {
        if (!player) {
            return "unknown";
        }
        return player.getUsername?.() ?? `index:${player.getIndex?.() ?? "?"}`;
    }

    private static locationOf(player: Player | null | undefined): {
        x: number;
        y: number;
        z: number;
    } | null {
        if (!player) {
            return null;
        }
        const loc = player.getLocation?.();
        if (!loc) {
            return null;
        }
        return { x: loc.getX(), y: loc.getY(), z: loc.getZ() };
    }

    private static shouldDebugReceiver(receiver: Player): boolean {
        if (!PlayerUpdating.DEBUG_ENABLED) {
            return false;
        }
        if (!PlayerUpdating.DEBUG_RECEIVER_FILTER) {
            return false;
        }
        if (!PlayerUpdating.DEBUG_RECEIVER_FILTER) {
            return true;
        }
        const receiverName = PlayerUpdating.playerName(receiver).toLowerCase();
        return receiverName.includes(PlayerUpdating.DEBUG_RECEIVER_FILTER);
    }

    private static shouldDebugPair(receiver: Player, target: Player): boolean {
        if (!PlayerUpdating.DEBUG_ENABLED) {
            return false;
        }
        if (receiver === target) {
            return false;
        }
        if (PlayerUpdating.DEBUG_RECEIVER_FILTER) {
            const receiverName = PlayerUpdating.playerName(receiver).toLowerCase();
            if (!receiverName.includes(PlayerUpdating.DEBUG_RECEIVER_FILTER)) {
                return false;
            }
        }
        if (!PlayerUpdating.DEBUG_TARGET_FILTER) {
            return true;
        }
        const targetName = PlayerUpdating.playerName(target).toLowerCase();
        return targetName.includes(PlayerUpdating.DEBUG_TARGET_FILTER);
    }

    private static encodeByteS(value: number): number {
        return (128 - value) & 0xff;
    }

    private static encodeShortLittleA(value: number): number[] {
        return [((value + 128) & 0xff), ((value >> 8) & 0xff)];
    }

    private static encodeShortBigA(value: number): number[] {
        return [((value >> 8) & 0xff), ((value + 128) & 0xff)];
    }

    private static debugLog(
        kind: string,
        payload: Record<string, unknown>
    ): void {
        if (!PlayerUpdating.DEBUG_ENABLED) {
            return;
        }
        try {
            if (!PlayerUpdating.debugReady) {
                fs.mkdirSync(PlayerUpdating.DEBUG_LOG_DIR, { recursive: true });
                PlayerUpdating.debugReady = true;
            }
            const line = `${new Date().toISOString()} [player_update_debug] ${kind} ${JSON.stringify(
                payload
            )}\n`;
            fs.appendFileSync(PlayerUpdating.DEBUG_LOG_FILE, line, {
                encoding: "utf8",
            });
        } catch (err) {
            console.warn("[PlayerUpdating] failed to write debug log", err);
        }
    }

    private static isEligibleAddCandidate(receiver: Player, candidate: Player): boolean {
        if (!candidate || candidate === receiver) {
            return false;
        }
        if (
            !candidate.getLocation().isViewableFrom(receiver.getLocation()) ||
            candidate.getPrivateArea() !== receiver.getPrivateArea()
        ) {
            return false;
        }
        return true;
    }

    private static compareBucketCandidates(
        player: Player,
        localPlayers: Player[],
        visibleCandidates: Player[]
    ): void {
        if (
            !PlayerUpdating.CANDIDATE_COMPARE_ENABLED ||
            player?.isPlayerBot?.() === true
        ) {
            return;
        }

        const bucketCandidates = World.getBucketNearbyPlayersForUpdate(player);
        const localIndexes = new Set<number>();
        for (const localPlayer of localPlayers) {
            if (localPlayer) {
                localIndexes.add(localPlayer.getIndex());
            }
        }

        const legacyIndexes = new Set<number>();
        for (const candidate of visibleCandidates) {
            legacyIndexes.add(candidate.getIndex());
        }

        const bucketIndexes = new Set<number>();
        const extras: number[] = [];
        let simulatedLocalCount = localPlayers.length;
        let simulatedPlayersAdded = 0;
        for (const candidate of bucketCandidates) {
            if (
                simulatedLocalCount >= PlayerUpdating.MAX_LOCAL_PLAYERS ||
                simulatedPlayersAdded > PlayerUpdating.MAX_NEW_PLAYERS_PER_CYCLE
            ) {
                break;
            }
            if (
                !this.isEligibleAddCandidate(player, candidate) ||
                localIndexes.has(candidate.getIndex())
            ) {
                continue;
            }
            const index = candidate.getIndex();
            bucketIndexes.add(index);
            localIndexes.add(index);
            simulatedLocalCount += 1;
            simulatedPlayersAdded += 1;
            if (!legacyIndexes.has(index)) {
                extras.push(index);
            }
        }

        const missing: number[] = [];
        for (const candidate of visibleCandidates) {
            const index = candidate.getIndex();
            if (!bucketIndexes.has(index)) {
                missing.push(index);
            }
        }

        if (missing.length === 0 && extras.length === 0) {
            return;
        }

        const nowMs = Date.now();
        if (
            nowMs - PlayerUpdating.lastCandidateCompareLogAt <
            PlayerUpdating.CANDIDATE_COMPARE_LOG_COOLDOWN_MS
        ) {
            return;
        }
        PlayerUpdating.lastCandidateCompareLogAt = nowMs;
        console.warn("[player_update] bucket_candidate_mismatch", {
            receiver: this.playerName(player),
            receiverIndex: player.getIndex(),
            localCount: localPlayers.length,
            legacyVisibleCount: visibleCandidates.length,
            bucketVisibleCount: bucketIndexes.size,
            missing: missing.slice(0, 10),
            extras: extras.slice(0, 10),
        });
    }

    public static update(player: Player) {
        if (!player || player.isPlayerBot?.() === true) {
            return;
        }
        const updateId = this.nextUpdateId();
        const update = new PacketBuilder();
        const packet = new PacketBuilder(81, PacketType.VARIABLE_SHORT);
        packet.initializeAccess(AccessType.BIT);
        this.updateMovement(player, packet, updateId);
        this.appendUpdates(player, update, player, false, true, updateId);
        const localPlayers = player.getLocalPlayers();
        packet.putBits(8, localPlayers.length);
        const retainedLocalPlayers: Player[] = [];
        for (const localPlayer of localPlayers) {
            if (World.getPlayers().get(localPlayer.getIndex()) != null
                && localPlayer.getLocation().isViewableFrom(player.getLocation())
                && !localPlayer.isNeedsPlacement()
                && localPlayer.getPrivateArea() === player.getPrivateArea()) {
                this.updateOtherPlayerMovement(player, packet, localPlayer, updateId);
                if (localPlayer.getUpdateFlag().isUpdateRequired()) {
                    this.appendUpdates(player, update, localPlayer, false, false, updateId);
                }
                retainedLocalPlayers.push(localPlayer);
            } else {
                // Player left local-view; remove from local list only (do not global-logout).
                packet.putBits(1, 1);
                packet.putBits(2, 3);
            }
        }
        localPlayers.length = 0;
        localPlayers.push(...retainedLocalPlayers);
        const localPlayerIndexes = new Set<number>();
        for (const localPlayer of localPlayers) {
            if (localPlayer) {
                localPlayerIndexes.add(localPlayer.getIndex());
            }
        }
        let playersAdded = 0;
        const visibleCandidates: Player[] = [];

        // TODO: Finish player bucket semantics before reintroducing them to live updates.
        // Local-player correctness is more important than the small cost of the legacy scan.
        const tryAddCandidate = (otherPlayer: Player | null | undefined, recordCompare: boolean) => {
            if (
                player.getLocalPlayers().length >= PlayerUpdating.MAX_LOCAL_PLAYERS ||
                playersAdded > PlayerUpdating.MAX_NEW_PLAYERS_PER_CYCLE
            ) {
                return true;
            }
            if (otherPlayer == null || otherPlayer == player || localPlayerIndexes.has(otherPlayer.getIndex())
                || !otherPlayer.getLocation().isViewableFrom(player.getLocation())
                || otherPlayer.getPrivateArea() !== player.getPrivateArea()) {
                return false;
            }
            if (recordCompare && PlayerUpdating.CANDIDATE_COMPARE_ENABLED) {
                visibleCandidates.push(otherPlayer);
            }
            player.getLocalPlayers().push(otherPlayer);
            localPlayerIndexes.add(otherPlayer.getIndex());
            this.addPlayer(player, otherPlayer, packet);
            this.appendUpdates(player, update, otherPlayer, true, false, updateId);
            playersAdded++;
            return false;
        };

        for (const otherPlayer of World.getPlayers()) {
            if (tryAddCandidate(otherPlayer, true)) {
                break;
            }
        }
        if (PlayerUpdating.CANDIDATE_COMPARE_ENABLED) {
            this.compareBucketCandidates(player, localPlayers, visibleCandidates);
        }

        const updateBuffer = update.getBuffer();
        if (updateBuffer.length > 0) {
            packet.putBits(11, 2047);
            packet.initializeAccess(AccessType.BYTE);
            packet.putBytes(updateBuffer);
        } else {
            packet.initializeAccess(AccessType.BYTE);
        }
        if (this.shouldDebugReceiver(player)) {
            const packetBuffer = packet.getBuffer();
            this.debugLog("packet81", {
                updateId,
                receiver: this.playerName(player),
                receiverLocation: this.locationOf(player),
                localPlayers: localPlayers.length,
                updateBlockBytes: updateBuffer.length,
                packetBytes: packetBuffer.length,
                packetPreviewHex: packetBuffer
                    .subarray(0, Math.min(packetBuffer.length, 64))
                    .toString("hex"),
            });
        }
        player.getSession().write(packet);
    }
    private static addPlayer(player: Player, target: Player, builder: PacketBuilder) {
        builder.putBits(11, target.getIndex());
        builder.putBits(1, 1);
        builder.putBits(1, 1);
        let yDiff = target.getLocation().getY() - player.getLocation().getY();
        let xDiff = target.getLocation().getX() - player.getLocation().getX();
        builder.putBits(5, yDiff);
        builder.putBits(5, xDiff);
    }
    private static updateMovement(player: Player, builder: PacketBuilder, updateId: number) {
        if (player.isNeedsPlacement()) {
            // IMPORTANT: do not clear placement/reset flags inside this method.
            // This packet writes the local player first, then encodes other local players
            // in the same cycle. Clearing early can make observers miss placement for the
            // same tick and keep a stale position after forced movement (ditch regression).
            builder.putBits(1, 1);
            builder.putBits(2, 3);
            builder.putBits(2, player.getLocation().getZ());
            builder.putBits(1, player.isResetMovementQueue() ? 1 : 0);
            builder.putBits(1, player.getUpdateFlag().isUpdateRequired() ? 1 : 0);
            builder.putBits(7, player.getLocation().getLocalY(player.getLastKnownRegion()));
            builder.putBits(7, player.getLocation().getLocalX(player.getLastKnownRegion()));
            if (this.shouldDebugReceiver(player)) {
                this.debugLog("self_movement", {
                    updateId,
                    receiver: this.playerName(player),
                    movementType: "placement",
                    updateRequired: player.getUpdateFlag().isUpdateRequired(),
                    location: this.locationOf(player),
                });
            }
        } else if (player.getWalkingDirection().getId() == -1) {
            if (player.getUpdateFlag().isUpdateRequired()) {
                builder.putBits(1, 1);
                builder.putBits(2, 0);
                if (this.shouldDebugReceiver(player)) {
                    this.debugLog("self_movement", {
                        updateId,
                        receiver: this.playerName(player),
                        movementType: "none_with_update",
                        location: this.locationOf(player),
                    });
                }
            } else {
                builder.putBits(1, 0);
                if (this.shouldDebugReceiver(player)) {
                    this.debugLog("self_movement", {
                        updateId,
                        receiver: this.playerName(player),
                        movementType: "none_no_update",
                        location: this.locationOf(player),
                    });
                }
            }
        } else if (player.getRunningDirection().getId() == -1) {
            builder.putBits(1, 1);
            builder.putBits(2, 1);
            builder.putBits(3, player.getWalkingDirection().getId());
            builder.putBits(1, player.getUpdateFlag().isUpdateRequired() ? 1 : 0);
            if (this.shouldDebugReceiver(player)) {
                this.debugLog("self_movement", {
                    updateId,
                    receiver: this.playerName(player),
                    movementType: "walk",
                    walkDirection: player.getWalkingDirection().getId(),
                    updateRequired: player.getUpdateFlag().isUpdateRequired(),
                    location: this.locationOf(player),
                });
            }
        } else {
            builder.putBits(1, 1);
            builder.putBits(2, 2);
            builder.putBits(3, player.getWalkingDirection().getId());
            builder.putBits(3, player.getRunningDirection().getId());
            builder.putBits(1, player.getUpdateFlag().isUpdateRequired() ? 1 : 0);
            if (this.shouldDebugReceiver(player)) {
                this.debugLog("self_movement", {
                    updateId,
                    receiver: this.playerName(player),
                    movementType: "run",
                    walkDirection: player.getWalkingDirection().getId(),
                    runDirection: player.getRunningDirection().getId(),
                    updateRequired: player.getUpdateFlag().isUpdateRequired(),
                    location: this.locationOf(player),
                });
            }
        }
    }
    private static updateOtherPlayerMovement(
        receiver: Player,
        builder: PacketBuilder,
        target: Player,
        updateId: number
    ) {
        // TODO: Teleport
        /*if (target.isNeedsPlacement()) {
            builder.putBits(1, target.getUpdateFlag().isUpdateRequired() ? 1 : 0);
            builder.putBits(2, 3); // Teleport
            builder.putBits(7, target.getPosition().getLocalY(target.getLastKnownRegion()));
            builder.putBits(7, target.getPosition().getLocalX(target.getLastKnownRegion()));
            return;
        }*/
        if (this.shouldDebugPair(receiver, target) && target.isNeedsPlacement()) {
            this.debugLog("other_movement", {
                updateId,
                receiver: this.playerName(receiver),
                target: this.playerName(target),
                movementType: "placement_not_serialized",
                targetNeedsPlacement: target.isNeedsPlacement(),
                targetResetMovementQueue: target.isResetMovementQueue(),
                targetUpdateRequired: target.getUpdateFlag().isUpdateRequired(),
                targetLocation: this.locationOf(target),
                targetLastKnownRegion: target.getLastKnownRegion()
                    ? {
                          x: target.getLastKnownRegion().getX(),
                          y: target.getLastKnownRegion().getY(),
                          z: target.getLastKnownRegion().getZ(),
                      }
                    : null,
            });
        }

        /*
         * Check which type of movement took place.
         */
        if (target.getWalkingDirection().getId() == -1) {
            /*
             * If no movement did, check if an update is required.
             */
            if (target.getUpdateFlag().isUpdateRequired()) {
                /*
                 * Signify that an update happened.
                 */
                builder.putBits(1, 1);

                /*
                 * Signify that there was no movement.
                 */
                builder.putBits(2, 0);
                if (this.shouldDebugPair(receiver, target)) {
                    this.debugLog("other_movement", {
                        updateId,
                        receiver: this.playerName(receiver),
                        target: this.playerName(target),
                        movementType: "none_with_update",
                        targetForceMovement: target.getForceMovement() != null,
                        targetLocation: this.locationOf(target),
                    });
                }
            } else {
                /*
                 * Signify that nothing changed.
                 */
                builder.putBits(1, 0);
                if (this.shouldDebugPair(receiver, target)) {
                    this.debugLog("other_movement", {
                        updateId,
                        receiver: this.playerName(receiver),
                        target: this.playerName(target),
                        movementType: "none_no_update",
                        targetForceMovement: target.getForceMovement() != null,
                        targetLocation: this.locationOf(target),
                    });
                }
            }
        } else if (target.getRunningDirection().getId() == -1) {
            /*
             * The player moved but didn't run. Signify that an update is required.
             */
            builder.putBits(1, 1);

            /*
             * Signify we moved one tile.
             */
            builder.putBits(2, 1);

            /*
             * Write the primary sprite (i.e. walk direction).
             */
            builder.putBits(3, target.getWalkingDirection().getId());

            /*
             * Write a flag indicating if a block update happened.
             */
            builder.putBits(1, target.getUpdateFlag().isUpdateRequired() ? 1 : 0);
            if (this.shouldDebugPair(receiver, target)) {
                this.debugLog("other_movement", {
                    updateId,
                    receiver: this.playerName(receiver),
                    target: this.playerName(target),
                    movementType: "walk",
                    walkDirection: target.getWalkingDirection().getId(),
                    targetUpdateRequired: target.getUpdateFlag().isUpdateRequired(),
                    targetForceMovement: target.getForceMovement() != null,
                    targetLocation: this.locationOf(target),
                });
            }
        } else {
            /*
             * The player ran. Signify that an update happened.
             */
            builder.putBits(1, 1);

            /*
             * Signify that we moved two tiles.
             */
            builder.putBits(2, 2);

            // Write the primary sprite (i.e. walk direction).
            builder.putBits(3, target.walkingDirection.id);

            // Write the secondary sprite (i.e. run direction).
            builder.putBits(3, target.runningDirection.id);

            // Write a flag indicating if a block update happened.
            builder.putBits(1, target.updateFlag.isUpdateRequired() ? 1 : 0);
            if (this.shouldDebugPair(receiver, target)) {
                this.debugLog("other_movement", {
                    updateId,
                    receiver: this.playerName(receiver),
                    target: this.playerName(target),
                    movementType: "run",
                    walkDirection: target.walkingDirection.id,
                    runDirection: target.runningDirection.id,
                    targetUpdateRequired: target.updateFlag.isUpdateRequired(),
                    targetForceMovement: target.getForceMovement() != null,
                    targetLocation: this.locationOf(target),
                });
            }
        }
    }
    private static appendUpdates(
        player: Player,
        builder: PacketBuilder,
        target: Player,
        updateAppearance: boolean,
        noChat: boolean,
        updateId: number
    ) {
        if (!target.updateFlag.isUpdateRequired() && !updateAppearance) {
            return;
        }
        // If we don't need to update again, simply send the cached update block
        // if it's available.
        /*
        if (player.cachedUpdateBlock != null && !player.equals(target) && !updateAppearance && !noChat) {
            builder.putBytes(player.cachedUpdateBlock);
            return;
        }
        */
        const flag = target.updateFlag;
        let mask = 0;
        if (flag.flagged(Flag.GRAPHIC) && target.graphic != null) {
            mask |= 0x100;
        }
        if (flag.flagged(Flag.ANIMATION) && target.animation != null) {
            mask |= 0x8;
        }
        if (flag.flagged(Flag.FORCED_CHAT) && target.forcedChat != null) {
            mask |= 0x4;
        }
        if (flag.flagged(Flag.CHAT) && target.currentChatMessage != null && !noChat && !player.relations.hasIgnore(target.longUsername)) {
            mask |= 0x80;
        }
        if (flag.flagged(Flag.ENTITY_INTERACTION)) {
            mask |= 0x1;
        }
        if (flag.flagged(Flag.APPEARANCE) || updateAppearance) {
            mask |= 0x10;
        }
        if (flag.flagged(Flag.FACE_POSITION) && target.positionToFace != null) {
            mask |= 0x2;
        }
        if (flag.flagged(Flag.SINGLE_HIT)) {
            mask |= 0x20;
        }
        if (flag.flagged(Flag.DOUBLE_HIT)) {
            mask |= 0x200;
        }
        if (flag.flagged(Flag.FORCED_MOVEMENT) && target.forceMovement != null) {
            mask |= 0x400;
        }
        if (mask >= 0x100) {
            mask |= 0x40;
            builder.putShorts(mask, ByteOrder.LITTLE);
        } else {
            builder.put(mask);
        }
        if (this.shouldDebugPair(player, target)) {
            this.debugLog("append_mask", {
                updateId,
                receiver: this.playerName(player),
                target: this.playerName(target),
                mask,
                targetUpdateRequired: target.updateFlag.isUpdateRequired(),
                targetForceMovement: target.forceMovement != null,
            });
        }
        if (flag.flagged(Flag.FORCED_MOVEMENT) && target.forceMovement != null) {
            this.updateForcedMovement(player, builder, target, updateId);
        }
        if (flag.flagged(Flag.GRAPHIC) && target.graphic != null) {
            this.updateGraphics(builder, target);
        }
        if (flag.flagged(Flag.ANIMATION) && target.animation != null) {
            this.updateAnimation(builder, target);
        }
        if (flag.flagged(Flag.FORCED_CHAT) && target.forcedChat != null) {
            this.updateForcedChat(builder, target);
        } if (flag.flagged(Flag.CHAT) && target.currentChatMessage != null && !noChat && !player.relations.hasIgnore(target.longUsername)) {
            this.updateChat(builder, target, player);
        }
        if (flag.flagged(Flag.ENTITY_INTERACTION)) {
            this.updateEntityInteraction(builder, target);
        }
        if (flag.flagged(Flag.APPEARANCE) || updateAppearance) {
            this.updateAppearance(player, builder, target);
        }
        if (flag.flagged(Flag.FACE_POSITION) && target.positionToFace != null) {
            this.updateFacingPosition(builder, target);
        }
        if (flag.flagged(Flag.SINGLE_HIT)) {
            this.updateSingleHit(builder, target);
        }
        if (flag.flagged(Flag.DOUBLE_HIT)) {
            this.updateDoubleHit(builder, target);
        }
        /*if (!player.equals(target) && !updateAppearance && !noChat) {
        player.cachedUpdateBlock = builder.buffer();
        }*/
    }
    private static updateChat(builder: PacketBuilder, target: Player, receiver: Player) {
        const message = target.currentChatMessage;
        const bytes = message.text;
        builder.putShorts(((message.colour & 0xff) << 8) | (message.effects & 0xff), ByteOrder.LITTLE);
        builder.put(target.getRights().getId());
        builder.put(DonatorRights.getId(target.getDonatorRights()));
        builder.puts(bytes.length, ValueType.C);
        for (let ptr = bytes.length - 1; ptr >= 0; ptr--) {
            builder.put(bytes[ptr]);
        }
    }
    private static updateForcedChat(builder: PacketBuilder, target: Player) {
        builder.putString(target.forcedChat);
    }
    private static updateForcedMovement(
        player: Player,
        builder: PacketBuilder,
        target: Player,
        updateId: number
    ) {
        const startX = target.forceMovement.start.getLocalX(player.lastKnownRegion);
        const startY = target.forceMovement.start.getLocalY(player.lastKnownRegion);
        const endX = target.forceMovement.end.getX();
        const endY = target.forceMovement.end.getY();

        builder.puts(startX, ValueType.S);
        builder.puts(startY, ValueType.S);
        builder.puts(startX + endX, ValueType.S);
        builder.puts(startY + endY, ValueType.S);
        builder.putShort(target.forceMovement.speed, ValueType.A, ByteOrder.LITTLE);
        builder.putShort(target.forceMovement.reverseSpeed, ValueType.A, ByteOrder.BIG);
        builder.putShort(target.forceMovement.animation, ValueType.A, ByteOrder.LITTLE);
        builder.puts(target.forceMovement.direction, ValueType.S);
        if (this.shouldDebugPair(player, target)) {
            const forcedBytes = [
                this.encodeByteS(startX),
                this.encodeByteS(startY),
                this.encodeByteS(startX + endX),
                this.encodeByteS(startY + endY),
                ...this.encodeShortLittleA(target.forceMovement.speed),
                ...this.encodeShortBigA(target.forceMovement.reverseSpeed),
                ...this.encodeShortLittleA(target.forceMovement.animation),
                this.encodeByteS(target.forceMovement.direction),
            ];
            this.debugLog("forced_movement", {
                updateId,
                receiver: this.playerName(player),
                target: this.playerName(target),
                receiverLocation: this.locationOf(player),
                targetLocation: this.locationOf(target),
                receiverLastKnownRegion: player.lastKnownRegion
                    ? {
                          x: player.lastKnownRegion.getX(),
                          y: player.lastKnownRegion.getY(),
                          z: player.lastKnownRegion.getZ(),
                      }
                    : null,
                startLocal: { x: startX, y: startY },
                endDelta: { x: endX, y: endY },
                endLocal: { x: startX + endX, y: startY + endY },
                speed: target.forceMovement.speed,
                reverseSpeed: target.forceMovement.reverseSpeed,
                animation: target.forceMovement.animation,
                direction: target.forceMovement.direction,
                encodedBytes: forcedBytes,
            });
        }
    }
    private static updateAnimation(builder: PacketBuilder, target: Player) {
        builder.putShorts(target.animation.id, ByteOrder.LITTLE);
        builder.puts(target.animation.delay, ValueType.C);
    }
    private static updateGraphics(builder: PacketBuilder, target: Player) {
        builder.putShorts(target.graphic.id, ByteOrder.LITTLE);
        builder.putInt(
            ((target.graphic.height * 50) << 16) + (target.graphic.delay & 0xffff));
    }
    private static resolveHitmaskValue(hit: any): number {
        const raw =
            typeof hit?.getHitmask === "function"
                ? hit.getHitmask()
                : hit?.hitmask;

        if (typeof raw === "number" && Number.isFinite(raw)) {
            return raw;
        }
        if (raw != null && typeof raw.ordinal === "number") {
            return raw.ordinal;
        }
        return 0;
    }
    private static updateSingleHit(builder: PacketBuilder, target: Player) {
        builder.putShort(target.primaryHit.damage);
        builder.put(PlayerUpdating.resolveHitmaskValue(target.primaryHit));
        builder.putShort(target.getHitpoints());
        builder.putShort(target.skillManager.getMaxLevel(Skill.HITPOINTS));
    }
    private static updateDoubleHit(builder: PacketBuilder, target: Player) {
        builder.putShort(target.secondaryHit.damage);
        builder.put(PlayerUpdating.resolveHitmaskValue(target.secondaryHit));
        builder.putShort(target.getHitpoints());
        builder.putShort(target.skillManager.getMaxLevel(Skill.HITPOINTS));
    }
    private static updateFacingPosition(builder: PacketBuilder, target: Player) {
        const position = target.positionToFace;
        builder.putShort(position.x * 2 + 1, ValueType.A, ByteOrder.LITTLE);
        builder.putShorts(position.y * 2 + 1, ByteOrder.LITTLE);
    }
    private static updateEntityInteraction(builder: PacketBuilder, target: Player) {
        let entity = target.interactingMobile;
        if (entity != null) {
            let index = typeof entity.getIndex === "function" ? entity.getIndex() : entity.index;
            const entityIsPlayer =
                typeof entity.isPlayer === "function"
                    ? entity.isPlayer()
                    : entity instanceof Player;
            if (entityIsPlayer)
                index += +32768;
            builder.putShorts(index, ByteOrder.LITTLE);
        } else {
            builder.putShorts(-1, ByteOrder.LITTLE);
        }
    }
    private static updateAppearance(player: Player, out: PacketBuilder, target: Player): void {
        const appearance = target.getAppearance();
        const equipment = target.getEquipment();
        const properties = new PacketBuilder();

        properties.put(appearance.isMale() ? 0 : 1);

        // Head icon, prayers
        properties.put(appearance.getHeadHint());

        // Skull icon
        properties.put(target.isSkulled() ? target.getSkullType().getIconId() : -1);

        // Some sort of headhint (arrow over head)
        properties.put(0);

        if (player.getNpcTransformationId() == -1) {
            const equip = new Array<number>(equipment.capacity());
            for (let i = 0; i < equipment.capacity(); i++) {
                equip[i] = equipment.getItems()[i].getId();
            }
            if (equip[Equipment.HEAD_SLOT] > -1) {
                properties.putShort(0x200 + equip[Equipment.HEAD_SLOT]);
            }
            else {
                properties.put(0);
            }
            if (equip[Equipment.CAPE_SLOT] > -1) {
                properties.putShort(0x200 + equip[Equipment.CAPE_SLOT]);
            } else {
                properties.put(0);
            }
            if (equip[Equipment.AMULET_SLOT] > -1) {
                properties.putShort(0x200 + equip[Equipment.AMULET_SLOT]);
            } else {
                properties.put(0);
            }
            if (equip[Equipment.WEAPON_SLOT] > -1) {
                properties.putShort(0x200 + equip[Equipment.WEAPON_SLOT]);
            } else {
                properties.put(0);
            }
            if (equip[Equipment.BODY_SLOT] > -1) {
                properties.putShort(0x200 + equip[Equipment.BODY_SLOT]);
            } else {
                properties.putShort(0x100 + appearance.getLook()[Appearance.CHEST]);
            }
            if (equip[Equipment.SHIELD_SLOT] > -1) {
                properties.putShort(0x200 + equip[Equipment.SHIELD_SLOT]);
            } else {
                properties.put(0);
            }

            if (ItemDefinition.forId(equip[Equipment.BODY_SLOT]).getEquipmentType() == EquipmentType.PLATEBODY) {
                properties.put(0);
            } else {
                properties.putShort(0x100 + appearance.getLook()[Appearance.ARMS]);
            }

            if (equip[Equipment.LEG_SLOT] > -1) {
                properties.putShort(0x200 + equip[Equipment.LEG_SLOT]);
            } else {
                properties.putShort(0x100 + appearance.getLook()[Appearance.LEGS]);
            }

            if (ItemDefinition.forId(equip[Equipment.HEAD_SLOT]).getEquipmentType() == EquipmentType.FULL_HELMET
                || ItemDefinition.forId(equip[Equipment.CAPE_SLOT]).getEquipmentType() == EquipmentType.HOODED_CAPE
                || ItemDefinition.forId(equip[Equipment.HEAD_SLOT]).getEquipmentType() == EquipmentType.COIF) {
                properties.put(0);
            } else {
                properties.putShort(0x100 + appearance.getLook()[Appearance.HEAD]);
            }

            if (equip[Equipment.HANDS_SLOT] > -1) {
                properties.putShort(0x200 + equip[Equipment.HANDS_SLOT]);
            } else {
                properties.putShort(0x100 + appearance.getLook()[Appearance.HANDS]);
            }
            if (equip[Equipment.FEET_SLOT] > -1) {
                properties.putShort(0x200 + equip[Equipment.FEET_SLOT]);
            } else {
                properties.putShort(0x100 + appearance.getLook()[Appearance.FEET]);
            }
            if (appearance.getLook()[Appearance.BEARD] <= 0 || !appearance.isMale()
                || ItemDefinition.forId(equip[Equipment.HEAD_SLOT]).getEquipmentType() == EquipmentType.FULL_HELMET
            ) {
                properties.put(0);
            } else {
                properties.putShort(0x100 + appearance.getLook()[Appearance.BEARD]);
            }
        } else {
            properties.putShort(-1);
            properties.putShort(player.getNpcTransformationId());
        }
        properties.put(appearance.getLook()[Appearance.HAIR_COLOUR]);
        properties.put(appearance.getLook()[Appearance.TORSO_COLOUR]);
        properties.put(appearance.getLook()[Appearance.LEG_COLOUR]);
        properties.put(appearance.getLook()[Appearance.FEET_COLOUR]);
        properties.put(appearance.getLook()[Appearance.SKIN_COLOUR]);

        let skillAnim = target.getSkillAnimation();
        if (skillAnim > 0) {
            for (let i = 0; i < 7; i++)
                properties.putShort(skillAnim);
        } else {
            let wep = target.getEquipment().getItems()[Equipment.WEAPON_SLOT].getDefinition();
            properties.putShort(wep.getStandAnim());
            properties.putShort(0x337);
            properties.putShort(wep.getWalkAnim());
            properties.putShort(0x334);
            properties.putShort(0x335);
            properties.putShort(0x336);
            properties.putShort(wep.getRunAnim());
        }

        properties.putLong(Misc.stringToLongBigInt(target.getUsername()));
        properties.put(target.getSkillManager().getCombatLevel());
        properties.put(target.getRights().getId());
        properties.put(
            Number(target.getAttribute(PlayerUpdating.GLOW_PRESET_ATTRIBUTE) ?? 0) & 0xff
        );
        properties.put(
            Math.max(1, Math.min(5, Number(target.getAttribute(PlayerUpdating.GLOW_INTENSITY_ATTRIBUTE) ?? 5) | 0)) &
                0xff
        );
        properties.putString(target.getLoyaltyTitle());

        out.puts(properties.getBuffer().length, ValueType.C);
        out.putBytes(properties.getBuffer());
    }
}
