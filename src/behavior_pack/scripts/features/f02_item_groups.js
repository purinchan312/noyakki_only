export const ITEM_GROUPS = [
  { id: "wood", name: "原木関連", defaultDay: 0 },
  { id: "food", name: "食料関連", defaultDay: 0 },
  { id: "dirt", name: "土・地形関連", defaultDay: 0 },
  { id: "coal", name: "石炭・松明関連", defaultDay: 2 },
  { id: "stone_bed", name: "ベッド・石・かまど関連", defaultDay: 5 },
  { id: "leather", name: "革関連", defaultDay: 5 },
  { id: "string", name: "糸・羊毛関連", defaultDay: 5 },
  { id: "glass", name: "ガラス・水ビン関連", defaultDay: 7 },
  { id: "copper", name: "銅関連", defaultDay: 10 },
  { id: "hunting", name: "狩猟・釣具関連", defaultDay: 10 },
  { id: "iron", name: "鉄・バケツ関連", defaultDay: 15 },
  { id: "gold", name: "金関連", defaultDay: 15 },
  { id: "diamond", name: "ダイヤ関連", defaultDay: 20 },
  { id: "potion", name: "ポーション関連", defaultDay: 20 },
  { id: "obsidian", name: "黒曜石関連", defaultDay: 30 },
  { id: "nether_portal", name: "ネザーポータル着火", defaultDay: 30 },
  { id: "end_portal", name: "エンドポータル関連", defaultDay: 40 }
];

export const GROUP_BY_ID = new Map(ITEM_GROUPS.map((group) => [group.id, group]));
const GROUP_ORDER_INDEX = new Map(ITEM_GROUPS.map((group, index) => [group.id, index]));

const DYE_COLORS = [
  "white",
  "orange",
  "magenta",
  "light_blue",
  "yellow",
  "lime",
  "pink",
  "gray",
  "light_gray",
  "silver",
  "cyan",
  "purple",
  "blue",
  "brown",
  "green",
  "red",
  "black"
];

const OVERWORLD_WOOD_SPECIES = [
  "oak",
  "spruce",
  "birch",
  "jungle",
  "acacia",
  "dark_oak",
  "mangrove",
  "cherry",
  "pale_oak"
];

const WOOD_IDS = new Set([
  "stick",
  "crafting_table",
  "wooden_sword",
  "wooden_axe",
  "wooden_pickaxe",
  "wooden_shovel",
  "wooden_hoe",
  "chest",
  "trapped_chest",
  "barrel",
  "bowl",
  "ladder",
  "mangrove_roots",
  // Bamboo wood family
  "bamboo",
  "bamboo_sapling",
  "bamboo_block",
  "stripped_bamboo_block",
  "bamboo_planks",
  "bamboo_mosaic",
  "bamboo_stairs",
  "bamboo_mosaic_stairs",
  "bamboo_slab",
  "bamboo_double_slab",
  "bamboo_mosaic_slab",
  "bamboo_mosaic_double_slab",
  "bamboo_fence",
  "bamboo_fence_gate",
  "bamboo_door",
  "bamboo_trapdoor",
  "bamboo_button",
  "bamboo_pressure_plate",
  "bamboo_sign",
  "bamboo_standing_sign",
  "bamboo_wall_sign",
  "bamboo_hanging_sign",
  "bamboo_raft",
  "bamboo_chest_raft",
  // Legacy / unprefixed Bedrock wood IDs
  "log",
  "log2",
  "wood",
  "planks",
  "fence",
  "wooden_slab",
  "double_wooden_slab",
  "wooden_door",
  "trapdoor",
  "fence_gate",
  "wooden_button",
  "wooden_pressure_plate",
  "sign",
  "standing_sign",
  "wall_sign",
  "boat",
  "chest_boat"
]);

for (const species of OVERWORLD_WOOD_SPECIES) {
  WOOD_IDS.add(`${species}_log`);
  WOOD_IDS.add(`stripped_${species}_log`);
  WOOD_IDS.add(`${species}_wood`);
  WOOD_IDS.add(`stripped_${species}_wood`);
  WOOD_IDS.add(`${species}_planks`);
  WOOD_IDS.add(`${species}_stairs`);
  WOOD_IDS.add(`${species}_slab`);
  WOOD_IDS.add(`${species}_double_slab`);
  WOOD_IDS.add(`${species}_fence`);
  WOOD_IDS.add(`${species}_fence_gate`);
  WOOD_IDS.add(`${species}_door`);
  WOOD_IDS.add(`${species}_trapdoor`);
  WOOD_IDS.add(`${species}_button`);
  WOOD_IDS.add(`${species}_pressure_plate`);
  WOOD_IDS.add(`${species}_sign`);
  WOOD_IDS.add(`${species}_standing_sign`);
  WOOD_IDS.add(`${species}_wall_sign`);
  WOOD_IDS.add(`${species}_hanging_sign`);
  WOOD_IDS.add(`${species}_boat`);
  WOOD_IDS.add(`${species}_chest_boat`);
}

const FOOD_EXCLUDED_IDS = new Set([
  "golden_apple",
  "enchanted_golden_apple",
  "golden_carrot",
  "milk_bucket"
]);

const FOOD_IDS = new Set([
  // Meats and fish
  "beef",
  "cooked_beef",
  "porkchop",
  "cooked_porkchop",
  "chicken",
  "cooked_chicken",
  "mutton",
  "cooked_mutton",
  "rabbit",
  "cooked_rabbit",
  "cod",
  "cooked_cod",
  "salmon",
  "cooked_salmon",
  "tropical_fish",
  "pufferfish",
  "rotten_flesh",
  "spider_eye",
  // Crops, fruits, baked foods, stews
  "apple",
  "bread",
  "cookie",
  "melon_slice",
  "dried_kelp",
  "carrot",
  "carrots",
  "potato",
  "potatoes",
  "baked_potato",
  "poisonous_potato",
  "beetroot",
  "sweet_berries",
  "sweet_berry_bush",
  "glow_berries",
  "cave_vines",
  "cave_vines_body_with_berries",
  "cave_vines_head_with_berries",
  "chorus_fruit",
  "pumpkin_pie",
  "mushroom_stew",
  "rabbit_stew",
  "beetroot_soup",
  "suspicious_stew",
  "honey_bottle",
  "cake",
  // Seeds, crops, saplings
  "wheat_seeds",
  "wheat",
  "pumpkin_seeds",
  "melon_seeds",
  "beetroot_seeds",
  "torchflower_seeds",
  "torchflower_crop",
  "pitcher_pod",
  "pitcher_crop",
  "cocoa_beans",
  "cocoa",
  "sugar_cane",
  "reeds",
  "kelp",
  "pumpkin",
  "carved_pumpkin",
  "melon_block",
  "pumpkin_stem",
  "melon_stem",
  "brown_mushroom",
  "red_mushroom",
  "sapling",
  "oak_sapling",
  "spruce_sapling",
  "birch_sapling",
  "jungle_sapling",
  "acacia_sapling",
  "dark_oak_sapling",
  "cherry_sapling",
  "pale_oak_sapling",
  "mangrove_propagule",
  "azalea",
  "flowering_azalea"
]);

const DIRT_IDS = new Set([
  "dirt",
  "grass_block",
  "grass",
  "coarse_dirt",
  "dirt_with_roots",
  "rooted_dirt",
  "mud",
  "muddy_mangrove_roots",
  "podzol",
  "mycelium",
  "farmland",
  "grass_path",
  "dirt_path",
  "sand",
  "red_sand",
  "gravel",
  "suspicious_sand",
  "suspicious_gravel",
  "clay",
  "clay_ball"
]);

const COAL_IDS = new Set([
  "coal",
  "charcoal",
  "coal_block",
  "torch",
  "soul_torch",
  "campfire",
  "soul_campfire"
]);

const STONE_BED_IDS = new Set([
  "bed",
  "furnace",
  "lit_furnace",
  "blast_furnace",
  "lit_blast_furnace",
  "smoker",
  "lit_smoker",
  "stonecutter_block",
  "stonecutter",
  "grindstone",
  "stone_sword",
  "stone_axe",
  "stone_pickaxe",
  "stone_shovel",
  "stone_hoe",
  "stone_button",
  "stone_pressure_plate",
  // Stone, cobblestone, bricks, and legacy stone slabs/stairs/walls
  "stone",
  "cobblestone",
  "mossy_cobblestone",
  "smooth_stone",
  "stonebrick",
  "stone_bricks",
  "mossy_stone_bricks",
  "cracked_stone_bricks",
  "chiseled_stone_bricks",
  "stone_stairs",
  "normal_stone_stairs",
  "cobblestone_stairs",
  "mossy_cobblestone_stairs",
  "stone_brick_stairs",
  "mossy_stone_brick_stairs",
  "stone_slab",
  "double_stone_slab",
  "stone_slab2",
  "double_stone_slab2",
  "stone_slab3",
  "double_stone_slab3",
  "stone_slab4",
  "double_stone_slab4",
  "normal_stone_slab",
  "normal_stone_double_slab",
  "smooth_stone_slab",
  "smooth_stone_double_slab",
  "cobblestone_slab",
  "cobblestone_double_slab",
  "mossy_cobblestone_slab",
  "mossy_cobblestone_double_slab",
  "stone_brick_slab",
  "stone_brick_double_slab",
  "mossy_stone_brick_slab",
  "mossy_stone_brick_double_slab",
  "cobblestone_wall",
  "mossy_cobblestone_wall",
  "stone_brick_wall",
  "mossy_stone_brick_wall"
]);

for (const color of DYE_COLORS) {
  STONE_BED_IDS.add(`${color}_bed`);
}

const STONE_VARIANT_PREFIXES = [
  "granite",
  "polished_granite",
  "diorite",
  "polished_diorite",
  "andesite",
  "polished_andesite",
  "deepslate",
  "cobbled_deepslate",
  "polished_deepslate",
  "deepslate_brick",
  "deepslate_tile",
  "tuff",
  "polished_tuff",
  "tuff_brick",
  "sandstone",
  "cut_sandstone",
  "smooth_sandstone",
  "red_sandstone",
  "cut_red_sandstone",
  "smooth_red_sandstone"
];

for (const prefix of STONE_VARIANT_PREFIXES) {
  STONE_BED_IDS.add(prefix);
  STONE_BED_IDS.add(`${prefix}s`);
  STONE_BED_IDS.add(`${prefix}_stairs`);
  STONE_BED_IDS.add(`${prefix}_slab`);
  STONE_BED_IDS.add(`${prefix}_double_slab`);
  STONE_BED_IDS.add(`${prefix}_wall`);
}

STONE_BED_IDS.add("chiseled_deepslate");
STONE_BED_IDS.add("cracked_deepslate_bricks");
STONE_BED_IDS.add("cracked_deepslate_tiles");
STONE_BED_IDS.add("chiseled_tuff");
STONE_BED_IDS.add("chiseled_tuff_bricks");
STONE_BED_IDS.add("chiseled_sandstone");
STONE_BED_IDS.add("chiseled_red_sandstone");

const LEATHER_IDS = new Set([
  "leather",
  "rabbit_hide",
  "leather_helmet",
  "leather_chestplate",
  "leather_leggings",
  "leather_boots",
  "leather_horse_armor",
  "bundle"
]);

for (const color of DYE_COLORS) {
  LEATHER_IDS.add(`${color}_bundle`);
}

const STRING_IDS = new Set([
  "string",
  "tripwire",
  "wool",
  "carpet",
  "moss_carpet",
  "pale_moss_carpet",
  "lead",
  "scaffolding"
]);

for (const color of DYE_COLORS) {
  STRING_IDS.add(`${color}_wool`);
  STRING_IDS.add(`${color}_carpet`);
}

const GLASS_IDS = new Set([
  "glass",
  "tinted_glass",
  "glass_pane",
  "stained_glass",
  "stained_glass_pane",
  "glass_bottle"
]);

for (const color of DYE_COLORS) {
  GLASS_IDS.add(`${color}_stained_glass`);
  GLASS_IDS.add(`${color}_stained_glass_pane`);
}

const COPPER_IDS = new Set([
  "raw_copper",
  "raw_copper_block",
  "copper_ingot",
  "lightning_rod",
  "spyglass",
  "brush"
]);

const COPPER_OXIDATION_STAGES = ["", "exposed_", "weathered_", "oxidized_"];
const COPPER_WAX_STAGES = ["", "waxed_"];

for (const wax of COPPER_WAX_STAGES) {
  for (const ox of COPPER_OXIDATION_STAGES) {
    COPPER_IDS.add(`${wax}${ox}copper`);
    COPPER_IDS.add(`${wax}${ox}copper_block`);
    COPPER_IDS.add(`${wax}${ox}cut_copper`);
    COPPER_IDS.add(`${wax}${ox}cut_copper_stairs`);
    COPPER_IDS.add(`${wax}${ox}cut_copper_slab`);
    COPPER_IDS.add(`${wax}${ox}double_cut_copper_slab`);
    COPPER_IDS.add(`${wax}${ox}cut_copper_double_slab`);
    COPPER_IDS.add(`${wax}${ox}chiseled_copper`);
    COPPER_IDS.add(`${wax}${ox}copper_grate`);
    COPPER_IDS.add(`${wax}${ox}copper_bulb`);
    COPPER_IDS.add(`${wax}${ox}copper_door`);
    COPPER_IDS.add(`${wax}${ox}copper_trapdoor`);
    COPPER_IDS.add(`${wax}${ox}lightning_rod`);
  }
}

const HUNTING_IDS = new Set([
  "bow",
  "crossbow",
  "arrow",
  "spectral_arrow",
  "tipped_arrow",
  "fishing_rod",
  "carrot_on_a_stick",
  "warped_fungus_on_a_stick"
]);

const IRON_IDS = new Set([
  "raw_iron",
  "raw_iron_block",
  "iron_ingot",
  "iron_nugget",
  "iron_block",
  "iron_sword",
  "iron_axe",
  "iron_pickaxe",
  "iron_shovel",
  "iron_hoe",
  "iron_helmet",
  "iron_chestplate",
  "iron_leggings",
  "iron_boots",
  "chainmail_helmet",
  "chainmail_chestplate",
  "chainmail_leggings",
  "chainmail_boots",
  "iron_horse_armor",
  "shield",
  "shears",
  "flint_and_steel",
  "bucket",
  "water_bucket",
  "lava_bucket",
  "powder_snow_bucket",
  "milk_bucket",
  "cod_bucket",
  "salmon_bucket",
  "tropical_fish_bucket",
  "pufferfish_bucket",
  "axolotl_bucket",
  "tadpole_bucket",
  "anvil",
  "chipped_anvil",
  "damaged_anvil",
  "cauldron",
  "hopper",
  "iron_bars",
  "iron_door",
  "iron_trapdoor",
  "lantern",
  "soul_lantern",
  "chain",
  "iron_chain",
  "rail",
  "detector_rail",
  "activator_rail",
  "minecart",
  "chest_minecart",
  "hopper_minecart",
  "tnt_minecart",
  "command_block_minecart",
  "compass"
]);

const GOLD_IDS = new Set([
  "raw_gold",
  "raw_gold_block",
  "gold_ingot",
  "gold_nugget",
  "gold_block",
  "golden_sword",
  "golden_axe",
  "golden_pickaxe",
  "golden_shovel",
  "golden_hoe",
  "golden_helmet",
  "golden_chestplate",
  "golden_leggings",
  "golden_boots",
  "golden_horse_armor",
  "golden_apple",
  "enchanted_golden_apple",
  "golden_carrot",
  "glistering_melon_slice",
  "clock",
  "golden_rail",
  "powered_rail",
  "light_weighted_pressure_plate"
]);

const DIAMOND_IDS = new Set([
  "diamond",
  "diamond_block",
  "diamond_sword",
  "diamond_axe",
  "diamond_pickaxe",
  "diamond_shovel",
  "diamond_hoe",
  "diamond_helmet",
  "diamond_chestplate",
  "diamond_leggings",
  "diamond_boots",
  "diamond_horse_armor",
  "jukebox"
]);

const POTION_IDS = new Set([
  "splash_potion",
  "lingering_potion",
  "dragon_breath"
]);

const OBSIDIAN_IDS = new Set([
  "obsidian",
  "crying_obsidian",
  "enchanting_table",
  "ender_chest",
  "respawn_anchor"
]);

const END_PORTAL_IDS = new Set([
  "ender_pearl",
  "ender_eye",
  "blaze_rod",
  "blaze_powder"
]);

// 設備UI・コンテナを開くだけの操作をブロックしない対象ブロック集合
export const WORKSTATION_UI_BLOCKS = new Set([
  "minecraft:crafting_table",
  "minecraft:chest",
  "minecraft:trapped_chest",
  "minecraft:ender_chest",
  "minecraft:barrel",
  "minecraft:furnace",
  "minecraft:lit_furnace",
  "minecraft:blast_furnace",
  "minecraft:lit_blast_furnace",
  "minecraft:smoker",
  "minecraft:lit_smoker",
  "minecraft:enchanting_table",
  "minecraft:brewing_stand",
  "minecraft:anvil",
  "minecraft:chipped_anvil",
  "minecraft:damaged_anvil",
  "minecraft:grindstone",
  "minecraft:stonecutter_block",
  "minecraft:stonecutter",
  "minecraft:smithing_table",
  "minecraft:loom",
  "minecraft:cartography_table",
  "minecraft:fletching_table",
  "minecraft:shulker_box",
  "minecraft:undyed_shulker_box",
  "minecraft:hopper",
  "minecraft:dropper",
  "minecraft:dispenser",
  "minecraft:beacon",
  "minecraft:crafter",
  "minecraft:lectern"
]);

for (const color of DYE_COLORS) {
  WORKSTATION_UI_BLOCKS.add(`minecraft:${color}_shulker_box`);
}

const BLOCK_ACTION_EXACT_IDS = new Set([
  "flint_and_steel",
  "fire_charge",
  "brush",
  "shears",
  "glass_bottle",
  "bone_meal",
  "ender_eye",
  "lead",
  "armor_stand",
  "item_frame",
  "glow_item_frame",
  "painting",
  "end_crystal",
  "firework_rocket",
  "glow_ink_sac",
  "ink_sac",
  "honeycomb"
]);

/**
 * 名前空間付きIDから "minecraft:" を取り除いて小文字化する。
 * @param {string} typeId
 * @returns {string}
 */
export function stripMinecraftNamespace(typeId) {
  if (typeof typeId !== "string") {
    return "";
  }
  const lower = typeId.toLowerCase();
  return lower.startsWith("minecraft:") ? lower.slice("minecraft:".length) : lower;
}

/**
 * ブロックへの右クリック作用（耕地化・道作成・樹皮剥ぎ・バケツ設置/回収・着火等）を伴うアイテムか判定する。
 * @param {string} typeId
 * @returns {boolean}
 */
export function isBlockActionItem(typeId) {
  const shortId = stripMinecraftNamespace(typeId);
  if (!shortId) {
    return false;
  }
  if (BLOCK_ACTION_EXACT_IDS.has(shortId)) {
    return true;
  }
  return (
    shortId === "bucket" ||
    shortId.endsWith("_bucket") ||
    shortId === "boat" ||
    shortId === "chest_boat" ||
    shortId.endsWith("_boat") ||
    shortId.endsWith("_chest_boat") ||
    shortId.endsWith("_raft") ||
    shortId.endsWith("_chest_raft") ||
    shortId === "minecart" ||
    shortId.endsWith("_minecart") ||
    shortId.endsWith("_hoe") ||
    shortId.endsWith("_shovel") ||
    shortId.endsWith("_axe") ||
    shortId.endsWith("_spawn_egg") ||
    shortId.startsWith("music_disc_")
  );
}

/**
 * 指定されたグループの現在の解放日数を取得する（未設定時は defaultDay）。
 * @param {string} groupId
 * @param {Record<string, number>} daysMap
 * @returns {number}
 */
export function getGroupUnlockDay(groupId, daysMap) {
  const group = GROUP_BY_ID.get(groupId);
  if (!group) {
    return -1;
  }
  if (daysMap && Object.prototype.hasOwnProperty.call(daysMap, groupId)) {
    const val = daysMap[groupId];
    if (typeof val === "number" && Number.isInteger(val) && val >= -1) {
      return val;
    }
  }
  return group.defaultDay;
}

/**
 * アイテムまたはタイプIDが属するグループID一覧を返す。
 * 未分類の場合は空配列を返す。
 * @param {import("@minecraft/server").ItemStack | string | undefined} itemStackOrTypeId
 * @returns {string[]}
 */
export function classifyItemGroups(itemStackOrTypeId) {
  if (!itemStackOrTypeId) {
    return [];
  }

  const isStringInput = typeof itemStackOrTypeId === "string";
  const rawTypeId = isStringInput ? itemStackOrTypeId : itemStackOrTypeId.typeId;
  const itemStack = isStringInput ? undefined : itemStackOrTypeId;
  const shortId = stripMinecraftNamespace(rawTypeId);

  if (!shortId) {
    return [];
  }

  // ポーション類: 水入りビンのみ glass、それ以外のポーションは potion
  if (shortId === "potion") {
    if (itemStack) {
      try {
        const potionComp = itemStack.getComponent("minecraft:potion");
        const effectId = String(potionComp?.potionEffectType?.id ?? "").toLowerCase();
        if (effectId === "water" || effectId === "minecraft:water") {
          return ["glass"];
        }
      } catch {
        // コンポーネント取得不可時は上位制限側（potion）へフォールバック
      }
    }
    return ["potion"];
  }

  const matched = [];

  if (WOOD_IDS.has(shortId)) matched.push("wood");

  if (!FOOD_EXCLUDED_IDS.has(shortId)) {
    let isFood = FOOD_IDS.has(shortId);
    if (!isFood && itemStack) {
      try {
        if (itemStack.getComponent("minecraft:food")) {
          isFood = true;
        }
      } catch {
        // コンポーネント未対応時は無視
      }
    }
    if (isFood) matched.push("food");
  }

  if (DIRT_IDS.has(shortId)) matched.push("dirt");
  if (COAL_IDS.has(shortId)) matched.push("coal");
  if (STONE_BED_IDS.has(shortId)) matched.push("stone_bed");
  if (LEATHER_IDS.has(shortId)) matched.push("leather");
  if (STRING_IDS.has(shortId)) matched.push("string");
  if (GLASS_IDS.has(shortId)) matched.push("glass");
  if (COPPER_IDS.has(shortId)) matched.push("copper");
  if (HUNTING_IDS.has(shortId)) matched.push("hunting");
  if (IRON_IDS.has(shortId) || shortId.endsWith("_bucket")) {
    if (!matched.includes("iron")) matched.push("iron");
  }
  if (GOLD_IDS.has(shortId)) matched.push("gold");
  if (DIAMOND_IDS.has(shortId)) matched.push("diamond");
  if (POTION_IDS.has(shortId)) matched.push("potion");
  if (OBSIDIAN_IDS.has(shortId)) matched.push("obsidian");
  if (END_PORTAL_IDS.has(shortId)) matched.push("end_portal");

  return matched;
}

/**
 * 複数グループ該当時に、最も制限が厳しいグループ（-1禁止優先、次に解放日数が遅い方）を選出する。
 * @param {string[]} groupIds
 * @param {Record<string, number>} daysMap
 * @returns {string | undefined}
 */
export function resolveRestrictingGroup(groupIds, daysMap) {
  if (!groupIds || groupIds.length === 0) {
    return undefined;
  }

  let selectedId = groupIds[0];
  let selectedDay = getGroupUnlockDay(selectedId, daysMap);

  for (let i = 1; i < groupIds.length; i++) {
    const candidateId = groupIds[i];
    const candidateDay = getGroupUnlockDay(candidateId, daysMap);

    if (selectedDay === -1) {
      if (
        candidateDay === -1 &&
        (GROUP_ORDER_INDEX.get(candidateId) ?? 0) > (GROUP_ORDER_INDEX.get(selectedId) ?? 0)
      ) {
        selectedId = candidateId;
      }
      continue;
    }

    if (candidateDay === -1) {
      selectedId = candidateId;
      selectedDay = -1;
      continue;
    }

    if (
      candidateDay > selectedDay ||
      (candidateDay === selectedDay &&
        (GROUP_ORDER_INDEX.get(candidateId) ?? 0) > (GROUP_ORDER_INDEX.get(selectedId) ?? 0))
    ) {
      selectedId = candidateId;
      selectedDay = candidateDay;
    }
  }

  return selectedId;
}
