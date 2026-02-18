
import { Player } from '../game/entity/impl/player/Player'
import { Sound } from '../game/Sound'
export class Sounds {
    private static readonly ITEM_SOUND_DEDUPE_MS = 120;
    private static readonly lastItemSoundAtByPlayer = new Map<string, { id: number; at: number }>();

    private static isDuplicateItemSound(player: Player, sound: Sound): boolean {
        const id = sound.getId();
        if (id !== Sound.DROP_ITEM.getId() && id !== Sound.PICK_UP_ITEM.getId()) {
            return false;
        }

        const username = player?.getUsername?.();
        if (!username) {
            return false;
        }

        const now = Date.now();
        const previous = Sounds.lastItemSoundAtByPlayer.get(username);
        if (previous && previous.id === id && now - previous.at < Sounds.ITEM_SOUND_DEDUPE_MS) {
            return true;
        }

        Sounds.lastItemSoundAtByPlayer.set(username, { id, at: now });
        return false;
    }

    public static sendSound(player: Player, sound: Sound) {
        if (!player || !sound || player.isPlayerBot() || Sounds.isDuplicateItemSound(player, sound)) {
            return;
        }

        player
            .getPacketSender()
            .sendSoundEffect(sound.getId(), sound.getLoopType(), sound.getDelay(), sound.getVolume());
    }

    public static sendSoundEffect(player: Player, soundId: number, loopType: number, delay: number, volume: number) {
        player.getPacketSender().sendSoundEffect(soundId, loopType, delay, volume);
    }
}
