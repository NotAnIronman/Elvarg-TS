/**
 * Minimal smoke test client to ensure login handshake stays stable.
 *
 * Usage: npm run test:login
 *
 * It connects to ws://127.0.0.1:49595, performs the same handshake as the web client,
 * and asserts that a LOGIN_SUCCESSFUL (2) response is received.
 */
import { WebSocket } from "ws";

const HOST = "127.0.0.1";
const PORT = 49595;
const LOGIN_REQUEST_OPCODE = 14;
const CONNECTION_TYPE = 16; // NEW_CONNECTION_OPCODE
const UID = 8784521;
const USERNAME = "smoketest";
const PASSWORD = "smoketest";
const RSA_MODULUS = BigInt(
  "131409501542646890473421187351592645202876910715283031445708554322032707707649791604685616593680318619733794036379235220188001221437267862925531863675607742394687835827374685954437825783807190283337943749605737918856262761566146702087468587898515768996741636870321689974105378482179138088453912399137944888201"
);
const RSA_PUBLIC = BigInt(65537);

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    e >>= 1n;
    b = (b * b) % mod;
  }
  return result;
}

function writeInt(buf: number[], value: number) {
  buf.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
}

function writeString(buf: number[], s: string) {
  for (const c of s) buf.push(c.charCodeAt(0));
  buf.push(10); // newline terminator
}

function encryptRsa(plain: Buffer): Buffer {
  const m = BigInt("0x" + plain.toString("hex"));
  const c = modPow(m, RSA_PUBLIC, RSA_MODULUS);
  let hex = c.toString(16);
  if (hex.length % 2 === 1) hex = "0" + hex;
  // emulate Java BigInteger toByteArray (prepend 00 if sign bit set)
  if ((parseInt(hex.slice(0, 2), 16) & 0x80) !== 0) hex = "00" + hex;
  return Buffer.from(hex, "hex");
}

function buildLoginPayload(serverSeed1: number, serverSeed2: number): Buffer {
  // Seed array as per client
  const seed: number[] = [
    Math.floor(Math.random() * 0x7fffffff),
    Math.floor(Math.random() * 0x7fffffff),
    serverSeed1,
    serverSeed2,
  ];

  // Build RSA plain block
  const rsaPlain: number[] = [];
  rsaPlain.push(10); // securityId
  writeInt(rsaPlain, seed[0]);
  writeInt(rsaPlain, seed[1]);
  writeInt(rsaPlain, seed[2]);
  writeInt(rsaPlain, seed[3]);
  writeInt(rsaPlain, UID);
  writeString(rsaPlain, USERNAME);
  writeString(rsaPlain, PASSWORD);
  const rsaCipher = encryptRsa(Buffer.from(rsaPlain));

  // PacketSender buffer: length + cipher bytes
  const sender: number[] = [];
  sender.push(rsaCipher.length & 0xff);
  sender.push(...rsaCipher);

  // Login buffer
  const loginBuf: number[] = [];
  loginBuf.push(CONNECTION_TYPE);
  loginBuf.push(sender.length + 2); // size byte
  loginBuf.push(255); // magic
  loginBuf.push(0); // memory flag
  loginBuf.push(...sender);

  // Wrap with initial opcode 14 and seeds already handled by server handshake
  return Buffer.from(loginBuf);
}

async function main() {
  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(`ws://${HOST}:${PORT}`);
    ws.binaryType = "arraybuffer";

    const timeout = setTimeout(() => reject(new Error("Timed out")), 10000);

    ws.onopen = () => {
      // Send login request opcode
      ws.send(Buffer.from([LOGIN_REQUEST_OPCODE]));
    };

    ws.onmessage = (ev) => {
      const buf = Buffer.isBuffer(ev.data) ? ev.data : Buffer.from(ev.data as ArrayBuffer);
      // Expect handshake response: 0 + two int32 seeds
      if (buf.length === 9 && buf.readUInt8(0) === 0) {
        const serverSeed1 = buf.readInt32BE(1);
        const serverSeed2 = buf.readInt32BE(5);
        const loginPayload = buildLoginPayload(serverSeed1, serverSeed2);
        ws.send(loginPayload);
        return;
      }
      // Expect login response byte
      if (buf.length >= 1) {
        const resp = buf.readUInt8(0);
        if (resp === 2) {
            clearTimeout(timeout);
            ws.close();
            console.log("Login smoke test: SUCCESS");
            resolve();
        } else {
          clearTimeout(timeout);
          reject(new Error(`Login smoke test failed, response ${resp}`));
        }
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    ws.onclose = () => {
      // ignore
    };
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
