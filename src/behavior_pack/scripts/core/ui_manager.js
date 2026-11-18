import { system, CommandPermissionLevel } from "@minecraft/server";
import { ActionFormData, ModalFormData, FormCancelationReason } from "@minecraft/server-ui";
import { getCurrentDay } from "./storage.js";
import { assertHostOnly, isHostPlayer } from "./host_auth.js";
import { getFeatures } from "./feature_registry.js";

/**
 * 指定ティック数だけ待機する。
 * @param {number} ticks
 * @returns {Promise<void>}
 */
function waitTicks(ticks) {
  return new Promise((resolve) => {
    system.runTimeout(resolve, ticks);
  });
}

/**
 * UserBusy 時に 2 tick 間隔で最大 20 回リトライしつつフォームを表示する。
 * すべてのフォーム表示前にホスト権限を再確認する。
 * @param {import("@minecraft/server").Player} player
 * @param {ActionFormData | ModalFormData} form
 * @param {number} [maxRetries=20]
 * @param {number} [retryDelayTicks=2]
 */
export async function showFormWithRetry(player, form, maxRetries = 20, retryDelayTicks = 2) {
  if (!isHostPlayer(player)) {
    return undefined;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (!isHostPlayer(player)) {
      return undefined;
    }
    const response = await form.show(player);
    if (
      response.canceled &&
      response.cancelationReason === FormCancelationReason.UserBusy &&
      attempt < maxRetries
    ) {
      await waitTicks(retryDelayTicks);
      continue;
    }
    return response;
  }
  return undefined;
}

/**
 * 一括 ON/OFF 切替フォームを開く（ホスト専用）。
 * @param {import("@minecraft/server").Player} player
 */
export async function openBulkToggleForm(player) {
  if (!isHostPlayer(player)) {
    return;
  }

  const features = getFeatures();
  const form = new ModalFormData().title("一括 ON/OFF 切替");

  for (const feature of features) {
    form.toggle(`${feature.title} を有効にする`, {
      defaultValue: feature.isEnabled()
    });
  }

  const response = await showFormWithRetry(player, form);
  if (!response || response.canceled || !response.formValues) {
    if (response && response.cancelationReason === FormCancelationReason.UserClosed) {
      await openRootMenu(player);
    }
    return;
  }

  let changed = false;
  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const nextEnabled = Boolean(response.formValues[i]);
    if (nextEnabled !== feature.isEnabled()) {
      feature.setEnabled(nextEnabled);
      changed = true;
    }
  }

  try {
    player.sendMessage(
      changed
        ? "§a[のやっきー専用] 一括 ON/OFF 設定を保存しました。"
        : "§7[のやっきー専用] 設定に変更はありませんでした。"
    );
  } catch {
    // 送信失敗は無視
  }

  await openRootMenu(player);
}

/**
 * 親ウィンドウであるルート設定メニューを開く（ホスト専用）。
 * @param {import("@minecraft/server").Player} player
 */
export async function openRootMenu(player) {
  if (!isHostPlayer(player)) {
    return;
  }

  const features = getFeatures();
  const bodyLines = [`現在の経過日数: ${getCurrentDay()}日`];
  for (const feature of features) {
    bodyLines.push(feature.getStatusSummary());
  }

  const form = new ActionFormData()
    .title("のやっきー専用 設定")
    .body(bodyLines.join("\n"))
    .button("一括 ON/OFF 切替");

  for (const feature of features) {
    const label = feature.isEnabled()
      ? `${feature.title} [§aON§r]`
      : `${feature.title} [§7OFF§r]`;
    form.button(label);
  }

  const response = await showFormWithRetry(player, form);
  if (!response || response.canceled || response.selection === undefined) {
    return;
  }

  if (response.selection === 0) {
    await openBulkToggleForm(player);
    return;
  }

  const targetFeature = features[response.selection - 1];
  if (targetFeature && typeof targetFeature.openSettingsForm === "function") {
    await targetFeature.openSettingsForm(player, () => openRootMenu(player));
  }
}

/**
 * /noyakki_only:config カスタムコマンドを登録する（ハードコア対応・ホスト専用）。
 */
export function registerConfigCommand() {
  system.beforeEvents.startup.subscribe((event) => {
    event.customCommandRegistry.registerCommand(
      {
        name: "noyakki_only:config",
        description: "のやっきー専用アドオンの設定画面を開きます（ホストのみ利用可能）",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false
      },
      (origin) => {
        const guard = assertHostOnly(origin);
        if (!guard.ok) {
          return guard.result;
        }
        const hostPlayer = guard.player;
        system.run(() => {
          openRootMenu(hostPlayer);
        });
        return guard.result;
      }
    );
  });
}
