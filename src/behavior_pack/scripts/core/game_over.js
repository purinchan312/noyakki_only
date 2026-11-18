import { world, system, EquipmentSlot, GameMode } from "@minecraft/server";
import { makeKey, getBooleanProp, setBooleanProp, getStringProp, setStringProp } from "./storage.js";

const GAMEOVER_ACTIVE_KEY = makeKey("core", "gameover_active");
const GAMEOVER_SOURCE_KEY = makeKey("core", "gameover_source");
const GAMEOVER_MSG_KEY = makeKey("core", "gameover_msg");

let inMemoryLock = false;

/**
 * プレイヤーが殺害対象となる生存状態か判定する（スペクテイター・既に死亡済みは除外）。
 * @param {import("@minecraft/server").Player} player
 * @returns {boolean}
 */
function isPlayerAliveForKill(player) {
  if (!player || !player.isValid || player.typeId !== "minecraft:player") {
    return false;
  }
  try {
    if (player.getGameMode() === GameMode.Spectator) {
      return false;
    }
  } catch {
    // ゲームモード取得失敗時は次の確認へ進む
  }
  try {
    const health = player.getComponent("minecraft:health");
    if (health && health.currentValue <= 0) {
      return false;
    }
  } catch {
    // 体力取得失敗時は生存扱いとして続行
  }
  return true;
}

/**
 * 不死のトーテムによる延命を阻止するため、メインハンド・オフハンドから除去する。
 * @param {import("@minecraft/server").Player} player
 */
function stripTotems(player) {
  try {
    const equippable = player.getComponent("minecraft:equippable");
    if (!equippable) {
      return;
    }
    for (const slot of [EquipmentSlot.Mainhand, EquipmentSlot.Offhand]) {
      const item = equippable.getEquipment(slot);
      if (item && item.typeId === "minecraft:totem_of_undying") {
        equippable.setEquipment(slot, undefined);
      }
    }
  } catch {
    // 装備アクセス失敗は無視
  }
}

/**
 * 生存しているプレイヤーのトーテムを外した上で HP を 0 にする。
 * @param {import("@minecraft/server").Player} player
 */
function forceKillPlayer(player) {
  if (!isPlayerAliveForKill(player)) {
    return;
  }
  stripTotems(player);
  try {
    player.kill();
  } catch {
    // 既に死亡済み等の例外は無視
  }
}

/**
 * ワールドがすでにゲームオーバー確定状態であるかを返す。
 * @returns {boolean}
 */
export function isGameOverActive() {
  return inMemoryLock || getBooleanProp(GAMEOVER_ACTIVE_KEY, false);
}

/**
 * 共通ゲームオーバー処理を実行する（二重発火ロック・タイトル通知・効果音・全員HP0化）。
 * @param {string} sourceId - 発動元モジュールID（例: "f01", "f03"）
 * @param {string} message - 表示メッセージ
 * @returns {boolean} 今回新たに発動した場合 true
 */
export function triggerGlobalGameOver(sourceId, message) {
  if (isGameOverActive()) {
    return false;
  }

  inMemoryLock = true;
  setBooleanProp(GAMEOVER_ACTIVE_KEY, true);
  setStringProp(GAMEOVER_SOURCE_KEY, sourceId);
  setStringProp(GAMEOVER_MSG_KEY, message);

  const players = world.getAllPlayers();
  for (const player of players) {
    if (!player || !player.isValid) {
      continue;
    }
    try {
      player.onScreenDisplay.setTitle(message);
    } catch {
      // タイトル失敗は無視
    }
    try {
      player.sendMessage(`§c${message}`);
    } catch {
      // チャット失敗は無視
    }
    try {
      player.playSound("mob.wither.death");
    } catch {
      // 効果音失敗は無視
    }
  }

  for (const player of players) {
    if (player && player.isValid) {
      forceKillPlayer(player);
    }
  }

  // 翌ティックにも生存残留チェックを行い、トーテム等で耐えた場合を確実に終了させる
  system.runTimeout(() => {
    for (const player of world.getAllPlayers()) {
      if (player && player.isValid) {
        forceKillPlayer(player);
      }
    }
  }, 1);

  return true;
}

/**
 * オフライン参加者の再接続時即死対策を初期化する。
 */
export function initGameOverService() {
  if (getBooleanProp(GAMEOVER_ACTIVE_KEY, false)) {
    inMemoryLock = true;
  }

  world.afterEvents.playerSpawn.subscribe((event) => {
    if (!event.initialSpawn || !isGameOverActive()) {
      return;
    }
    const player = event.player;
    system.runTimeout(() => {
      if (!isPlayerAliveForKill(player)) {
        return;
      }
      const message = getStringProp(GAMEOVER_MSG_KEY, "ゲームオーバー");
      try {
        player.onScreenDisplay.setTitle(message);
      } catch {
        // タイトル失敗は無視
      }
      try {
        player.sendMessage(`§c${message}`);
      } catch {
        // チャット失敗は無視
      }
      try {
        player.playSound("mob.wither.death");
      } catch {
        // 効果音失敗は無視
      }
      forceKillPlayer(player);

      system.runTimeout(() => {
        if (player && player.isValid) {
          forceKillPlayer(player);
        }
      }, 1);
    }, 1);
  });
}
