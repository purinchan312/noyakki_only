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
  isBlockActionItem,
  getGroupUnlockDay,
  classifyItemGroups,
  resolveRestrictingGroup
} from "./f02_item_groups.js";

const ENABLED_KEY = makeKey("f02", "enabled");
const DAYS_JSON_KEY = makeKey("f02", "days_json");
const LAST_DAY_KEY = makeKey("f02", "last_day");

const NOTIFY_COOLDOWN_TICKS = 20;
const lastNotifyTickByPlayer = new Map();
const weaknessAppliedPlayers = new Set();

function isEnabled() {
  return getBooleanProp(ENABLED_KEY, false);
}

function getDaysMap() {
  return getJsonProp(DAYS_JSON_KEY, {});
}

/**
 * 機能の有効/無効を切り替え、初回有効化時は現在日数を記録して遡及通知を抑止する。
 * @param {boolean} enabled
 */
function setEnabled(enabled) {
  const wasEnabled = isEnabled();
  const nextEnabled = Boolean(enabled);
  setBooleanProp(ENABLED_KEY, nextEnabled);
  if (!wasEnabled && nextEnabled && getNumberProp(LAST_DAY_KEY, -1) === -1) {
    setNumberProp(LAST_DAY_KEY, getCurrentDay());
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
 * 装備解除したアイテムをプレイヤーのインベントリへ戻し、満杯なら足元へドロップする。
 * @param {import("@minecraft/server").Player} player
 * @param {import("@minecraft/server").ItemStack} itemStack
 */
function returnItemToPlayer(player, itemStack) {
  try {
    const inventory = player.getComponent("minecraft:inventory");
    const container = inventory ? inventory.container : undefined;
    if (container) {
      const leftover = container.addItem(itemStack);
      if (!leftover) {
        return;
      }
      player.dimension.spawnItem(leftover, player.location);
      return;
    }
  } catch {
    // インベントリ返却失敗時は足元スポーンへフォールバック
  }

  try {
    player.dimension.spawnItem(itemStack, player.location);
  } catch {
    // スポーン失敗は無視
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
 * 日替わり解放通知・アクション制限・近接無力化・装備強制解除・ポータル除去を初期化する。
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
  world.beforeEvents.itemUse.subscribe((event) => {
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

  // 3. ブロック設置制限
  world.beforeEvents.playerPlaceBlock.subscribe((event) => {
    if (!isEnabled()) {
      return;
    }
    const player = event.player;
    if (!isPlayerRestricted(player)) {
      return;
    }

    const currentDay = getCurrentDay();
    const daysMap = getDaysMap();
    const blockTypeId = event.permutationToPlace?.type?.id;
    let targetItemOrId = blockTypeId;

    if (!targetItemOrId) {
      try {
        const eq = player.getComponent("minecraft:equippable");
        targetItemOrId = eq ? eq.getEquipment(EquipmentSlot.Mainhand) : undefined;
      } catch {
        targetItemOrId = undefined;
      }
    }

    const access = evaluateItemAccess(targetItemOrId, currentDay, daysMap);
    if (!access.allowed) {
      event.cancel = true;
      scheduleBlockedNotification(player, access, currentDay);
    }
  });

  // 4. ブロックインタラクト制限（設備UIは透過・ベッド/ポータル/作用アイテムのみ遮断）
  world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
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

    // ベッド就寝・リスポーン設定の制限
    if (shortBlockId === "bed" || shortBlockId.endsWith("_bed")) {
      let isSneaking = false;
      try {
        isSneaking = Boolean(player.isSneaking);
      } catch {
        isSneaking = false;
      }
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
    let isSneaking = false;
    try {
      isSneaking = Boolean(player.isSneaking);
    } catch {
      isSneaking = false;
    }
    if (!isSneaking && WORKSTATION_UI_BLOCKS.has(blockId)) {
      return;
    }

    // ブロックへ直接作用するアイテムの制限
    if (itemStack && isBlockActionItem(itemId)) {
      const access = evaluateItemAccess(itemStack, currentDay, daysMap);
      if (!access.allowed) {
        event.cancel = true;
        scheduleBlockedNotification(player, access, currentDay);
      }
    }
  });

  // 5. 採掘・ブロック破壊制限（素手は常時許可）
  world.beforeEvents.playerBreakBlock.subscribe((event) => {
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

  // 6. 近接攻撃の無力化（5 tick 間隔: メインハンドに未解放アイテム所持中のみ weakness 255 付与）
  system.runInterval(() => {
    if (!isEnabled()) {
      if (weaknessAppliedPlayers.size > 0) {
        for (const player of world.getAllPlayers()) {
          if (player && player.isValid && weaknessAppliedPlayers.has(player.id)) {
            try {
              player.removeEffect("weakness");
            } catch {
              // エフェクト除去失敗は無視
            }
          }
        }
        weaknessAppliedPlayers.clear();
      }
      return;
    }

    const currentDay = getCurrentDay();
    const daysMap = getDaysMap();

    for (const player of world.getAllPlayers()) {
      if (!player || !player.isValid) {
        continue;
      }

      if (!isPlayerRestricted(player)) {
        if (weaknessAppliedPlayers.has(player.id)) {
          try {
            player.removeEffect("weakness");
          } catch {
            // 無視
          }
          weaknessAppliedPlayers.delete(player.id);
        }
        continue;
      }

      let mainhandItem;
      try {
        const eq = player.getComponent("minecraft:equippable");
        mainhandItem = eq ? eq.getEquipment(EquipmentSlot.Mainhand) : undefined;
      } catch {
        mainhandItem = undefined;
      }

      const shouldWeaken =
        Boolean(mainhandItem) && !evaluateItemAccess(mainhandItem, currentDay, daysMap).allowed;

      if (shouldWeaken) {
        try {
          player.addEffect("weakness", 30, { amplifier: 255, showParticles: false });
          weaknessAppliedPlayers.add(player.id);
        } catch {
          // エフェクト付与失敗は無視
        }
      } else if (weaknessAppliedPlayers.has(player.id)) {
        try {
          player.removeEffect("weakness");
        } catch {
          // エフェクト除去失敗は無視
        }
        weaknessAppliedPlayers.delete(player.id);
      }
    }
  }, 5);

  // 7. 防具・オフハンド装備の強制解除（10 tick 間隔）
  const protectedSlots = [
    EquipmentSlot.Head,
    EquipmentSlot.Chest,
    EquipmentSlot.Legs,
    EquipmentSlot.Feet,
    EquipmentSlot.Offhand
  ];

  system.runInterval(() => {
    if (!isEnabled()) {
      return;
    }

    const currentDay = getCurrentDay();
    const daysMap = getDaysMap();

    for (const player of world.getAllPlayers()) {
      if (!isPlayerRestricted(player)) {
        continue;
      }

      let equippable;
      try {
        equippable = player.getComponent("minecraft:equippable");
      } catch {
        equippable = undefined;
      }
      if (!equippable) {
        continue;
      }

      for (const slot of protectedSlots) {
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
        returnItemToPlayer(player, itemCopy);
        notifyBlocked(player, access, currentDay);
      }
    }
  }, 10);

  // 8. 溶岩延焼等によるネザーポータル生成・進入の阻止（15 tick 間隔）
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
