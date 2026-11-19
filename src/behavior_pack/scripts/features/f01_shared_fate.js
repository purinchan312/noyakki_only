import { world, system } from "@minecraft/server";
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

const ENABLED_KEY = makeKey("f01", "enabled");
const DAYS_KEY = makeKey("f01", "days");
const MSG_KEY = makeKey("f01", "msg");
const NOTIFIED_KEY = makeKey("f01", "notified");
const TRIGGERED_KEY = makeKey("f01", "triggered");

const DEFAULT_DAYS = 10;
const DEFAULT_MSG = "{day}日以内にやられたためワールドを終わります";

function isEnabled() {
  return getBooleanProp(ENABLED_KEY, false);
}

function getDays() {
  return getNumberProp(DAYS_KEY, DEFAULT_DAYS);
}

function getMessage() {
  return getStringProp(MSG_KEY, DEFAULT_MSG);
}

function isNotified() {
  return getBooleanProp(NOTIFIED_KEY, false);
}

function isTriggered() {
  return getBooleanProp(TRIGGERED_KEY, false);
}

/**
 * 機能の有効/無効を切り替え、適用期間内の再有効化時は満了通知フラグを整える。
 * @param {boolean} enabled
 */
function setEnabled(enabled) {
  const wasEnabled = isEnabled();
  const nextEnabled = Boolean(enabled);
  setBooleanProp(ENABLED_KEY, nextEnabled);
  if (!wasEnabled && nextEnabled && getCurrentDay() <= getDays()) {
    setBooleanProp(NOTIFIED_KEY, false);
  }
}

/**
 * テンプレート文字列内のプレースホルダを実値へ置換する。
 * @param {string} template
 * @param {number} days
 * @param {number} currentDay
 * @param {string} playerName
 * @returns {string}
 */
function formatGameOverMessage(template, days, currentDay, playerName) {
  return template
    .replace(/\{day\}/g, () => String(days))
    .replace(/\{current_day\}/g, () => String(currentDay))
    .replace(/\{player\}/g, () => String(playerName));
}

/**
 * 一蓮托生の個別設定フォームを開く（ホスト専用）。
 * @param {import("@minecraft/server").Player} player
 * @param {() => Promise<void>} onBack
 */
async function openSettingsForm(player, onBack) {
  if (!isHostPlayer(player)) {
    return;
  }

  const form = new ModalFormData()
    .title("一蓮托生 設定")
    .toggle("一蓮托生を有効にする", { defaultValue: isEnabled() })
    .textField("適用日数（ゲーム内経過日数）", "0以上の半角整数（例: 10）", {
      defaultValue: String(getDays())
    })
    .textField("ゲームオーバーメッセージ", DEFAULT_MSG, {
      defaultValue: getMessage()
    })
    .submitButton("保存して戻る");

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
      player.sendMessage("§c[一蓮托生] 適用日数は 0 以上の半角整数で入力してください。");
    } catch {
      // 送信失敗は無視
    }
    return;
  }

  const parsedDays = Number(daysRaw);
  if (!Number.isSafeInteger(parsedDays) || parsedDays < 0) {
    try {
      player.sendMessage("§c[一蓮托生] 適用日数の値が不正です。");
    } catch {
      // 送信失敗は無視
    }
    return;
  }

  if (msgRaw.length === 0) {
    try {
      player.sendMessage("§c[一蓮托生] ゲームオーバーメッセージは空文字にできません。");
    } catch {
      // 送信失敗は無視
    }
    return;
  }

  setNumberProp(DAYS_KEY, parsedDays);
  setStringProp(MSG_KEY, msgRaw);
  setEnabled(nextEnabled);

  // 適用日数を延長した場合などに期間満了アナウンスが再度機能するようリセット
  if (getCurrentDay() <= parsedDays) {
    setBooleanProp(NOTIFIED_KEY, false);
  }

  try {
    player.sendMessage("§a[一蓮托生] 設定を保存しました。");
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
    return "・一蓮托生: OFF";
  }
  const days = getDays();
  const currentDay = getCurrentDay();
  if (currentDay <= days) {
    return `・一蓮托生: ON（${days}日まで有効 / 残り ${days - currentDay}日）`;
  }
  return "・一蓮托生: ON（期間満了済み・個別死亡モード）";
}

/**
 * 期間満了監視とプレイヤー死亡時の一蓮托生ゲームオーバー処理を初期化する。
 */
function init() {
  // 20 tick (1秒) 間隔で連帯責任期間の満了を監視
  system.runInterval(() => {
    if (!isEnabled() || isTriggered() || isGameOverActive() || isNotified()) {
      return;
    }
    const days = getDays();
    if (getCurrentDay() <= days) {
      return;
    }

    setBooleanProp(NOTIFIED_KEY, true);
    const notice = `§a[一蓮托生] 連帯責任期間（${days}日）を生き延びました！これ以降は個別死亡となります。`;
    for (const player of world.getAllPlayers()) {
      if (!player || !player.isValid) {
        continue;
      }
      try {
        player.sendMessage(notice);
      } catch {
        // チャット送信失敗は無視
      }
      try {
        player.playSound("random.levelup");
      } catch {
        // 効果音失敗は無視
      }
    }
  }, 20);

  // プレイヤー死亡検知と連帯ゲームオーバー発動
  world.afterEvents.entityDie.subscribe((event) => {
    const deadEntity = event.deadEntity;
    if (!deadEntity || deadEntity.typeId !== "minecraft:player") {
      return;
    }
    if (!isEnabled() || isTriggered() || isGameOverActive()) {
      return;
    }

    const currentDay = getCurrentDay();
    const days = getDays();
    if (currentDay > days) {
      return;
    }

    setBooleanProp(TRIGGERED_KEY, true);
    const playerName = deadEntity.name || deadEntity.nameTag || "プレイヤー";
    const formattedMessage = formatGameOverMessage(getMessage(), days, currentDay, playerName);
    triggerGlobalGameOver("f01", formattedMessage);
  });
}

export const f01SharedFate = {
  id: "f01",
  title: "一蓮托生",
  isEnabled,
  setEnabled,
  openSettingsForm,
  getStatusSummary,
  init
};
