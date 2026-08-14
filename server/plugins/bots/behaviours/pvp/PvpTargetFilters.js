"use strict";

function isVisibleRealPlayer(sourcePlayer, candidate) {
  return (
    candidate &&
    candidate !== sourcePlayer &&
    candidate.isPlayerBot?.() !== true &&
    candidate.isRegistered?.() === true &&
    (candidate.getHitpoints?.() ?? 0) > 0 &&
    candidate.getPrivateArea?.() === sourcePlayer.getPrivateArea?.()
  );
}

module.exports = {
  isVisibleRealPlayer,
};
