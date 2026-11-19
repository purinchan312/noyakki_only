import { world, system, EquipmentSlot, GameMode } from "@minecraft/server";
import { ModalFormData, FormCancelationReason } from "@minecraft/server-ui";
import {
  makeKey,
  getBooleanProp,
  setBooleanProp,
  getNumberProp,
  setNumberProp,
  getJsonProp,
  setJsonProp,
  getCurrentDay
} from "../core/storage.js";
import { isHostPlayer } from "../core/host_auth.js";
import { showFormWithRetry } from "../core/ui_manager.js";
import {
  ITEM_GROUPS,
  GROUP_BY_ID,
  WORKSTATION_UI_BLOCKS,
  stripMinecraftNamespace,
  getGroupUnlockDay,
  classifyItemGroups,
  resolveRestrictingGroup
} from "./f02_item_groups.js";

const ENABLED_KEY = makeKey("f02", "enabled");
const DAYS_JSON_KEY = makeKey("f02", "days_json");
const LAST_DAY_KEY = makeKey("f02", "last_day");

const NOTIFY_COOLDOWN_TICKS = 20;
const HOTBAR_SIZE = 9;
const PROTECTED_SLOTS = [
  EquipmentSlot.Head,
  EquipmentSlot.Chest,
  EquipmentSlot.Legs,
  EquipmentSlot.Feet,
  EquipmentSlot.Offhand
];

const lastNotifyTickByPlayer = new Map();
const disarmingPlayers = new Set();

function isEnabled() {
  return getBooleanProp(ENABLED_KEY, false);
}

function getDaysMap() {
  return getJsonProp(DAYS_JSON_KEY, {});
}

/**
 * 機能の有効/無効を切り替え、初回有効化時は現在日数を記録して遡及通知を抑止する。
 * 有効化時は既に手に持っている未解放アイテムを即時解除する。
 * @param {boolean} enabled
 */
function setEnabled(enabled) {
  const wasEnabled = isEnabled();
  const nextEnabled = Boolean(enabled);
  setBooleanProp(ENABLED_KEY, nextEnabled);
  if (!wasEnabled && nextEnabled && getNumberProp(LAST_DAY_KEY, -1) === -1) {
    setNumberProp(LAST_DAY_KEY, getCurrentDay());
  }
  if (nextEnabled) {
    system.run(() => {
      enforceAllPlayersEquipment();
    });
  }
}

/**
 * サバイバル・アドベンチャーの制限対象プレイヤーか判定する。
 * @param {import("@minecraft/server").Player} player
 * @returns {boolean}
 */
function isPlayerRestricted(player) {
  if (!player || !player.isValid || player.typeId !== "minecraft:player") {
    return false;
  }
  try {
    const mode = player.getGameMode();
    return mode === GameMode.Survival || mode === GameMode.Adventure;
  } catch {
    return true;
  }
}

/**
 * 指定グループが現在未解放か判定し、判定結果オブジェクトを返す。
 * @param {string} groupId
 * @param {number} currentDay
 * @param {Record<string, number>} daysMap
 */
function evaluateGroupAccess(groupId, currentDay, daysMap) {
  const group = GROUP_BY_ID.get(groupId);
  const unlockDay = getGroupUnlockDay(groupId, daysMap);
  const allowed = unlockDay >= 0 && currentDay >= unlockDay;
  return {
    allowed,
    groupId,
    groupName: group ? group.name : groupId,
    unlockDay
  };
}

/**
 * アイテムスタックまたはアイテムIDが現在使用可能か判定する。
 * @param {import("@minecraft/server").ItemStack | string | undefined} itemStackOrTypeId
 * @param {number} currentDay
 * @param {Record<string, number>} daysMap
 */
function evaluateItemAccess(itemStackOrTypeId, currentDay, daysMap) {
  const groupIds = classifyItemGroups(itemStackOrTypeId);
  if (groupIds.length === 0) {
    return {
      allowed: false,
      groupId: undefined,
      groupName: undefined,
      unlockDay: -1
    };
  }
  const targetGroupId = resolveRestrictingGroup(groupIds, daysMap);
  if (!targetGroupId) {
    return {
      allowed: false,
      groupId: undefined,
      groupName: undefined,
      unlockDay: -1
    };
  }
  return evaluateGroupAccess(targetGroupId, currentDay, daysMap);
}

/**
 * プレイヤーが手に持っているアイテム（メインハンド優先、空ならオフハンド）を取得する。
 * @param {import("@minecraft/server").Player} player
 * @returns {import("@minecraft/server").ItemStack | undefined}
 */
function getHeldItemForPlacement(player) {
  try {
    const eq = player.getComponent("minecraft:equippable");
    if (!eq) {
      return undefined;
    }
    return eq.getEquipment(EquipmentSlot.Mainhand) ?? eq.getEquipment(EquipmentSlot.Offhand);
  } catch {
    return undefined;
  }
}

/**
 * クールダウン付きで制限通知（アクションバー＋効果音）を送信する。
 * @param {import("@minecraft/server").Player} player
 * @param {{ groupId?: string, groupName?: string, unlockDay: number }} denial
 * @param {number} currentDay
 */
function notifyBlocked(player, denial, currentDay) {
  if (!player || !player.isValid) {
    return;
  }
  const nowTick = system.currentTick;
  const lastTick = lastNotifyTickByPlayer.get(player.id);
  if (typeof lastTick === "number" && nowTick - lastTick < NOTIFY_COOLDOWN_TICKS) {
    return;
  }
  lastNotifyTickByPlayer.set(player.id, nowTick);

  let text;
  if (!denial.groupId) {
    text = "§c[文明開化] このアイテムは許可グループに含まれていません";
  } else if (denial.unlockDay === -1) {
    text = `§c[文明開化] ${denial.groupName} は使用禁止に設定されています`;
  } else {
    text = `§c[文明開化] ${denial.groupName} は ${denial.unlockDay}日経過後に解放されます（現在: ${currentDay}日）`;
  }

  try {
    player.onScreenDisplay.setActionBar(text);
  } catch {
    // アクションバー失敗は無視
  }
  try {
    player.playSound("note.bass");
  } catch {
    // 効果音失敗は無視
  }
}

/**
 * beforeEvents 内（読み取り専用制約下）から安全に制限通知をスケジュールする。
 * @param {import("@minecraft/server").Player} player
 * @param {{ groupId?: string, groupName?: string, unlockDay: number }} denial
 * @param {number} currentDay
 */
function scheduleBlockedNotification(player, denial, currentDay) {
  system.run(() => {
    notifyBlocked(player, denial, currentDay);
  });
}

/**
 * 指定スロット範囲（startSlot〜endSlot、skipSlot除外）へアイテムを格納し、入り切らなかった分を返す。
 * すべて格納できた場合は undefined を返す。
 * @param {import("@minecraft/server").Container} container
 * @param {import("@minecraft/server").ItemStack} itemStack
 * @param {number} startSlot
 * @param {number} endSlot
 * @param {number} [skipSlot=-1]
 * @returns {import("@minecraft/server").ItemStack | undefined}
 */
function storeItemInSlotRange(container, itemStack, startSlot, endSlot, skipSlot = -1) {
  if (!container || !itemStack || itemStack.amount <= 0) {
    return itemStack;
  }
  const maxSlot = Math.min(endSlot, container.size - 1);
  if (startSlot > maxSlot) {
    return itemStack.clone();
  }

  const remaining = itemStack.clone();

  // 第1パス: 既存スタックへの合流を試みる
  if (remaining.maxAmount > 1) {
    for (let slot = startSlot; slot <= maxSlot; slot++) {
      if (slot === skipSlot) {
        continue;
      }
      let existing;
      try {
        existing = container.getItem(slot);
      } catch {
        existing = undefined;
      }
      if (!existing || existing.amount >= existing.maxAmount) {
        continue;
      }
      let canStack = false;
      try {
        canStack = existing.isStackableWith(remaining);
      } catch {
        canStack = false;
      }
      if (!canStack) {
        continue;
      }

      const moveAmount = Math.min(existing.maxAmount - existing.amount, remaining.amount);
      if (moveAmount <= 0) {
        continue;
      }

      const updatedExisting = existing.clone();
      updatedExisting.amount = existing.amount + moveAmount;
      try {
        container.setItem(slot, updatedExisting);
      } catch {
        continue;
      }

      if (moveAmount >= remaining.amount) {
        return undefined;
      }
      remaining.amount -= moveAmount;
    }
  }

  // 第2パス: 空スロットへ格納する
  for (let slot = startSlot; slot <= maxSlot; slot++) {
    if (slot === skipSlot) {
      continue;
    }
    let existing;
    try {
      existing = container.getItem(slot);
    } catch {
      continue;
    }
    if (existing) {
      continue;
    }
    try {
      container.setItem(slot, remaining);
      return undefined;
    } catch {
      // 格納失敗時は別スロットを試す
    }
  }

  return remaining;
}

/**
 * 防具・オフハンドから外したアイテムをメインハンド以外の枠（バックパック優先）へ戻し、満杯時は足元へドロップする。
 * @param {import("@minecraft/server").Player} player
 * @param {import("@minecraft/server").ItemStack} itemStack
 */
function returnItemAvoidingMainhand(player, itemStack) {
  if (!itemStack) {
    return;
  }

  let remaining = itemStack.clone();
  try {
    const inventory = player.getComponent("minecraft:inventory");
    const container = inventory ? inventory.container : undefined;
    if (container && container.size > 0) {
      const selectedSlot =
        typeof player.selectedSlotIndex === "number" ? player.selectedSlotIndex : 0;

      if (container.size > HOTBAR_SIZE) {
        remaining = storeItemInSlotRange(
          container,
          remaining,
          HOTBAR_SIZE,
          container.size - 1,
          -1
        );
        if (!remaining) {
          return;
        }
      }

      const hotbarEnd = Math.min(HOTBAR_SIZE - 1, container.size - 1);
      remaining = storeItemInSlotRange(container, remaining, 0, hotbarEnd, selectedSlot);
      if (!remaining) {
        return;
      }
    }
  } catch {
    // インベントリ返却失敗時は足元スポーンへフォールバック
  }

  if (remaining) {
    try {
      player.dimension.spawnItem(remaining, player.location);
    } catch {
      // スポーン失敗は無視
    }
  }
}

/**
 * 選択中以外のホットバースロットから安全な枠（空または解放済みアイテム）を探す。
 * @param {import("@minecraft/server").Container} container
 * @param {number} selectedSlot
 * @param {number} currentDay
 * @param {Record<string, number>} daysMap
 * @param {number | undefined} previousSlotHint
 * @returns {number | undefined}
 */
function findSafeHotbarSlot(container, selectedSlot, currentDay, daysMap, previousSlotHint) {
  const hotbarCount = Math.min(HOTBAR_SIZE, container.size);
  if (hotbarCount <= 1) {
    return undefined;
  }

  const isSafeSlot = (slot) => {
    if (slot === selectedSlot || slot < 0 || slot >= hotbarCount) {
      return false;
    }
    try {
      const slotItem = container.getItem(slot);
      return !slotItem || evaluateItemAccess(slotItem, currentDay, daysMap).allowed;
    } catch {
      return false;
    }
  };

  const hasValidHint =
    typeof previousSlotHint === "number" &&
    Number.isInteger(previousSlotHint) &&
    previousSlotHint >= 0 &&
    previousSlotHint < hotbarCount &&
    previousSlotHint !== selectedSlot;

  const scrolledRight = hasValidHint && (previousSlotHint + 1) % hotbarCount === selectedSlot;
  const scrolledLeft =
    hasValidHint && (previousSlotHint + hotbarCount - 1) % hotbarCount === selectedSlot;

  if (hasValidHint && !scrolledRight && !scrolledLeft && isSafeSlot(previousSlotHint)) {
    return previousSlotHint;
  }

  const stepDir = scrolledLeft ? hotbarCount - 1 : 1;
  for (let step = 1; step < hotbarCount; step++) {
    const candidate = (selectedSlot + step * stepDir) % hotbarCount;
    if (isSafeSlot(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * 対象プレイヤーの防具・オフハンド・メインハンドを検査し、未解放アイテムを即座に解除する。
 * @param {import("@minecraft/server").Player} player
 * @param {number} currentDay
 * @param {Record<string, number>} daysMap
 * @param {number | undefined} [previousSlotHint]
 */
function enforcePlayerEquipment(player, currentDay, daysMap, previousSlotHint = undefined) {
  if (!isEnabled() || !isPlayerRestricted(player)) {
    return;
  }
  if (disarmingPlayers.has(player.id)) {
    return;
  }

  disarmingPlayers.add(player.id);
  try {
    // 1. 防具4枠・オフハンドの強制解除
    let equippable;
    try {
      equippable = player.getComponent("minecraft:equippable");
    } catch {
      equippable = undefined;
    }
    if (equippable) {
      for (const slot of PROTECTED_SLOTS) {
        let equipped;
        try {
          equipped = equippable.getEquipment(slot);
        } catch {
          equipped = undefined;
        }
        if (!equipped) {
          continue;
        }
        const access = evaluateItemAccess(equipped, currentDay, daysMap);
        if (access.allowed) {
          continue;
        }
        const itemCopy = typeof equipped.clone === "function" ? equipped.clone() : equipped;
        try {
          equippable.setEquipment(slot, undefined);
        } catch {
          continue;
        }
        returnItemAvoidingMainhand(player, itemCopy);
        notifyBlocked(player, access, currentDay);
      }
    }

    // 2. メインハンド（選択中ホットバースロット）の強制解除
    let container;
    try {
      const inventory = player.getComponent("minecraft:inventory");
      container = inventory ? inventory.container : undefined;
    } catch {
      container = undefined;
    }
    if (!container || container.size <= 0) {
      return;
    }

    let selectedSlot;
    try {
      selectedSlot = player.selectedSlotIndex;
    } catch {
      return;
    }
    if (typeof selectedSlot !== "number" || selectedSlot < 0 || selectedSlot >= container.size) {
      return;
    }

    let mainItem;
    try {
      mainItem = container.getItem(selectedSlot);
    } catch {
      mainItem = undefined;
    }
    if (!mainItem) {
      return;
    }

    const mainAccess = evaluateItemAccess(mainItem, currentDay, daysMap);
    if (mainAccess.allowed) {
      return;
    }

    const leftover =
      container.size > HOTBAR_SIZE
        ? storeItemInSlotRange(container, mainItem.clone(), HOTBAR_SIZE, container.size - 1, -1)
        : mainItem.clone();

    if (!leftover) {
      try {
        container.setItem(selectedSlot, undefined);
        notifyBlocked(player, mainAccess, currentDay);
      } catch {
        // 既にバックパックへ退避済みのため、クリア失敗時はカーソル退避のみ試みて重複ドロップを防ぐ
        const fallbackSlot = findSafeHotbarSlot(
          container,
          selectedSlot,
          currentDay,
          daysMap,
          previousSlotHint
        );
        if (fallbackSlot !== undefined) {
          try {
            player.selectedSlotIndex = fallbackSlot;
            notifyBlocked(player, mainAccess, currentDay);
          } catch {
            // 無視
          }
        }
      }
      return;
    }

    const remainingItem = leftover;
    if (leftover.amount < mainItem.amount) {
      try {
        container.setItem(selectedSlot, leftover);
      } catch {
        // 部分更新失敗時は次の回避処理へ進む
      }
    }

    const safeSlot = findSafeHotbarSlot(
      container,
      selectedSlot,
      currentDay,
      daysMap,
      previousSlotHint
    );
    if (safeSlot !== undefined) {
      try {
        player.selectedSlotIndex = safeSlot;
        notifyBlocked(player, mainAccess, currentDay);
        return;
      } catch {
        // スロット切替失敗時は足元ドロップへ進む
      }
    }

    try {
      container.setItem(selectedSlot, undefined);
      player.dimension.spawnItem(remainingItem, player.location);
      notifyBlocked(player, mainAccess, currentDay);
    } catch {
      // ドロップ失敗は無視
    }
  } finally {
    disarmingPlayers.delete(player.id);
  }
}

/**
 * 全在室プレイヤーの手持ち・装備を一括検査し、未解放アイテムを解除する。
 */
function enforceAllPlayersEquipment() {
  if (!isEnabled()) {
    return;
  }
  const currentDay = getCurrentDay();
  const daysMap = getDaysMap();
  for (const player of world.getAllPlayers()) {
    enforcePlayerEquipment(player, currentDay, daysMap);
  }
}

/**
 * 文明開化の個別設定フォームを開く（ホスト専用）。
 * @param {import("@minecraft/server").Player} player
 * @param {() => Promise<void>} onBack
 */
async function openSettingsForm(player, onBack) {
  if (!isHostPlayer(player)) {
    return;
  }

  const daysMap = getDaysMap();
  const form = new ModalFormData()
    .title("文明開化 設定")
    .toggle("文明開化を有効にする", { defaultValue: isEnabled() })
    .toggle("解放日数をすべて初期値にリセットする", { defaultValue: false });

  for (const group of ITEM_GROUPS) {
    const currentVal = getGroupUnlockDay(group.id, daysMap);
    form.textField(
      `${group.name}（初期値: ${group.defaultDay}）`,
      "-1以上の半角整数（0:開始時 / -1:禁止）",
      { defaultValue: String(currentVal) }
    );
  }
  form.submitButton("保存して戻る");

  const response = await showFormWithRetry(player, form);
  if (!response || response.canceled || !response.formValues) {
    if (response && response.cancelationReason === FormCancelationReason.UserClosed && onBack) {
      await onBack();
    }
    return;
  }

  const nextEnabled = Boolean(response.formValues[0]);
  const shouldReset = Boolean(response.formValues[1]);

  if (shouldReset) {
    setJsonProp(DAYS_JSON_KEY, {});
    setEnabled(nextEnabled);
    try {
      player.sendMessage("§a[文明開化] 全グループの解放日数を初期値にリセットしました。");
    } catch {
      // 送信失敗は無視
    }
    if (onBack) {
      await onBack();
    }
    return;
  }

  const nextDaysMap = {};
  for (let i = 0; i < ITEM_GROUPS.length; i++) {
    const group = ITEM_GROUPS[i];
    const rawValue = String(response.formValues[i + 2] ?? "").trim();
    if (!/^-?\d+$/.test(rawValue)) {
      try {
        player.sendMessage(
          `§c[文明開化] 「${group.name}」の日数は -1 以上の半角整数で入力してください。`
        );
      } catch {
        // 送信失敗は無視
      }
      return;
    }

    const parsedDay = Number(rawValue);
    if (!Number.isSafeInteger(parsedDay) || parsedDay < -1) {
      try {
        player.sendMessage(`§c[文明開化] 「${group.name}」の解放日数が不正です（-1以上）。`);
      } catch {
        // 送信失敗は無視
      }
      return;
    }
    nextDaysMap[group.id] = parsedDay;
  }

  setJsonProp(DAYS_JSON_KEY, nextDaysMap);
  setEnabled(nextEnabled);

  try {
    player.sendMessage("§a[文明開化] 設定を保存しました。");
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
    return "・文明開化: OFF";
  }

  const currentDay = getCurrentDay();
  const daysMap = getDaysMap();
  const totalCount = ITEM_GROUPS.length;
  let unlockedCount = 0;
  let nextDay;

  for (const group of ITEM_GROUPS) {
    const unlockDay = getGroupUnlockDay(group.id, daysMap);
    if (unlockDay >= 0 && currentDay >= unlockDay) {
      unlockedCount++;
    } else if (unlockDay >= 0 && (nextDay === undefined || unlockDay < nextDay)) {
      nextDay = unlockDay;
    }
  }

  if (unlockedCount === totalCount) {
    return `・文明開化: ON（解放済み ${unlockedCount}/${totalCount} グループ / 全グループ解放済み）`;
  }
  if (nextDay !== undefined) {
    return `・文明開化: ON（解放済み ${unlockedCount}/${totalCount} グループ / 次回解放: ${nextDay}日）`;
  }
  return `・文明開化: ON（解放済み ${unlockedCount}/${totalCount} グループ / 次回解放なし）`;
}

/**
 * イベントシグナルを安全に購読する（環境非対応や単一購読失敗で他処理を止めない）。
 * @param {{ subscribe?: (cb: (ev: any) => void) => void } | undefined} signal
 * @param {(ev: any) => void} callback
 */
function subscribeSafely(signal, callback) {
  if (!signal || typeof signal.subscribe !== "function") {
    return;
  }
  try {
    signal.subscribe(callback);
  } catch (err) {
    console.error("[noyakki_only][f02] subscribe failed:", err);
  }
}

/**
 * 日替わり解放通知・アクション制限・手持ち/装備強制解除・ポータル除去を初期化する。
 */
function init() {
  // 1. 日替わり解放チェック (20 tick 間隔)
  system.runInterval(() => {
    if (!isEnabled()) {
      return;
    }
    const currentDay = getCurrentDay();
    const lastDay = getNumberProp(LAST_DAY_KEY, -1);
    if (lastDay === -1) {
      setNumberProp(LAST_DAY_KEY, currentDay);
      return;
    }
    if (currentDay <= lastDay) {
      return;
    }

    const daysMap = getDaysMap();
    const newlyUnlocked = [];
    for (const group of ITEM_GROUPS) {
      const unlockDay = getGroupUnlockDay(group.id, daysMap);
      if (unlockDay >= 0 && unlockDay > lastDay && unlockDay <= currentDay) {
        newlyUnlocked.push(group.name);
      }
    }

    setNumberProp(LAST_DAY_KEY, currentDay);

    if (newlyUnlocked.length > 0) {
      const notice = `§a[文明開化] ${currentDay}日経過により「${newlyUnlocked.join("・")}」が解放されました！`;
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
    }
  }, 20);

  // 2. アイテム使用制限
  subscribeSafely(world.beforeEvents.itemUse, (event) => {
    if (!isEnabled()) {
      return;
    }
    const player = event.source;
    if (!isPlayerRestricted(player)) {
      return;
    }
    const currentDay = getCurrentDay();
    const access = evaluateItemAccess(event.itemStack, currentDay, getDaysMap());
    if (!access.allowed) {
      event.cancel = true;
      scheduleBlockedNotification(player, access, currentDay);
    }
  });

  // 3. ブロックインタラクト・設置制限（設備UIは透過・ベッド/ポータル/未解放アイテム使用と設置を遮断）
  subscribeSafely(world.beforeEvents.playerInteractWithBlock, (event) => {
    if (!isEnabled()) {
      return;
    }
    const player = event.player;
    if (!isPlayerRestricted(player)) {
      return;
    }

    const blockId = event.block?.typeId ?? "";
    const shortBlockId = stripMinecraftNamespace(blockId);
    const itemStack = event.itemStack;
    const itemId = itemStack?.typeId ?? "";
    const currentDay = getCurrentDay();
    const daysMap = getDaysMap();

    let isSneaking = false;
    try {
      isSneaking = Boolean(player.isSneaking);
    } catch {
      isSneaking = false;
    }

    // ベッド就寝・リスポーン設定の制限
    if (shortBlockId === "bed" || shortBlockId.endsWith("_bed")) {
      if (!isSneaking || !itemStack) {
        const bedAccess = evaluateGroupAccess("stone_bed", currentDay, daysMap);
        if (!bedAccess.allowed) {
          event.cancel = true;
          scheduleBlockedNotification(player, bedAccess, currentDay);
          return;
        }
      }
    }

    // エンドポータルフレームへのエンダーアイ装填制限
    if (blockId === "minecraft:end_portal_frame" && itemId === "minecraft:ender_eye") {
      const endAccess = evaluateGroupAccess("end_portal", currentDay, daysMap);
      if (!endAccess.allowed) {
        event.cancel = true;
        scheduleBlockedNotification(player, endAccess, currentDay);
        return;
      }
    }

    // 黒曜石への直接ネザーポータル着火制限（iron解放後も nether_portal 未解放なら遮断）
    if (
      blockId === "minecraft:obsidian" &&
      (itemId === "minecraft:flint_and_steel" || itemId === "minecraft:fire_charge")
    ) {
      const portalAccess = evaluateGroupAccess("nether_portal", currentDay, daysMap);
      if (!portalAccess.allowed) {
        event.cancel = true;
        scheduleBlockedNotification(player, portalAccess, currentDay);
        return;
      }
    }

    // 作業台・かまど・チェスト等の設備UIを開くだけの操作は許可する
    if (!isSneaking && WORKSTATION_UI_BLOCKS.has(blockId)) {
      return;
    }

    // 手持ちアイテム（メインハンドまたはオフハンド）が未解放ならブロック設置・作用を遮断する
    const heldItem = itemStack ?? getHeldItemForPlacement(player);
    if (heldItem) {
      const access = evaluateItemAccess(heldItem, currentDay, daysMap);
      if (!access.allowed) {
        event.cancel = true;
        scheduleBlockedNotification(player, access, currentDay);
      }
    }
  });

  // 4. 採掘・ブロック破壊制限（素手は常時許可・同一ティック先行対策の二重ガード）
  subscribeSafely(world.beforeEvents.playerBreakBlock, (event) => {
    if (!isEnabled()) {
      return;
    }
    const player = event.player;
    if (!isPlayerRestricted(player)) {
      return;
    }
    if (!event.itemStack) {
      return;
    }

    const currentDay = getCurrentDay();
    const access = evaluateItemAccess(event.itemStack, currentDay, getDaysMap());
    if (!access.allowed) {
      event.cancel = true;
      scheduleBlockedNotification(player, access, currentDay);
    }
  });

  // 5. 手持ち（メインハンド）・オフハンド・防具装備の即時強制解除（イベント駆動）
  subscribeSafely(world.afterEvents.playerHotbarSelectedSlotChange, (event) => {
    if (!isEnabled()) {
      return;
    }
    enforcePlayerEquipment(
      event.player,
      getCurrentDay(),
      getDaysMap(),
      event.previousSlotSelected
    );
  });

  subscribeSafely(world.afterEvents.playerInventoryItemChange, (event) => {
    if (!isEnabled()) {
      return;
    }
    enforcePlayerEquipment(event.player, getCurrentDay(), getDaysMap());
  });

  // 6. 手持ち・オフハンド・防具装備の強制解除（5 tick 間隔の定期補完）
  system.runInterval(() => {
    enforceAllPlayersEquipment();
  }, 5);

  // 7. 溶岩延焼等によるネザーポータル生成・進入の阻止（15 tick 間隔）
  system.runInterval(() => {
    if (!isEnabled()) {
      return;
    }
    const currentDay = getCurrentDay();
    const portalAccess = evaluateGroupAccess("nether_portal", currentDay, getDaysMap());
    if (portalAccess.allowed) {
      return;
    }

    for (const player of world.getAllPlayers()) {
      if (!isPlayerRestricted(player)) {
        continue;
      }
      try {
        const feetLoc = player.location;
        const headLoc = { x: feetLoc.x, y: feetLoc.y + 1, z: feetLoc.z };
        const feetBlock = player.dimension.getBlock(feetLoc);
        const headBlock = player.dimension.getBlock(headLoc);
        let cleared = false;

        if (feetBlock && feetBlock.typeId === "minecraft:portal") {
          feetBlock.setType("minecraft:air");
          cleared = true;
        }
        if (headBlock && headBlock.typeId === "minecraft:portal") {
          headBlock.setType("minecraft:air");
          cleared = true;
        }

        if (cleared) {
          notifyBlocked(player, portalAccess, currentDay);
        }
      } catch {
        // チャンク境界や未ロード位置での例外は無視
      }
    }
  }, 15);
}

export const f02CivilizationDawn = {
  id: "f02",
  title: "文明開化",
  isEnabled,
  setEnabled,
  openSettingsForm,
  getStatusSummary,
  init
};
