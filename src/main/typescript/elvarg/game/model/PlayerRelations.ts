import { Player } from "../entity/impl/player/Player";
import { World } from "../World";
import { Misc } from "../../util/Misc";
import { ClanChatManager } from "../content/clan/ClanChatManager";

export class PlayerRelations {
    private static readonly MAX_FRIENDS = 200;
    private static readonly MAX_IGNORES = 100;
    private status: PrivateChatStatus = PrivateChatStatus.ON;
    public friendList: Array<bigint> = [];
    public ignoreList: Array<bigint> = [];
    private privateMessageId = 1;
    private player: Player;

    constructor(player: Player) {
        this.player = player;
    }

    public getPrivateMessageId(): number {
        return this.privateMessageId++;
    }

    public setPrivateMessageId(privateMessageId: number): PlayerRelations {
        this.privateMessageId = privateMessageId;
        return this;
    }

    public setStatus(status: PrivateChatStatus, update: boolean): PlayerRelations {
        this.status = status;
        if (update) {
            this.updateLists(true);
        }
        return this;
    }

    public getStatus(): PrivateChatStatus {
        return this.status;
    }

    public getFriendList(): Array<bigint> {
        return this.friendList;
    }

    public getIgnoreList(): Array<bigint> {
        return this.ignoreList;
    }

    updateLists(online: boolean) {
        if (this.status === PrivateChatStatus.OFF) {
            online = false;
        }

        this.player.getPacketSender().sendFriendStatus(2);

        World.getPlayers().forEach((other) => {
            if (!other) {
                return;
            }

            let temporaryOnlineStatus = online;
            if (other.getRelations().friendList.includes(this.player.getLongUsername())) {
                if (
                    (this.status === PrivateChatStatus.FRIENDS_ONLY &&
                        !this.friendList.includes(other.getLongUsername())) ||
                    this.status === PrivateChatStatus.OFF ||
                    this.ignoreList.includes(other.getLongUsername())
                ) {
                    temporaryOnlineStatus = false;
                }
                other.getPacketSender().sendFriend(
                    this.player.getLongUsername(),
                    temporaryOnlineStatus ? 1 : 0
                );
            }

            let otherVisibleToPlayer = true;
            if (this.friendList.includes(other.getLongUsername())) {
                if (
                    (other.getRelations().status === PrivateChatStatus.FRIENDS_ONLY &&
                        !other.getRelations().getFriendList().includes(this.player.getLongUsername())) ||
                    other.getRelations().status === PrivateChatStatus.OFF ||
                    other.getRelations().getIgnoreList().includes(this.player.getLongUsername())
                ) {
                    otherVisibleToPlayer = false;
                }
                this.player.getPacketSender().sendFriend(
                    other.getLongUsername(),
                    otherVisibleToPlayer ? 1 : 0
                );
            }
        });

        return this;
    }

    sendPrivateStatus() {
        const privateChat = this.status === PrivateChatStatus.OFF ? 2 : this.status === PrivateChatStatus.FRIENDS_ONLY ? 1 : 0;
        this.player.getPacketSender().sendChatOptions(0, privateChat, 0);
    }

    sendFriends() {
        for (const l of this.friendList) {
            if (l) {
                this.player.getPacketSender().sendFriend(l, 0);
            }
        }
    }

    public sendIgnores(): void {
        for (const l of this.ignoreList) {
            if (l) {
                this.player.getPacketSender().sendAddIgnore(l);
            }
        }
    }

    public sendAddFriend(name: bigint): void {
        this.player.getPacketSender().sendFriend(name, 0);
    }

    public sendDeleteFriend(name: bigint): void {
        this.player.getPacketSender().sendDeleteFriend(name);
    }

    public sendAddIgnore(name: bigint): void {
        this.player.getPacketSender().sendAddIgnore(name);
    }

    public sendDeleteIgnore(name: bigint): void {
        this.player.getPacketSender().sendDeleteIgnore(name);
    }

    public onLogin(player: Player): PlayerRelations {
        this.sendIgnores();
        this.sendFriends();
        this.sendPrivateStatus();
        return this;
    }

    public addFriend(username: bigint): void {
        const name = Misc.formatName(Misc.longToString(username));
        if (name === this.player.getUsername()) {
            return;
        }
        if (this.friendList.length >= PlayerRelations.MAX_FRIENDS) {
            this.player.getPacketSender().sendMessage("Your friend list is full!");
            return;
        }
        if (this.ignoreList.indexOf(username) !== -1) {
            this.player.getPacketSender().sendMessage("Please remove " + name + " from your ignore list first.");
            return;
        }
        if (this.friendList.indexOf(username) !== -1) {
            this.player.getPacketSender().sendMessage(name + " is already on your friends list!");
        } else {
            this.friendList.push(username);
            this.sendAddFriend(username);
            this.updateLists(true);
            const friend = World.getPlayerByName(name);
            if (friend) {
                friend.getRelations().updateLists(true);
                ClanChatManager.updateRank(ClanChatManager.getClanChat(this.player), friend);
                if (this.player.getInterfaceId() === ClanChatManager.CLAN_CHAT_SETUP_INTERFACE_ID) {
                    ClanChatManager.clanChatSetupInterface(this.player);
                }
            }
        }
    }

    public isFriendWith(player: string): boolean {
        return this.friendList.indexOf(Misc.stringToLongBigInt(player)) !== -1;
    }

    public deleteFriend(username: bigint): void {
        const name = Misc.formatName(Misc.longToString(username));
        if (name === this.player.getUsername()) {
            return;
        }
        const friendIndex = this.friendList.indexOf(username);
        if (friendIndex !== -1) {
            this.friendList.splice(friendIndex, 1);
            this.sendDeleteFriend(username);
            this.updateLists(false);
            const unfriend = World.getPlayerByName(name);
            if (unfriend) {
                unfriend.getRelations().updateLists(false);
                ClanChatManager.updateRank(ClanChatManager.getClanChat(this.player), unfriend);
                if (this.player.getInterfaceId() === ClanChatManager.CLAN_CHAT_SETUP_INTERFACE_ID) {
                    ClanChatManager.clanChatSetupInterface(this.player);
                }
            }
        } else {
            this.player.getPacketSender().sendMessage("This player is not on your friends list!");
        }
    }

    public addIgnore(username: bigint): void {
        const name = Misc.formatName(Misc.longToString(username));
        if (name === this.player.getUsername()) {
            return;
        }
        if (this.ignoreList.length >= PlayerRelations.MAX_IGNORES) {
            this.player.getPacketSender().sendMessage("Your ignore list is full!");
            return;
        }
        if (this.friendList.indexOf(username) !== -1) {
            this.player.getPacketSender().sendMessage("Please remove " + name + " from your friend list first.");
            return;
        }
        if (this.ignoreList.indexOf(username) !== -1) {
            this.player.getPacketSender().sendMessage(name + " is already on your ignore list!");
        } else {
            this.ignoreList.push(username);
            this.sendAddIgnore(username);
            this.updateLists(true);
            const ignored = World.getPlayerByName(name);
            if (ignored) {
                ignored.getRelations().updateLists(false);
            }
        }
    }

    public deleteIgnore(username: bigint): void {
        const name = Misc.formatName(Misc.longToString(username));
        if (name === this.player.getUsername()) {
            return;
        }
        const ignoreIndex = this.ignoreList.indexOf(username);
        if (ignoreIndex !== -1) {
            this.ignoreList.splice(ignoreIndex, 1);
            this.sendDeleteIgnore(username);
            this.updateLists(true);
            if (this.status === PrivateChatStatus.ON) {
                const ignored = World.getPlayerByName(name);
                if (ignored) {
                    ignored.getRelations().updateLists(true);
                }
            }
        } else {
            this.player.getPacketSender().sendMessage("This player is not on your ignore list!");
        }
    }

    public message(friend: Player, message: Uint8Array, size: number): void {
        if ((friend.getRelations().status === PrivateChatStatus.FRIENDS_ONLY && friend.getRelations().friendList.indexOf(this.player.getLongUsername()) === -1) || friend.getRelations().status === PrivateChatStatus.OFF) {
            this.player.getPacketSender().sendMessage("This player is currently offline.");
            return;
        }
        if (this.status === PrivateChatStatus.OFF) {
            this.setStatus(PrivateChatStatus.FRIENDS_ONLY, true);
        }
        friend.getPacketSender().sendPrivateMessage(this.player, message, size);
    }

}

export enum PrivateChatStatus {
    ON, FRIENDS_ONLY, OFF
}
