# Log Persistence Runbook

GitHub Actions から生成される JSON/テキストログは `.github/actions/persist-progress` を通して永続化します。  
このコンポジットアクションは、まずリポジトリに直接コミット・プッシュを試み、失敗した場合に GitHub Artifact へ自動退避します。

## ワークフローでの使用例

```yaml
- name: Persist event log
  uses: ./.github/actions/persist-progress
  with:
    path: ${{ steps.line_log.outputs.path }}
    commit-message: chore: log line event
    artifact-label: line-event
    push-token: ${{ secrets.ACTIONS_CONTENTS_PAT }}
```

- `path`: 複数ファイルは改行区切りで指定します。
- `push-token`: `contents:write` 権限を持つ PAT。未設定時は `GITHUB_TOKEN` を使用します。ブランチ保護で `GITHUB_TOKEN` が弾かれる場合は環境保護付きで `ACTIONS_CONTENTS_PAT` などを用意してください。
- `artifact-label`: 失敗時に `label-YYYYMMDDhhmmss` の形式で Artifact を作成します。
- `retention-days`: デフォルト 90 日。必要に応じて短縮/延長できます。

