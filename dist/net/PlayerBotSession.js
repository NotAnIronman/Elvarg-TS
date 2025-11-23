"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerBotSession = void 0;
const PlayerSession_1 = require("./PlayerSession");
class PlayerBotSession extends PlayerSession_1.PlayerSession {
    // public player: Player;
    constructor() {
        super({
            // @ts-ignore
            parent: null,
            config: null,
            localAddress: null,
            remoteAddress: null,
            isInputShutdown: false,
            shutdownInput: () => null,
            shutdownInputPromise: () => null,
            isOutputShutdown: false,
            shutdownOutput: () => null,
            shutdownOutputPromise: () => null,
            isShutdown: false,
            shutdown: () => null,
            shutdownPromise: () => null,
            id: null,
            eventLoop: null,
            isOpen: false,
            isRegistered: false,
            isActive: false,
            metadata: null,
            closeFuture: () => null,
            isWritable: false,
            bytesBeforeUnwritable: 0,
            bytesBeforeWritable: 0,
            unsafe: null,
            pipeline: null,
            alloc: null,
            read: () => null,
            flush: () => null,
            bind: () => null,
            connect: () => null,
            connectTwo: () => null,
            disconnect: () => null,
            closeChannel: () => null,
            deregister: () => null,
            bindPromise: () => null,
            connectPromise: () => null,
            connectTwoPromise: () => null,
            disconnectPromise: () => null,
            closePromise: () => null,
            deregisterPromise: () => null,
            write: () => null,
            writePromise: () => null,
            writeAndFlushPromise: () => null,
            writeAndFlush: () => null,
            newPromise: () => null,
            newProgressivePromise: () => null,
            newSucceededFuture: () => null,
            newFailedFuture: () => null,
            voidPromise: () => null,
            attr: () => null,
            hasAttr: () => false,
            compareTo: () => 0,
        });
    }
    async finalizeLogin(msg) {
        await super.finalizeLogin(msg);
    }
    /**
      
      Queues a recently decoded packet received from the channel.
      @param msg The packet that should be queued.
      */
    queuePacket(msg) { }
    /**
      
      Processes all of the queued messages from the {@link PacketDecoder} by
      polling the internal queue, and then handling them via the
      handleInputMessage. This method is called EACH GAME CYCLE.
      */
    processPackets() { }
    /**
      
      Queues the {@code msg} for this session to be encoded and sent to the client.
      @param builder the packet to queue.
      */
    write(builder) { }
    /**
      
      Flushes this channel.
      */
    flush() { }
    /**
      
      Gets the player I/O operations will be executed for.
      @return the player I/O operations.
      */
    // public getPlayer(): Player {
    //     return this.player;
    // }
    // public setPlayer(player: Player): void {
    //     this.player = player;
    // }
    getChannel() {
        return null;
    }
}
exports.PlayerBotSession = PlayerBotSession;
//# sourceMappingURL=PlayerBotSession.js.map