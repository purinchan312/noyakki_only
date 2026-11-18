import { registerConfigCommand } from "./core/ui_manager.js";
import { initHostAuth } from "./core/host_auth.js";
import { initGameOverService } from "./core/game_over.js";
import { registerFeature, initAllFeatures } from "./core/feature_registry.js";
import { f01SharedFate } from "./features/f01_shared_fate.js";
import { f02CivilizationDawn } from "./features/f02_civilization_dawn.js";
import { f03Deadline } from "./features/f03_deadline.js";

registerConfigCommand();
initHostAuth();
initGameOverService();

registerFeature(f01SharedFate);
registerFeature(f02CivilizationDawn);
registerFeature(f03Deadline);

initAllFeatures();
