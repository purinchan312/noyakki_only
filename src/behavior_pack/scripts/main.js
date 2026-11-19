import { registerFeature, initAllFeatures } from "./core/feature_registry.js";
import { registerConfigCommand } from "./core/ui_manager.js";
import { initHostAuth } from "./core/host_auth.js";
import { initGameOverService } from "./core/game_over.js";
import { f01SharedFate } from "./features/f01_shared_fate.js";
import { f02CivilizationDawn } from "./features/f02_civilization_dawn.js";
import { f03Deadline } from "./features/f03_deadline.js";

// 1. すべての機能モジュールをメモリ上に先に登録（Early-Execution 安全・world API 未呼び出し）
registerFeature(f01SharedFate);
registerFeature(f02CivilizationDawn);
registerFeature(f03Deadline);

// 2. startup イベントで /noyakki_only:config コマンドを登録
registerConfigCommand();

// 3. 実行時イベント購読と定期監視を登録（ワールド参照はイベント・コールバック発火後まで遅延）
initHostAuth();
initGameOverService();
initAllFeatures();
