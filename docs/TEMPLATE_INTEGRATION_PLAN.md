# Template Integration Plan – dev-infra Sync

最終更新: 2025-11-04

## 1. 背景

`./dev-infra/dev.sh diff-template --target ~/Dev/cursorvers_line_free_dev --detail` の結果、テンプレート適用時に **428 件** の削除候補が検出された。主に以下の資産が削除対象となり、このまま `apply-template` を実行すると Phase1 成果物が失われる。

- 全ドキュメント (`docs/` 190 件超)
- GitHub Actions ワークフロー (`.github/workflows/` 40 件)
- Supabase / Sheets / KPI 連携スクリプト (`scripts/` 52 件)
- `.sdd/` 配下の要求仕様・設計・タスク情報
- `orchestration/plan/**` や `functions/relay/**` などの本番コード

## 2. 差分カテゴリと件数

| カテゴリ (top-level) | 件数 | 主な内容 |
| --- | --- | --- |
| `docs/` | 190 | Phase1 ドキュメント、Runbook、テストマトリクスなど |
| `.github/workflows/` | 40 | line-event, manus-progress, plan-validator など CI/CD 資産 |
| `scripts/` | 52 | Supabase/Sheets アップサート、KPI レポート、budget 集計 |
| `.sdd/` | 18 | line-funnel の requirements/design/tasks/traceability |
| `orchestration/` | 10 | current/degraded plan, cost スクリプト |
| `functions/` | 4 | edge relay テスト・KV 実装 |
| その他 (`Cursorvers_LINEsystem`, `.claude`, `.cursor` etc) | 114 | 既存プロジェクト固有リソース |

詳細は `/tmp/template_diff.json` に記録。`jq 'group_by(.path|split(\"/\")[0])'` でカテゴリ別集計済み。

## 3. 適用方針（案）

1. **ホワイトリスト方式でのテンプレ適用**  
   - `apply-template.sh` に `--exclude-file` オプションを実装し、除外パターンを記載したファイルを渡す。  
   - `dev-infra/templates/excludes/cursorvers-line-free-dev.txt` を基点に、既存資産を `rsync --exclude-from` で保護する。

2. **テンプレート側の整理**  
   - `templates/default` からこのリポジトリに不要な項目（空 README など）を削除し、共通運用に必要なスクリプト/CI のみ残す。  
   - docs など固有リソースはテンプレート外管理とする。

3. **段階的適用**  
   - 上記調整後、小規模なサブセットで `apply-template --overwrite` を試行し `git diff` で影響範囲を確認。  
   - 問題なければ main ブランチに反映し、各ワークツリーに順次展開。

## 4. 未決事項

- どのファイルをテンプレート由来として保持し、どこから先をプロジェクト固有とするかの線引き。
- `Cursorvers_LINEsystem/` の扱い（過去アーティファクトとして残すか、テンプレ適用前に別リポジトリへ移すか）。
- `.claude/` など他ツールの設定類をテンプレ共有対象とするか否か。

## 5. 次のアクション

1. 除外リスト（`dev-infra/templates/exclude-cursorvers.txt` 等）の作成。  
2. `apply-template.sh` に `--exclude-file` サポートを追加済み。今後は `./dev-infra/dev.sh apply-template --target ~/Dev/cursorvers_line_free_dev --exclude-file dev-infra/templates/excludes/cursorvers-line-free-dev.txt` の形式で試行する。  
3. Phase1 未完タスクと平行して、テンプレ適用の PoC をサンドボックスワークツリーで実施。  
4. 結果を `/sdd/specs/line-funnel/tasks.md` の Dev-Infra チェックリストへ反映。

テンプレ適用の具体的な実装方法が決まり次第、本書を更新すること。
