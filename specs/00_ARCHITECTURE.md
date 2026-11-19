# Minecraft 統合版 アドオン「のやっきー専用 (noyakki_only)」共通基盤・マージ開発規約

本ドキュメントは、クライアントホスト（ローカルP2Pマルチ）× ハードコア環境向けの複数の縛りプレイ機能および拡張機能を **単一のアドオン（`のやっきー専用` / `noyakki_only`）** に統合し、モジュール単位で安全に追加・保守するための共通設計規約である。

AIエージェント（Antigravity）は、**アドオンの新規作成時・機能追加時・機能修正時・機能削除時のいずれのタイミングであっても**、`specs/` 配下のマークダウンファイルを参照して作業を行う際は、必ず本規約および第1章の絶対禁止事項を最優先で遵守すること。いかなる理由（開発効率・一時検証・画像生成の簡略化・既存テンプレートの流用等）であっても、禁止事項の例外適用は認めない。

---

## 1. プロジェクト基本情報・絶対禁止事項・許可ツールチェーン

### 1.1 プロジェクト基本情報
* **アドオン表示名**: `のやっきー専用`
* **英語識別子 / 名前空間**: `noyakki_only`
* **初期バージョン**: `v1.0.0`（`[1, 0, 0]` — `00_ARCHITECTURE.md` および `01`〜`03` を含む初期構成）
* **動作対象環境**: Minecraft Bedrock Edition クライアントホスト（ローカルマルチ）× ハードコアモード
* **ターゲットエンジン・API**:
  * `manifest.json` の `min_engine_version` は `[1, 26, 60]`（Bedrock 26.60 基準）とする。
  * **Stable API のみ使用すること**（`@minecraft/server`: `"2.11.0"`, `@minecraft/server-ui`: `"2.3.0"`）。

### 1.2 全ライフサイクル共通の絶対禁止事項（新規作成・機能追加・機能修正・機能削除のすべてで厳守）
以下の禁止事項は、プロジェクトの立ち上げから機能追加・不具合修正・機能削除・リファクタリング・ビルドに至るすべての作業工程において、一時的な利用や補助スクリプトを含め **一切禁止** とする。

1. **Node.js / npm / TypeScript（トランスパイラ・バンドラ含む）の使用禁止**
   * `Node.js`、`npm`、`npx`、`yarn`、`pnpm`、`bun`、`TypeScript (tsc)`、`esbuild`、`webpack`、`vite` 等のランタイムおよびビルドツールを一切使用・導入してはならない。
   * `package.json`、`package-lock.json`、`tsconfig.json`、`node_modules/` 等の関連ファイル・ディレクトリを生成してはならない。
   * アドオン本体（`src/behavior_pack/scripts/`）は、ビルド変換なしで Minecraft 統合版がそのまま実行できる **素の JavaScript（ES Modules / `.js`）** で直接記述すること。
2. **Python の使用禁止**
   * `Python`（`python` / `py` / `pip` / `*.py` スクリプト等）は、ビルド・検証・テスト・アイコン画像生成・一時的なデータ変換を含め一切使用してはならない。
3. **サードパーティ製 OSS ライブラリ・外部パッケージの使用禁止**
   * Minecraft 公式の `@minecraft/server`・`@minecraft/server-ui`、および後述の許可ツールチェーンの標準ライブラリ以外の外部ライブラリ・外部モジュール・NuGetパッケージ等を一切導入してはならない（依存ゼロ・サプライチェーン対策の徹底）。
4. **ビルド・ツール実行時の外部ネットワーク通信の禁止**
   * パッケージダウンロード、外部API呼び出し、CDN参照、リモートスキーマ取得など、外部ネットワーク通信を行う処理を一切記述・実行してはならない。開発・検証・パッケージングはすべて完全にオフラインで完結させること。
5. **過度なオブジェクト指向設計の禁止**
   * 深いクラス継承ツリー、抽象基底クラス、過剰な `class` 構文やデザインパターンの乱用は禁止する。
   * 状態と処理は、シンプルなプレーンオブジェクト（データ構造）・関数・ESモジュール単位でフラットかつ見通しよく分割すること。
6. **実験的機能（Experiments / ベータAPI）の使用禁止**
   * ワールド設定の「実験的機能」トグルを1つでも要求する `-beta` API バージョン指定や実験的コンポーネント・実験的コマンド定義は厳禁とする。
7. **独自アイテムによる設定導線および非ホストへのコマンド開放の禁止**
   * 設定画面を開くためのカスタムアイテムやバニラアイテム流用は一切実装してはならない。
   * 本アドオンが提供する `/noyakki_only:config` および今後追加されるすべての独自コマンドは **ワールドのホストのみ利用可能** とし、ゲストプレイヤーへの利用許可・例外許可を一切設けてはならない。
8. **デフォルトON（未設定時介入）の禁止**
   * `01`〜`03` および今後追加されるすべての機能モジュールは独立した ON/OFF フラグを持ち、初期値は必ず **`OFF`（`false`）** とする。未設定時にバニラのハードコア挙動へ介入してはならない。
9. **高負荷ループ処理の禁止**
   * クライアントホスト端末への負荷を抑えるため、毎ティック（$1\text{ tick}$）の全チャンク走査や全エンティティ走査は禁止し、イベント駆動（`beforeEvents` / `afterEvents`）と適切な間隔の `system.runInterval`（$5 \sim 20\text{ tick}$）を組み合わせること。

### 1.3 許可するツールチェーン（`tools/` 配下）
ビルド、JSON・翻訳ファイル構文検証、`.mcpack` / `.mcaddon` パッケージング、および `pack_icon.png` 自動生成などの開発補助ツール（`tools/` 配下）は、以下の環境のみを使用して実装すること。

* **PowerShell**（`.ps1` スクリプト、標準コマンドレットおよび .NET 標準クラスのみ使用）
* **.NET 10（標準ライブラリのみ）**（C# / 単一ファイルアプリまたはコンソールプロジェクト。NuGet 外部パッケージの参照は禁止）
* **Minecraft 統合版スクリプト本体**: 素の JavaScript（ES Modules）＋ 公式 `@minecraft/server` / `@minecraft/server-ui` のみ

---

## 2. ディレクトリ構成と機能別モジュール分割アーキテクチャ

複数の仕様書（`specs/NN_*.md`）から単一アドオンを生成・拡張・削除する際、コードの肥大化やマージ競合を防ぐため、以下のディレクトリ構造と **関数・データ指向のプラグインレジストリ方式** を厳守する。

```text
noyakki_only/
├── dist/                                       # パッケージ出力先（tools/ 配下のスクリプトで自動生成）
│   └── noyakki_only_v1.0.0.mcpack              # 配布・導入用パック（将来RP追加時は .mcaddon）
├── specs/                                      # 仕様書ディレクトリ（Single Source of Truth）
│   ├── 00_ARCHITECTURE.md                      # 本ファイル（共通規約・絶対禁止事項・UI基盤・ビルド規約）
│   ├── 01_shared_fate.md                       # 機能仕様 #01: 一蓮托生 (Shared Fate)
│   ├── 02_civilization_dawn.md                 # 機能仕様 #02: 文明開化 (Civilization Dawn)
│   ├── 03_deadline.md                          # 機能仕様 #03: デッドライン (Deadline)
│   └── 04_<next_feature>.md                    # 以降、随時追加される機能仕様書
├── src/                                        # ソースコード本体（素の JavaScript ES Modules）
│   └── behavior_pack/                          # ビヘイビアーパック
│       ├── manifest.json                       # UUID固定・バージョン自動更新対象
│       ├── pack_icon.png                       # パックアイコン（PowerShell / .NET 10 で生成）
│       ├── texts/
│       │   ├── languages.json                  # ["ja_JP", "en_US"]
│       │   ├── ja_JP.lang                      # 日本語翻訳定義（UTF-8 BOMなし）
│       │   └── en_US.lang
│       └── scripts/
│           ├── main.js                         # エントリポイント（コア初期化と各機能モジュールの登録のみ）
│           ├── core/
│           │   ├── storage.js                  # World DynamicProperty 型安全ラッパー関数群
│           │   ├── host_auth.js                # ハードコア対応・ホスト限定判定およびコマンド権限ガード
│           │   ├── feature_registry.js         # 機能モジュールの登録・一覧取得インターフェース
│           │   ├── ui_manager.js               # ルート設定画面・一括ON/OFF画面・UserBusyリトライ制御
│           │   └── game_over.js                # 全員HP0化（即死）共通サービス・多重発火ロック・切断復帰即死
│           └── features/
│               ├── f01_shared_fate.js          # 機能 #01: 一蓮托生
│               ├── f02_civilization_dawn.js    # 機能 #02: 文明開化（アイテム分類辞書は別JSへ分割可）
│               └── f03_deadline.js             # 機能 #03: デッドライン
├── tools/                                      # ビルド・検証・補助スクリプト（PowerShell / .NET 10 標準のみ）
│   ├── build.ps1                               # オフライン構文検証 ＋ dist/ への .mcpack / .mcaddon 出力
│   └── generate_icon.ps1                       # pack_icon.png 自動生成スクリプト（.NET標準機能または自前PNG出力）
├── .gitattributes                              # 改行コード・バイナリファイルの扱い定義
└── .gitignore                                  # 一時ファイル・キャッシュ・機微情報等の除外定義
```

### 機能モジュールの標準インターフェース (`feature_registry.js`)
各機能ファイル（`src/behavior_pack/scripts/features/fNN_<name>.js`）はクラス継承を用いず、以下のプロパティと関数を持つシンプルなプレーンオブジェクトとしてエクスポートし、`main.js` へ登録する。これにより、機能追加・機能削除時に既存機能のコードを書き換えることなく設定メニューや一括ON/OFF画面へ自動反映させる。

* `id`: 機能プレフィックス（例: `"f01"`, `"f02"`, `"f03"`）
* `title`: 日本語機能名（例: `"一蓮托生"`, `"文明開化"`, `"デッドライン"`）
* `isEnabled()`: 現在その機能が有効（`true`）かどうかを返す関数
* `setEnabled(enabled)`: 機能の有効/無効フラグを更新し、有効化時の初期化同期（経過日数の基準値セット等）を行う関数
* `openSettingsForm(player, onBack)`: 個別設定用の `ModalFormData` を開き、保存または閉鎖後に `onBack()` で親メニューへ戻れる関数
* `getStatusSummary()`: ルート設定画面の本文に表示する現在の設定・進行状況テキスト（1行）を返す関数
* `init()`: イベント購読および定期監視（`system.runInterval`）を開始する初期化関数

---

## 3. ハードコア対応ホスト限定コマンドと設定画面（UI）仕様

ハードコアモードではワールド設定の「チートの実行」が強制OFFとなるため、チート無効下でも確実に動作しつつ **コマンドはホストのみ利用可能（ゲスト完全遮断）** とする仕組みを `core/host_auth.js` および `core/ui_manager.js` に実装する。

### 3.1 ホストの厳密な識別と永続化 (`core/host_auth.js`)
クライアントホスト環境では最初にワールドへ参加するプレイヤーが必ずホスト本人である仕様、および権限レベルを用いてホストを1名に特定・永続化する。

* **ホストIDの確定と記録**:
  * `world.afterEvents.playerSpawn`（`initialSpawn === true`）において、以下の優先順でワールドの DynamicProperty `noyakki_only:core.host_id` を確定する。
    1. `player.commandPermissionLevel === CommandPermissionLevel.Host` を満たすプレイヤーがスポーンした場合、その `player.id` をホストIDとして記録する。
    2. `noyakki_only:core.host_id` が未設定（`undefined`）の場合、最初にスポーンしたプレイヤー（ワールドを開いたクライアントホスト本人）の `player.id` をホストIDとして記録する。
* **ホスト限定判定関数 `isHostPlayer(player)`**:
  * `player` が有効なプレイヤーであり、かつ **`player.id === world.getDynamicProperty("noyakki_only:core.host_id")`** を満たす場合のみ `true` を返す。
  * **他プレイヤーへの例外許可は禁止**: ホスト以外の参加プレイヤー（ゲスト）に対して、OP権限やタグ付与等によるコマンド利用の例外許可は一切設けない。
* **初回案内**:
  * ホスト本人がワールドへ初回スポーンした際、ホスト本人のみにチャット欄で `§e[のやっきー専用] 設定画面を開くには /noyakki_only:config を実行してください（ホストのみ利用可能）。` と一度だけ案内する。

### 3.2 ホストのみ利用可能なカスタムコマンド規約 (`/noyakki_only:config`)
`system.beforeEvents.startup` 内の `customCommandRegistry.registerCommand` を使用して `/noyakki_only:config` を登録する。今後別の独自コマンドを追加する場合も、必ず以下の規約に従うこと。

* **ハードコア（チートOFF）対応の登録設定**:
  * チートOFFのハードコア環境ではホスト自身も内部コマンド権限レベルが `Any (0)` 扱いとなり、`permissionLevel` に上位権限を指定するとホスト自身すらコマンドを実行できなくなる場合がある。そのため、コマンド定義自体は `cheatsRequired: false` かつ `permissionLevel: CommandPermissionLevel.Any` で登録し、**実行時の共通ガード関数 `assertHostOnly(origin)` によってホストのみに利用を制限する**。
* **共通ガード `assertHostOnly(origin)` による即時遮断（必須）**:
  1. `origin.sourceEntity` が `Player` でない場合（コマンドブロック・サーバー実行等）、または `isHostPlayer(origin.sourceEntity)` が `false`（ホスト以外のゲストプレイヤー）である場合は、いかなる処理・画面表示も行わず即座に `{ status: CustomCommandStatus.Failure, message: "このコマンドはホストのみ利用可能です。" }` を返却して終了する。
  2. ホスト本人が実行した場合のみ `{ status: CustomCommandStatus.Success }` を返し、`system.run()` を介してルート設定画面（`ActionFormData`）の起動処理を開始する。
* **チャット画面閉鎖待ちリトライ（必須）**:
  * スラッシュコマンド送信直後はクライアント側でチャット画面がまだ閉じておらず、`form.show(player)` が `FormCancelationReason.UserBusy` でキャンセルされる。`UserBusy` が返った場合は $2\text{ tick}$ 間隔で最大 $20$ 回（約 $2$ 秒間）自動リトライし、チャットが閉じた直後に確実にウィンドウを開くこと。

### 3.3 設定ウィンドウの階層と機能連携モデル (`core/ui_manager.js`)
ホストが `/noyakki_only:config` を実行すると開く親ウィンドウから、一括ON/OFF切替および各機能の詳細設定ウィンドウへシームレスに遷移できる構成とする。すべてのフォーム表示関数の先頭でも念のため `isHostPlayer(player)` を再確認し、非ホストへUIが表示される経路を完全に塞ぐこと。

1. **親ウィンドウ：ルート設定メニュー (`ActionFormData`)**
   * **タイトル**: `のやっきー専用 設定`
   * **本文**:
     * `現在の経過日数: {world.getDay()}日`
     * 続けて、`feature_registry` に登録された全モジュールの `getStatusSummary()` を一覧表示し、一目で現在の稼働状況を把握できるようにする。
   * **ボタン構成**:
     * **先頭ボタン**: `一括 ON/OFF 切替` $\rightarrow$ 押下すると「一括 ON/OFF 切替フォーム」を開く。
     * **2番目以降のボタン**: 登録順に各機能モジュールのボタンを動的生成する。
       * ラベル書式: ON時は `"{機能名} [§aON§r]"`、OFF時は `"{機能名} [§7OFF§r]"`
       * 押下すると該当モジュールの `openSettingsForm(player, () => openRootMenu(player))` を呼び出し、個別設定へ遷移する。
2. **一括 ON/OFF 切替フォーム (`ModalFormData`)**
   * ワールド新規作成直後に複数の縛り機能を素早くまとめて有効化できるよう、`feature_registry` に登録されている全機能の `toggle`（ラベル: `"{機能名} を有効にする"`、初期値: `feature.isEnabled()`）のみを縦に並べたフォームを表示する。
   * 送信時、変更があった各機能に対して `feature.setEnabled(newValue)` を呼び出して保存し、完了メッセージを通知した上でルート設定メニューを再表示する。
3. **各機能の個別設定フォーム (`ModalFormData`)**
   * 各仕様書（`01`〜`03` 等）で定義された ON/OFF トグルおよび詳細パラメータ（日数・メッセージ等）を編集・保存し、保存後にルート設定メニューへ戻る。

---

## 4. 共通ゲームオーバー（全員HP0化）サービス (`core/game_over.js`)

`#01 一蓮托生` や `#03 デッドライン` など、敗北条件を満たした際に全プレイヤーのHPを0にする機能間で二重発火や競合が起きないよう、ゲームオーバー処理は必ず `core/game_over.js` の共通関数を経由して実行する。

* **永続化キー（World DynamicProperty）**:
  * `noyakki_only:core.gameover_active` (`boolean`, 初期値 `false`): ワールドがすでにゲームオーバー確定済みかを示すグローバル排他ロック
  * `noyakki_only:core.gameover_source` (`string`, 初期値 `""`): 発動元モジュールID（`"f01"`, `"f03"` 等）
  * `noyakki_only:core.gameover_msg` (`string`, 初期値 `""`): 確定したゲームオーバー表示メッセージ
* **共通実行シーケンス `triggerGlobalGameOver(sourceId, message)`**:
  1. `noyakki_only:core.gameover_active` がすでに `true` の場合は何もせず即時リターンする（これにより、全員殺害時の `entityDie` イベント連鎖による他モジュールの誤発火を完全に遮断する）。
  2. `gameover_active = true`, `gameover_source = sourceId`, `gameover_msg = message` を保存する。
  3. 全プレイヤーに対し、画面中央タイトル（`onScreenDisplay.setTitle(message)`）、チャット通知、および効果音（`mob.wither.death`）を再生する。
  4. 生存している全プレイヤーについて、万が一メインハンドまたはオフハンドに `minecraft:totem_of_undying`（不死のトーテム）を保持している場合は発動阻止のため該当スロットから除去した上で、`player.kill()` を実行してHPを $0$ にし、ハードコア標準の死亡・ゲームオーバー画面へ移行させる。念のため翌ティックにも生存確認を行い、HPが残っている場合は再度 `player.kill()` を実行する。
* **オフライン参加者の切断抜け対策**:
  * `world.afterEvents.playerSpawn`（`initialSpawn === true`）において `noyakki_only:core.gameover_active === true` の場合、再接続したプレイヤーがまだスペクテイター・死亡状態でなければ、`gameover_msg` をタイトル・チャットに表示した上で即座に `player.kill()` を実行する。

---

## 5. DynamicProperty 命名規約と日数基準の統一

* **キー命名規則**:
  * コア基盤: `noyakki_only:core.<key>`
  * 各機能モジュール: `noyakki_only:fNN.<key>`（例: `noyakki_only:f01.enabled`, `noyakki_only:f02.days_json`, `noyakki_only:f03.days`）
  * 未初期化（`undefined`）時は必ず各仕様書で定義されたデフォルト値を返すラッパー関数経由で読み書きする。
* **ゲーム内日数の共通基準**:
  * アドオン全体を通して、現在日数は **`world.getDay()`**（ゲーム内HUDの「プレイした日数」表示と完全一致する $0$ 始まりの整数）に統一する。

---

## 6. 変更ライフサイクル別の実装・保守・バージョニング規約

Antigravity は以下のいずれの作業を行う際にも、**作業着手前および完了直前に「第1章 1.2 絶対禁止事項」への違反がゼロであることを必ず確認する** こと。

### 6.1 タイミング別の必須手順
* **アドオン新規作成時**:
  * 第1章・第2章のディレクトリ構成に従い、素の JavaScript（ES Modules）でコア基盤と `specs/01`〜`03` を実装し、`tools/` には PowerShell / .NET 10 標準ライブラリのみを用いたビルド・検証・アイコン生成スクリプトを配置する。初期バージョンは `v1.0.0`（`[1, 0, 0]`）とする。
* **機能追加時（新規 `specs/NN_*.md` の追加）**:
  * 新規モジュール `src/behavior_pack/scripts/features/fNN_<name>.js` を素の JavaScript（関数・モジュール単位）で作成し、`main.js` のレジストリ登録へ追記して非破壊統合する。既存モジュールの仕様や保存キーを壊さないこと。
* **機能修正時（既存 `specs/NN_*.md` の更新・不具合修正）**:
  * 対象モジュールのみを最小差分で修正する。修正や検証のためであっても Node.js / npm / TypeScript / Python / 外部ライブラリ / ネットワーク通信を一時的にでも導入してはならない。
* **機能削除時（既存 `specs/NN_*.md` の廃止・削除）**:
  * `main.js` のレジストリ登録および `import` 文から該当モジュールを削除し、`src/behavior_pack/scripts/features/fNN_*.js` 等の関連ファイル・不要な翻訳キー・孤立した参照を完全にクリーンアップする。
  * 削除された機能の過去の DynamicProperty が既存ワールドに残っていてもエラーを起こさないよう、残存モジュールが削除済みキーへ依存しないことを確認する。

### 6.2 `manifest.json` のセマンティックバージョニング自動更新（必須）
`src/behavior_pack/manifest.json`（および将来 `src/resource_pack/manifest.json` が存在する場合は両方）の `header.version` と `modules` 内の `version`（`[major, minor, patch]`）を以下の規則で更新する。

* **初期状態（`00` + `01`〜`03` 実装完了時点）**: `v1.0.0`（`[1, 0, 0]`）
* **新規マークダウン（`04_*.md` 等）追加時**: $+0.1.0$ — `minor` を $+1$ し、`patch` を $0$ にリセットする（例: `[1, 0, 0]` から `[1, 1, 0]` へ更新）。
* **既存マークダウンの修正・バグ修正・機能削除のみの場合**: $+0.0.1$ — `patch` を $+1$ する（例: `[1, 1, 0]` から `[1, 1, 1]` へ更新）。
* **UUID固定の原則**: `header.uuid` および各 `modules[].uuid` は初回生成後に固定し、以降のバージョンアップ時に絶対に変更してはならない（ワールド上で別パック扱いになり重複適用や DynamicProperty 消失が起きるのを防ぐため）。
* **登録画面でのバージョン表記（必須）**: マイクラ統合版のビヘイビアーパック一覧・登録画面でバージョンを即座に判別できるよう、`src/behavior_pack/texts/ja_JP.lang` の `pack.name` を `のやっきー専用 v{major}.{minor}.{patch}`、`src/behavior_pack/texts/en_US.lang` の `pack.name` を `Noyakki Only v{major}.{minor}.{patch}` とし、`manifest.json` のバージョン更新時に必ず同期する。

### 6.3 完了前チェックゲートとオフラインビルド (`tools/build.ps1`)
すべての変更（新規作成・機能追加・機能修正・機能削除）の完了時、必ず以下の検証とビルドをオフラインで実行する。

1. **禁止ファイル・依存混入チェック**:
   * リポジトリ内に `package.json`, `node_modules/`, `*.ts`, `*.py`, 外部NuGet参照、ネットワーク通信コード、`-beta` API 参照が1つも存在しないことを `tools/build.ps1` で自動検査する。
2. **構文・整合性チェック**:
   * すべての `.json` ファイルに構文エラーがないこと、`texts/ja_JP.lang` が UTF-8（BOMなし）であること、`manifest.json` のバージョンと `texts/ja_JP.lang`・`texts/en_US.lang` の `pack.name` 末尾バージョン表記ならびに出力ファイル名が一致していることを検証する。
3. **パッケージング出力**:
   * PowerShell の標準圧縮機能または .NET 10 標準の `System.IO.Compression` のみを用いて、`dist/noyakki_only_v{major}.{minor}.{patch}.mcpack`（将来 `src/resource_pack/` が追加された場合は `.mcaddon`）を生成する。