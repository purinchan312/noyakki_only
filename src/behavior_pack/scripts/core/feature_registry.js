const registeredFeatures = [];

/**
 * 機能モジュールをレジストリに登録する。
 * @param {object} feature
 */
export function registerFeature(feature) {
  if (!feature || typeof feature.id !== "string") {
    return;
  }
  if (registeredFeatures.some((existing) => existing.id === feature.id)) {
    return;
  }
  registeredFeatures.push(feature);
}

/**
 * 登録済み機能モジュール一覧を登録順で返す。
 * @returns {Array<object>}
 */
export function getFeatures() {
  return [...registeredFeatures];
}

/**
 * 指定IDの機能モジュールを検索する。
 * @param {string} id
 * @returns {object | undefined}
 */
export function getFeatureById(id) {
  return registeredFeatures.find((feature) => feature.id === id);
}

/**
 * 登録済みの全機能モジュールの init() を順次実行する。
 */
export function initAllFeatures() {
  for (const feature of registeredFeatures) {
    if (typeof feature.init === "function") {
      try {
        feature.init();
      } catch (err) {
        console.error("[noyakki_only] Failed to init feature:", feature.id, err);
      }
    }
  }
}
