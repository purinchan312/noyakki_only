import { world, system, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { makeKey, getBooleanProp, setBooleanProp, getStringProp, setStringProp } from "./storage.js";

const HOST_ID_KEY = makeKey("core", "host_id");
const HOST_GUIDED_KEY = makeKey("core", "host_guided");

/**
 * 永続化済みのホストプレイヤーIDを取得する。
 * @returns {string}
 */
export function getHostId() {
  return getStringProp(HOST_ID_KEY, "");
}

/**
 * ホストIDを優先順位に従って確定・記録する。
 * @param {import("@minecraft/server").Player} player
 */
export function tryRegisterHost(player) {
  if (!player || !player.isValid || player.typeId !== "minecraft:player") {
    return;
  }

  // 優先1: CommandPermissionLevel.Host を持つプレイヤーを確実にホストとして記録
  try {
    if (player.commandPermissionLevel === CommandPermissionLevel.Host) {
      if (getHostId() !== player.id) {
        setStringProp(HOST_ID_KEY, player.id);
      }
      return;
    }
  } catch {
    // チートOFF等やデータ準備前でもフォールバック判定へ進む
  }

  // 優先2: 未設定の場合のみ、最初にスポーンしたプレイヤーを記録
  if (getHostId() === "") {
    setStringProp(HOST_ID_KEY, player.id);
  }
}

/**
 * 指定プレイヤーがワールドホスト本人か判定する（ゲスト・OP等の例外許可なし）。
 * @param {unknown} player
 * @returns {boolean}
 */
export function isHostPlayer(player) {
  if (!player || !player.isValid || player.typeId !== "minecraft:player") {
    return false;
  }
  const hostId = getHostId();
  if (hostId === "") {
    return false;
  }
  return player.id === hostId;
}

/**
 * ホスト本人へ初回案内メッセージを一度だけ送信する。
 * @param {import("@minecraft/server").Player} player
 */
function sendHostGuideOnce(player) {
  if (!isHostPlayer(player) || getBooleanProp(HOST_GUIDED_KEY, false)) {
    return;
  }
  setBooleanProp(HOST_GUIDED_KEY, true);
  try {
    player.sendMessage(
      "§e[のやっきー専用] 設定画面を開くには /noyakki_only:config を実行してください（ホストのみ利用可能）。"
    );
  } catch {
    // 送信失敗は無視
  }
}

/**
 * ワールド内の在室プレイヤーからホストIDを補完解決する。
 */
function resolveHostFromWorld() {
  try {
    const players = world.getAllPlayers();
    for (const player of players) {
      try {
        if (player && player.isValid && player.commandPermissionLevel === CommandPermissionLevel.Host) {
          tryRegisterHost(player);
          sendHostGuideOnce(player);
          return;
        }
      } catch {
        // 次のプレイヤーを確認
      }
    }
    if (getHostId() === "" && players.length > 0 && players[0] && players[0].isValid) {
      tryRegisterHost(players[0]);
      sendHostGuideOnce(players[0]);
    }
  } catch {
    // ワールド未準備時は無視
  }
}

/**
 * カスタムコマンド実行元がホスト本人であるかを検証し、非ホスト・非プレイヤーを即時遮断する。
 * @param {import("@minecraft/server").CustomCommandOrigin} origin
 */
export function assertHostOnly(origin) {
  const entity = origin ? origin.sourceEntity : undefined;
  if (entity && entity.isValid && entity.typeId === "minecraft:player" && getHostId() === "") {
    let canBootstrapHost = false;
    try {
      if (entity.commandPermissionLevel === CommandPermissionLevel.Host) {
        canBootstrapHost = true;
      }
    } catch {
      // フォールバック判定へ進む
    }
    if (!canBootstrapHost) {
      try {
        if (world.getAllPlayers().length === 1) {
          canBootstrapHost = true;
        }
      } catch {
        // 無視
      }
    }
    if (canBootstrapHost) {
      tryRegisterHost(entity);
    }
  }

  if (!isHostPlayer(entity)) {
    return {
      ok: false,
      player: undefined,
      result: {
        status: CustomCommandStatus.Failure,
        message: "このコマンドはホストのみ利用可能です。"
      }
    };
  }
  return {
    ok: true,
    player: entity,
    result: {
      status: CustomCommandStatus.Success
    }
  };
}

/**
 * ホスト識別と初回コマンド案内を初期化する（Early-Execution 安全）。
 */
export function initHostAuth() {
  world.afterEvents.playerSpawn.subscribe((event) => {
    if (!event.initialSpawn) {
      return;
    }
    const player = event.player;
    tryRegisterHost(player);
    sendHostGuideOnce(player);
  });

  world.afterEvents.worldLoad.subscribe(() => {
    resolveHostFromWorld();
  });

  // スクリプトリロード時など既にワールド・プレイヤーが存在する場合の補完
  system.run(() => {
    resolveHostFromWorld();
  });
}
