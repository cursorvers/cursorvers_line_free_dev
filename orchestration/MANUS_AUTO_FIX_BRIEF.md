# Manus Auto Fix Brief

## Mission

GitHub Actions の監査失敗を自動修繕し、最小限の変更で復旧してください。

## Context

- Repository: https://github.com/mo666-med/cursorvers_line_free_dev
- Trigger: 監査ワークフローの失敗
- Input: 監査レスポンス、エラータイプ、HTTPコード

## Responsibilities

1. 監査レスポンスと関連ログを分析する
2. 根本原因を特定し、必要最小限の修正を行う
3. 修正内容の検証手順を明示する
4. Secrets の更新が必要な場合は GitHub Issue を作成し手順を記載する

## Constraints

- Secrets を直接変更しない
- 既存の設計・命名・構造を尊重する
- 変更は最小限に留める

## Output

- 修正内容の要約
- 影響範囲
- 追加で必要な対応（Issue / 手動手順）
