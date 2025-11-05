# Line Actions Hardening – 設計

## 概要
LINE ファネルを支える GitHub Actions 群を堅牢化するために、(1) すべてのワークフローを棚卸しして責任者を明確化し、(2) 実行時依存（`curl` ダウンロードや二重ルーター）を排除し、(3) 事前検証で設定漏れをブロックし、(4) テレメトリログとテストカバレッジを強化する。対象は本リポジトリ内で稼働する自動化に限定し、Edge/Deno 側の契約は変更しない。

## アーキテクチャ / データフロー

```
LINE / Manus Webhooks → Edge Relay (Deno) → repository_dispatch → GitHub Actions
                                                                       │
                                            ┌───────────────────────────┴────────────┐
                                            │ ワークフロー棚卸し & 設定検証レイヤー │
                                            └───────────────────────────┬────────────┘
                                                                         │
          ┌──────────────────────┬─────────────────────┬─────────────────┴──────────────────┐
          │ 強化版 line-event   │ 強化版 manus-…     │ 正規ルーター webhook-handler        │
          └──────┬──────────────┴──────────┬────────┴──────────┬────────────────────────┘
                 │                           │                    │
        Supabase ヘルパー（ベンドル） Manus ヘルパー   運用ガードレール系ワークフロー
                 │                           │                    │
          Supabase REST              Manus API          Google Sheets / GitHub Artifact
```

- **ワークフロー棚卸し:** `scripts/automation/generate-workflow-inventory.mjs` が `.github/workflows/**/*.yml` を走査し、名称・トリガー・責任者（`x-owner` メタ情報）・最終更新を抽出して `docs/automation/WORKFLOWS.md` を生成する。
- **設定検証レイヤー:** 主要ワークフロー冒頭で `uses: ./.github/actions/validate-config` を実行し、必要な secrets/vars の存在を確認。欠如時は手順付きエラーで即時失敗させる。
- **ベンドル済みヘルパー:** Supabase / Sheets 用スクリプトを `scripts/vendor/` に格納し、チェックサムを `manifest.json` で管理。`node scripts/vendor/sync.js` で上流更新を反映する。
- **ログ永続化:** 再利用可能コンポジットアクション `./.github/actions/persist-progress` が git commit/push を試行。失敗時はタイムスタンプ付きバンドルとして `actions/upload-artifact` に退避し、`rotate-logs.yml` のローテーション方針を維持しつつ欠損を防ぐ。

## 詳細アプローチ

1. **ワークフロー棚卸しと責任者定義**
   - 各ワークフローに任意の `x-owner` メタデータ（例: `ops`, `devops`）を追加。
   - Node 20 + `yaml` パッケージで Markdown の一覧表を生成し、`docs/automation/WORKFLOWS.md` としてコミット。
   - `.sdd/steering/tech.md` から棚卸しドキュメントへリンクを張る。

2. **Supabase ヘルパーのベンドル化**
   - `scripts/vendor/supabase/` と `scripts/vendor/google/` に既存のヘルパースクリプトを配置。
   - `scripts/vendor/manifest.json` に元リポジトリ・コミットハッシュ・各ファイルの SHA-256 を記録。
   - `npm run vendor:sync`（`scripts/vendor/sync.mjs`）で同期し、CI では `npm run vendor:verify` でチェックサムを検証。
   - `line-event.yml` から `curl` ステップを削除し、ベンドル済みスクリプトを直接参照する。

3. **ルーター統合**
   - 正規ルーターを `webhook-handler.yml` に統一。`webhook-event-router.yml` にのみ存在する機能（TypeScript ルーター呼び出し等）はモジュール化して移植。
   - 旧ワークフローはアーカイブまたは削除し、単一エントリポイントであることをドキュメント化。
   - `/agent` コマンドや重大障害時の `gh` CLI エスカレーションを継続サポート。

4. **事前設定バリデーション**
   - `.github/actions/validate-config/action.yml` を定義し、`node scripts/checks/validate-config.mjs` を実行。
   - `config/workflows/required-secrets.json` にワークフロー単位の必須 secrets/vars を記載。
   - 欠如したキーを検知した場合は、設定手順へのリンク付きメッセージで失敗。

5. **堅牢なログ永続化**
   - ログ commit ロジックを `.github/actions/persist-progress`（シェル + `node scripts/logs/archive.mjs`）に集約。
   - git push が弾かれた場合は `tmp/logs` 以下に退避し、`actions/upload-artifact`（保持期間 90 日）へアップロード。
   - `rotate-logs.yml` を強化し、可能であれば GitHub API で古い Artifact も削除。

6. **自動テスト / CI 強化**
   - `yaml`, `tsx`, `uvu` などを `devDependencies` に追加し、スクリプト単体テストを整備。
   - `tests/actions/` に Supabase / Sheets / Manus のモック HTTP を用意し、`undici` MockAgent で外部依存を隔離。
   - 既存 `node-tests.yml` を拡張、または `workflow-scripts.yml` を新設して `npm test` / `npm run test:actions` を実行。
   - ラベル `ci-smoke` 付与 PR 向けに `act` でのスモークテストジョブを追加し、`line-event` のハッピーパスを検証。

7. **ドキュメント / オンボーディング**
   - `docs/RUNBOOK.md` にベンダー同期手順、ルーター保守、ログ Artifact 取得方法を追記。
   - `.sdd/steering/tech.md` から棚卸しドキュメントへのクロスリンクを設定。

## 検討した代替案
- **npm パッケージ化:** ビルド・公開パイプラインが増え更新が遅延するため却下。ベンドル化の方が監査しやすい。
- **Supabase ストレージへのログ退避:** 追加認証が不要な GitHub Artifact へ退避する方針を優先し、将来検討とする。
- **ルーターの多重運用:** 保守コストと挙動乖離を避けるため単一ルートに統一。

## リスクと緩和策
- **リスク:** ブランチプロテクションで Actions の push が拒否され続ける。
  - **緩和:** PAT + 環境プロテクションの手順を明文化し、失敗時は Artifact 退避でログ欠損を防ぐ。
- **リスク:** ベンドルスクリプトが上流と乖離。
  - **緩和:** CI でチェックサム検証を行い、リリースチェックリストに同期作業を組み込む。
- **リスク:** 設定検証で secrets 漏れが頻発。
  - **緩和:** セットアップ手順を整備し、緊急時は `SKIP_CONFIG_VALIDATION` フラグで回避可能にする。
- **リスク:** テスト追加で CI 時間が増える。
  - **緩和:** Node テストジョブを並列化し、スモークテストはラベル付き PR のみで実行。

## テスト戦略
- **ユニットテスト:** Node `--test` で Supabase / Sheets / Manus ヘルパー、設定バリデータ、ログアーカイバ、ルーター処理をモック HTTP 付きで検証。
- **結合テスト:** `act` を用いたワークフロースモークテストで `line-event` エンドツーエンドを外部通信なしに確認。
- **リグレッション:** CI で `npm run vendor:verify` を実行し、ベンドルファイル改変を即検知。
- **セキュリティ:** `actionlint` によるワークフロー lint を導入し、統合後の YAML を検証。

## デプロイ / 移行手順
1. ドキュメントとスクリプト（`docs/automation/WORKFLOWS.md`、ベンダーマニフェスト、設定検証アクション）を追加。
2. `line-event.yml` 等から `curl` 依存を除去し、ベンドル済みスクリプトへ置換。
3. ルーターを移行し、`webhook-event-router.yml` を削除またはアーカイブ。
4. `line-event.yml`、`manus-progress.yml` などログを push するワークフローへ新コンポジットアクションを組み込み。
5. CI パイプライン（`node-tests.yml`、`workflow-scripts.yml`）を更新し、`contents:write` 付き PAT を保護環境で利用可能にする。
6. リリースノートで変更を周知し、Ops/Compliance に Artifact 退避ポリシーをレビューしてもらう。

## 承認待ち事項
- ベンダーマニフェスト更新のオーナーを DevOps が担うことの確認。
- Artifact 退避ポリシーに対する Ops / Compliance の最終承認。
- `contents:write` を付与した PAT / トークンスコープを Repo Admin が準備できるかの確認。

ステークホルダー承認後、`/sdd-tasks` に進み実装タスクへ分解する。
