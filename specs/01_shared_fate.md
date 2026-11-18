# 機能仕様 #01: 一蓮托生 (Shared Fate)

本仕様書は `specs/00_ARCHITECTURE.md` の共通規約に基づき、ワールド開始から指定されたゲーム内経過日数以内にいずれか1人のプレイヤーが死亡した場合、生存している全プレイヤーのHPを $0$ にして連帯ゲームオーバーとする機能を定義する。

---

## 1. 機能概要

* **機能ID / プレフィックス**: `f01`
* **機能名称**: `一蓮托生`（英語名: `Shared Fate`）
* **実装ファイル**: `src/behavior_pack/scripts/features/f01_shared_fate.js`
* **デフォルト状態**: **OFF**（`false`）
* **動作概要**:
  * 設定された適用日数（初期値: `10`日）以下でプレイヤーの死亡が発生した瞬間、共通ゲームオーバーサービス（`core/game_over.js`）を呼び出して全プレイヤーのHPを $0$（即時死亡）にする。
  * 誰も死なずに適用日数を超えた朝（初期値ならHUD表示が `11`日になった瞬間）を迎えた場合、連帯責任期間が終了し個別死亡へ移行した旨を全員へ通知する。

---

## 2. 設定画面（UI）・コマンド利用権限仕様

* **コマンド利用権限（厳守）**: 設定画面を起動するコマンド `/noyakki_only:config` は **ホストのみ利用可能** とする（`specs/00_ARCHITECTURE.md` 第3章準拠）。ホスト以外のプレイヤーは本機能の設定画面を開くことも変更することもできない。
* **ルート設定画面との連携**: ホストが `/noyakki_only:config` から開くルート設定画面の「一括 ON/OFF 切替」および本機能の個別設定フォームへ連携する。
* **`setEnabled(enabled)` 呼び出し時の処理**:
  * `noyakki_only:f01.enabled` を更新する。新たに `true` へ切り替えられた際、`world.getDay() <= f01.days` であれば `noyakki_only:f01.notified` を `false` に整える。
* **個別設定フォーム (`ModalFormData`)**:
  * **フォームタイトル**: `一蓮托生 設定`

| 順序 | UI要素 | ラベル | 初期値（未設定時） | バリデーション・制約 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `toggle` | `一蓮托生を有効にする` | `false` | 機能の ON / OFF 切り替え |
| 2 | `textField` | `適用日数（ゲーム内経過日数）` | `"10"` | $0$ 以上の半角整数のみ許可 |
| 3 | `textField` | `ゲームオーバーメッセージ` | `"{day}日以内にやられたためワールドを終わります"` | 空文字不可・プレースホルダ使用可 |

* **保存時処理**:
  * 適用日数が空欄、数値以外、または $0$ 未満の場合は保存を拒否し、ホストへエラーメッセージを通知する。
  * 設定保存時、`world.getDay() <= 新しい適用日数` である場合は期間満了通知フラグ（`noyakki_only:f01.notified`）を `false` にリセットする（後から適用日数を延長した場合に再度期間満了通知が機能するようにするため）。
  * 保存完了後、ルート設定画面を再表示する。

---

## 3. データ永続化仕様（World DynamicProperty）

| キー名 | 型 | デフォルト値 | 説明 |
| :--- | :--- | :--- | :--- |
| `noyakki_only:f01.enabled` | `boolean` | `false` | 一蓮托生の有効/無効フラグ |
| `noyakki_only:f01.days` | `number` | `10` | 連帯責任が適用される上限日数（`world.getDay()` 基準） |
| `noyakki_only:f01.msg` | `string` | `"{day}日以内にやられたためワールドを終わります"` | 発動時の表示メッセージテンプレート |
| `noyakki_only:f01.notified` | `boolean` | `false` | 期間満了アナウンスの送信済みフラグ |
| `noyakki_only:f01.triggered` | `boolean` | `false` | 本機能の発動済みフラグ |

### メッセージ置換変数（プレースホルダ）
発動時に `noyakki_only:f01.msg` 内の以下の文字列を実値へ置換する。
* `{day}` : 設定されている適用日数（`noyakki_only:f01.days`）
* `{current_day}` : 死亡発生時点の現在日数（`world.getDay()`）
* `{player}` : 死亡したプレイヤー名（`Player.name`）

---

## 4. ロジック詳細仕様

### 4.1 日数判定基準
* 現在日数は `const currentDay = world.getDay();`（HUD表示の $0$ 日始まり）を使用する。
* `days = 10` の場合、$0 \le \text{currentDay} \le 10$ の間は連帯責任が有効であり、時間経過またはベッド就寝によって朝を迎え $\text{currentDay} > 10$（`11`日）になった瞬間に期間満了となる。

### 4.2 期間満了判定と解除アナウンス
* **監視周期**: `system.runInterval`（$20\text{ tick} = 1$ 秒間隔）
* **発動条件**:
  * `f01.enabled === true`
  * `f01.triggered === false` かつ `core.gameover_active === false`
  * `f01.notified === false`
  * `world.getDay() > f01.days`
* **処理内容**:
  * 全プレイヤーのチャット欄に `§a[一蓮托生] 連帯責任期間（{days}日）を生き延びました！これ以降は個別死亡となります。` を送信し、効果音（`random.levelup`）を再生する。
  * `noyakki_only:f01.notified` を `true` に更新する。

### 4.3 死亡検知と全員HP0化（ゲームオーバー発動）
* **トリガー**: `world.afterEvents.entityDie`（`event.deadEntity.typeId === "minecraft:player"`）
* **発動条件**:
  1. `f01.enabled === true`
  2. `f01.triggered === false`
  3. `core.gameover_active === false`（※他機能による全員HP0化処理や、本機能自身の `player.kill()` 連鎖で二重発火しないための必須ガード）
  4. `world.getDay() <= f01.days`
* **実行手順**:
  1. `noyakki_only:f01.triggered` を `true` に更新する。
  2. `f01.msg` 内の `{day}`, `{current_day}`, `{player}` を置換して表示文字列を生成する。
  3. `core/game_over.js` の `triggerGlobalGameOver("f01", formattedMessage)` を呼び出し、タイトル・チャット表示、効果音再生、全プレイヤーのHP0化（`player.kill()`）、およびオフライン参加者の再接続時HP0化ロックを実行する。

### 4.4 設定メニュー用サマリー表示 (`getStatusSummary`)
* ルート設定画面の本文に表示するサマリー文字列として以下を返す：
  * OFF時: `・一蓮托生: OFF`
  * ON（期間内）: `・一蓮托生: ON（{days}日まで有効 / 残り {days - currentDay}日）`
  * ON（期間満了後）: `・一蓮托生: ON（期間満了済み・個別死亡モード）`

---

## 5. 受け入れテスト確認項目

- [ ] 新規ワールド作成直後は `一蓮托生 [OFF]` であり、誰かが死亡しても他の生存プレイヤーが巻き添え死しないこと。
- [ ] ホスト以外のゲスト参加者が `/noyakki_only:config` を実行してもエラーで拒否され、本機能の設定画面を開けないこと（コマンドはホストのみ利用可能であること）。
- [ ] ホストが `/noyakki_only:config` から `一蓮托生` を ON（適用日数 `10`）にした状態で、`0`日〜`10`日の間に1人が死亡すると、カスタムメッセージが表示されて生存者全員のHPが即座に $0$ になること（不死のトーテム所持時も貫通すること）。
- [ ] 全員HP0化の際、`entityDie` の連鎖によってメッセージや音が人数分重複再生されないこと。
- [ ] `10`日の夜にベッドで寝る（または朝を待つ）ことで `11`日になった瞬間、期間満了メッセージが表示され、その後に1人が死亡しても他のプレイヤーは生存したままであること。