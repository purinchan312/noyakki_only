import { world } from "@minecraft/server";

export const NAMESPACE = "noyakki_only";

/**
 * DynamicProperty 用の名前空間付きキーを生成する。
 * @param {string} scope - "core" または "fNN"
 * @param {string} key - プロパティ名
 * @returns {string}
 */
export function makeKey(scope, key) {
  return `${NAMESPACE}:${scope}.${key}`;
}

/**
 * boolean 型 DynamicProperty をデフォルト値付きで読み込む。
 * @param {string} fullKey
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
export function getBooleanProp(fullKey, defaultValue) {
  const value = world.getDynamicProperty(fullKey);
  return typeof value === "boolean" ? value : defaultValue;
}

/**
 * boolean 型 DynamicProperty を書き込む。
 * @param {string} fullKey
 * @param {boolean} value
 */
export function setBooleanProp(fullKey, value) {
  world.setDynamicProperty(fullKey, Boolean(value));
}

/**
 * number 型 DynamicProperty をデフォルト値付きで読み込む。
 * @param {string} fullKey
 * @param {number} defaultValue
 * @returns {number}
 */
export function getNumberProp(fullKey, defaultValue) {
  const value = world.getDynamicProperty(fullKey);
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

/**
 * number 型 DynamicProperty を書き込む。
 * @param {string} fullKey
 * @param {number} value
 */
export function setNumberProp(fullKey, value) {
  world.setDynamicProperty(fullKey, Number(value));
}

/**
 * string 型 DynamicProperty をデフォルト値付きで読み込む。
 * @param {string} fullKey
 * @param {string} defaultValue
 * @returns {string}
 */
export function getStringProp(fullKey, defaultValue) {
  const value = world.getDynamicProperty(fullKey);
  return typeof value === "string" ? value : defaultValue;
}

/**
 * string 型 DynamicProperty を書き込む。
 * @param {string} fullKey
 * @param {string} value
 */
export function setStringProp(fullKey, value) {
  world.setDynamicProperty(fullKey, String(value));
}

/**
 * JSON オブジェクト型 DynamicProperty を安全に読み込む。
 * @param {string} fullKey
 * @param {Record<string, unknown>} defaultValue
 * @returns {Record<string, unknown>}
 */
export function getJsonProp(fullKey, defaultValue) {
  const raw = world.getDynamicProperty(fullKey);
  if (typeof raw !== "string" || raw.length === 0) {
    return { ...defaultValue };
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // 破損データ時は既定値へフォールバックする
  }
  return { ...defaultValue };
}

/**
 * JSON オブジェクト型 DynamicProperty を書き込む。
 * @param {string} fullKey
 * @param {Record<string, unknown>} value
 */
export function setJsonProp(fullKey, value) {
  world.setDynamicProperty(fullKey, JSON.stringify(value));
}

/**
 * アドオン全体で統一利用するゲーム内経過日数（0始まり）を返す。
 * @returns {number}
 */
export function getCurrentDay() {
  return world.getDay();
}
