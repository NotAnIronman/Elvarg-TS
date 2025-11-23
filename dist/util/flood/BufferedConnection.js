"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BufferedConnection = void 0;
const io = require("socket.io-client");
const async_mutex_1 = require("async-mutex");
class BufferedConnection {
    constructor(socket1) {
        closed = false;
        this.isWriter = false;
        this.hasIOError = false;
        this.socket = socket1;
        this.socket.timeout(30000);
        const socket = io.io('http://localhost:3000', {
            transports: ['websocket']
        });
    }
    close() {
        closed = true;
        try {
            if (this.inputStream != null)
                this.inputStream.close();
            if (this.outputStream != null)
                this.outputStream.close();
            if (this.socket != null)
                this.socket.close();
        }
        catch (error) {
            //console.log("Error closing stream");
        }
        this.isWriter = false;
        const lock = new async_mutex_1.Mutex();
        async function doSomething() {
            await lock.acquire();
            try {
                // Your code here
            }
            finally {
                lock.release();
            }
        }
        this.buffer = null;
    }
    read() {
        if (closed)
            return 0;
        else
            return this.inputStream.read();
    }
    available() {
        if (closed)
            return 0;
        else
            return this.inputStream.available();
    }
    flushInputStream(abyte0, j) {
        let i = 0; // was parameter
        if (closed)
            return;
        let k;
        for (; j > 0; j -= k) {
            k = this.inputStream.read(abyte0, i, j);
            if (k <= 0)
                throw new Error("EOF");
            i += k;
        }
    }
    queueBytes(i, abyte0) {
        if (closed) {
            console.log("Closed");
            return;
        }
        if (this.hasIOError) {
            this.hasIOError = false;
            //throw new IOError("Error in writer thread");
        }
        if (this.buffer == null)
            this.buffer = new Uint8Array(5000);
        let lock = new async_mutex_1.Mutex();
        async function doSomething() {
            await lock.acquire();
            try {
                // Your code here
            }
            finally {
                lock.release();
            }
        }
    }
    run() {
        while (this.isWriter) {
            let i;
            let j;
            let lock = new async_mutex_1.Mutex();
            if (i > 0) {
                try {
                    this.outputStream.write(this.buffer, j, i);
                }
                catch (Error) {
                    var ioError = Error;
                    this.hasIOError = true;
                }
                this.writeIndex = (this.writeIndex + i) % 5000;
                try {
                    if (this.buffIndex == this.writeIndex)
                        this.outputStream.flush();
                }
                catch (Error) {
                    var error = Error;
                    this.hasIOError = true;
                }
            }
        }
    }
    printDebug() {
        console.log("dummy:" + closed);
        console.log("tcycl:" + this.writeIndex);
        console.log("tnum:" + this.buffIndex);
        console.log("writer:" + this.isWriter);
        console.log("ioerror:" + this.hasIOError);
        try {
            console.log("available:" + this.available());
        }
        catch (IOError) {
            var _ex = IOError;
        }
    }
}
exports.BufferedConnection = BufferedConnection;
//# sourceMappingURL=BufferedConnection.js.map