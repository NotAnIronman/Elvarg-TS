import * as assert from "assert";
import { cleanup } from "node-datachannel";
import { RTCDataChannel, RTCPeerConnection } from "node-datachannel/polyfill";
import { DataChannelBinaryChannel } from "../src/main/typescript/elvarg/net/webrtc/DataChannelBinaryChannel";

const withTimeout = <T>(promise: Promise<T>, label: string): Promise<T> => Promise.race([
  promise,
  new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), 10_000)),
]);

async function main(): Promise<void> {
  const browser = new RTCPeerConnection();
  const server = new RTCPeerConnection();
  let browserRemoteSet = false;
  let serverRemoteSet = false;
  const forBrowser: RTCIceCandidateInit[] = [];
  const forServer: RTCIceCandidateInit[] = [];

  browser.onicecandidate = (event) => {
    if (!event.candidate) return;
    const candidate = event.candidate.toJSON();
    if (serverRemoteSet) void server.addIceCandidate(candidate);
    else forServer.push(candidate);
  };
  server.onicecandidate = (event) => {
    if (!event.candidate) return;
    const candidate = event.candidate.toJSON();
    if (browserRemoteSet) void browser.addIceCandidate(candidate);
    else forBrowser.push(candidate);
  };

  const receivedChannel = new Promise<RTCDataChannel>((resolve) => {
    server.ondatachannel = (event) => resolve(event.channel as RTCDataChannel);
  });
  const outgoing = browser.createDataChannel("game", { ordered: true });
  await browser.setLocalDescription({ type: "offer" });
  const offer = await browser.createOffer();
  await server.setRemoteDescription(offer);
  serverRemoteSet = true;
  for (const candidate of forServer.splice(0)) await server.addIceCandidate(candidate);
  const answer = await server.createAnswer();
  await browser.setRemoteDescription(answer);
  browserRemoteSet = true;
  for (const candidate of forBrowser.splice(0)) await browser.addIceCandidate(candidate);

  const incoming = await withTimeout(receivedChannel, "receiving game channel");
  const opened = outgoing.readyState === "open"
    ? Promise.resolve()
    : new Promise<void>((resolve) => outgoing.addEventListener("open", () => resolve(), { once: true }));
  await withTimeout(opened, "opening game channel");

  const frames: Buffer[] = [];
  const wrapped = new DataChannelBinaryChannel(incoming, server);
  wrapped.onData((frame) => frames.push(frame));
  outgoing.send(new Uint8Array([1]));
  outgoing.send(new Uint8Array([2, 3]));
  outgoing.send(new Uint8Array([4, 5, 6]));
  await withTimeout(new Promise<void>((resolve) => {
    const poll = setInterval(() => {
      if (frames.length === 3) {
        clearInterval(poll);
        resolve();
      }
    }, 5);
  }), "receiving binary frames");

  assert.deepStrictEqual(frames.map((frame) => [...frame]), [[1], [2, 3], [4, 5, 6]]);
  assert.equal(incoming.ordered, true);
  assert.equal(incoming.maxRetransmits, null);
  assert.equal(incoming.maxPacketLifeTime, null);
  wrapped.close();
  browser.close();
  console.log("WebRTC loopback preserves reliable ordered binary message boundaries.");
}

main()
  .then(() => setTimeout(() => cleanup(), 50))
  .catch((error) => {
    console.error(error);
    cleanup();
    process.exitCode = 1;
  });
