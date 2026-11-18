const features = [];

/**
 * 機能モジュールをレジストリに登録する。
 * @param {object} feature
 */
export function registerFeature(feature) {
  if (!feature || typeof feature.id !== "string") {
    return;
  }
  if (features.some((existing) => existing.id === feature.id)) {
    return;
  }
  features.push(feature);
}

/**
 * 登録済み機能モジュール一覧を登録順で返す。
 * @returns {Array<object>}
 */
export function getFeatures() {
  return [...features];
}

/**
 * 指定IDの機能モジュールを検索する。
 * @param {string} id
 * @returns {object | undefined}
 */
export function getFeatureById(id) {
  return features.find((feature) => feature.id === id);
}

/**
 * 登録済みの全機能モジュールの init() を順次実行する。
 */
export function initAllFeatures() {
  for (const feature of features) {
    if (typeof feature.init === "function") {
      feature.init();
    }
  }
}
