import { world, system, GameMode } from "@minecraft/server";
import { ModalFormData, FormCancelationReason } from "@minecraft/server-ui";
import {
  makeKey,
  getBooleanProp,
  setBooleanProp,
  getNumberProp,
  setNumberProp,
  getStringProp,
  setStringProp,
  getCurrentDay
} from "../core/storage.js";
import { isHostPlayer } from "../core/host_auth.js";
import { showFormWithRetry } from "../core/ui_manager.js";
import { isGameOverActive, triggerGlobalGameOver } from "../core/game_over.js";

const ENABLED_KEY = makeKey("f03", "enabled");
const DAYS_KEY = makeKey("f03", "days");
const MSG_KEY = makeKey("f03", "msg");
const SLAIN_KEY = makeKey("f03", "slain");
const CLEARED_KEY = makeKey("f03", "cleared");
const TRIGGERED_KEY = makeKey("f03", "triggered");

const DEFAULT_DAYS = 50;
const DEFAULT_MSG = "ゲームオーバー";

function isEnabled() {
  return getBooleanProp(ENABLED_KEY, false);
}

function getDays() {
  return getNumberProp(DAYS_KEY, DEFAULT_DAYS);
}

function getMessage() {
  return getStringProp(MSG_KEY, DEFAULT_MSG);
}

function isSlain() {
  return getBooleanProp(SLAIN_KEY, false);
}

function isCleared() {
  return getBooleanProp(CLEARED_KEY, false);
}

function isTriggered() {
  return getBooleanProp(TRIGGERED_KEY, false);
}

/**
 * デッドラインの有効/無効を更新する。
 * @param {boolean} enabled
 */
function setEnabled(enabled) {
  setBooleanProp(ENABLED_KEY, Boolean(enabled));
}

/**
 * メッセージ内の任意プレースホルダを実値へ置換する。
 * @param {string} template
 * @param {number} days
 * @param {number} currentDay
 * @returns {string}
 */
function formatDeadlineMessage(template, days, currentDay) {
  return template
    .replace(/\{day\}/g, () => String(days))
    .replace(/\{current_day\}/g, () => String(currentDay));
}

/**
 * デッドラインの個別設定フォームを開く（ホスト専用）。
 * @param {import("@minecraft/server").Player} player
 * @param {() => Promise<void>} onBack
 */
async function openSettingsForm(player, onBack) {
  if (!isHostPlayer(player)) {
    return;
  }

  const form = new ModalFormData()
    .title("デッドライン 設定")
    .toggle("デッドラインを有効にする", { defaultValue: isEnabled() })
    .textField("制限日数（ゲーム内経過日数）", "0以上の半角整数（例: 50）", {
      defaultValue: String(getDays())
    })
    .textField("ゲームオーバーメッセージ", DEFAULT_MSG, {
      defaultValue: getMessage()
    });

  const response = await showFormWithRetry(player, form);
  if (!response || response.canceled || !response.formValues) {
    if (response && response.cancelationReason === FormCancelationReason.UserClosed && onBack) {
      await onBack();
    }
    return;
  }

  const nextEnabled = Boolean(response.formValues[0]);
  const daysRaw = String(response.formValues[1] ?? "").trim();
  const msgRaw = String(response.formValues[2] ?? "").trim();

  if (!/^\d+$/.test(daysRaw)) {
    try {
      player.sendMessage("§c[デッドライン] 制限日数は 0 以上の半角整数で入力してください。");
    } catch {
      // 送信失敗は無視
    }
    return;
  }

  const parsedDays = Number(daysRaw);
  if (!Number.isSafeInteger(parsedDays) || parsedDays < 0) {
    try {
      player.sendMessage("§c[デッドライン] 制限日数の値が不正です。");
    } catch {
      // 送信失敗は無視
    }
    return;
  }

  if (msgRaw.length === 0) {
    try {
      player.sendMessage("§c[デッドライン] ゲームオーバーメッセージは空文字にできません。");
    } catch {
      // 送信失敗は無視
    }
    return;
  }

  setNumberProp(DAYS_KEY, parsedDays);
  setStringProp(MSG_KEY, msgRaw);
  setEnabled(nextEnabled);

  try {
    player.sendMessage("§a[デッドライン] 設定を保存しました。");
  } catch {
    // 送信失敗は無視
  }

  if (onBack) {
    await onBack();
  }
}

/**
 * ルート設定メニュー用の1行サマリーを返す。
 * @returns {string}
 */
function getStatusSummary() {
  if (!isEnabled()) {
    return "・デッドライン: OFF";
  }
  if (isCleared()) {
    return "・デッドライン: ON（クリア達成済み！）";
  }
  const days = getDays();
  const currentDay = getCurrentDay();
  return `・デッドライン: ON（${days}日終了まで / 残り ${days - currentDay}日）`;
}

/**
 * エンダードラゴン討伐記録・帰還クリア判定・タイムアップ監視を初期化する。
 */
function init() {
  // 第1段階: 機能のON/OFFに関わらずエンダードラゴン討伐を常時記録
  world.afterEvents.entityDie.subscribe((event) => {
    const deadEntity = event.deadEntity;
    if (deadEntity && deadEntity.typeId === "minecraft:ender_dragon") {
      setBooleanProp(SLAIN_KEY, true);
    }
  });

  // 第2段階: 生存プレイヤーがジ・エンドからオーバーワールドへ帰還した瞬間にクリア確定
  world.afterEvents.playerDimensionChange.subscribe((event) => {
    if (!isEnabled() || isTriggered() || isGameOverActive() || isCleared() || !isSlain()) {
      return;
    }
    const player = event.player;
    if (!player || !player.isValid) {
      return;
    }
    try {
      if (player.getGameMode() === GameMode.Spectator) {
        return;
      }
    } catch {
      return;
    }

    if (
      event.fromDimension?.id !== "minecraft:the_end" ||
      event.toDimension?.id !== "minecraft:overworld"
    ) {
      return;
    }

    setBooleanProp(CLEARED_KEY, true);

    const currentDay = getCurrentDay();
    const days = getDays();
    const notice = `§a[デッドライン] 期限内（${currentDay}/${days}日）にエンダードラゴン討伐＆帰還を達成しました！`;
    for (const member of world.getAllPlayers()) {
      if (!member || !member.isValid) {
        continue;
      }
      try {
        member.sendMessage(notice);
      } catch {
        // チャット送信失敗は無視
      }
      try {
        member.playSound("ui.toast.challenge_complete");
      } catch {
        // 効果音失敗は無視
      }
    }
  });

  // タイムアップ監視: 10 tick (0.5秒) 間隔で期限超過をチェック
  system.runInterval(() => {
    if (!isEnabled() || isCleared() || isTriggered() || isGameOverActive()) {
      return;
    }
    const currentDay = getCurrentDay();
    const days = getDays();
    if (currentDay <= days) {
      return;
    }

    setBooleanProp(TRIGGERED_KEY, true);
    const formattedMessage = formatDeadlineMessage(getMessage(), days, currentDay);
    triggerGlobalGameOver("f03", formattedMessage);
  }, 10);
}

export const f03Deadline = {
  id: "f03",
  title: "デッドライン",
  isEnabled,
  setEnabled,
  openSettingsForm,
  getStatusSummary,
  init
};
