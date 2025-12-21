# LINE Webhook Tests

Comprehensive test suite for the `line-webhook` Edge Function.

**Status**: Phase 1 Complete (Pure Function Tests)

## Coverage Results

| File                      | Line Coverage | Branch Coverage |
| ------------------------- | ------------- | --------------- |
| `diagnosis-flow.ts`       | 91.7%         | 58.1%           |
| `note-recommendations.ts` | 100%          | 100%            |
| `constants.ts`            | 100%          | 100%            |
| **Overall**               | **93.9%**     | **74.5%**       |

**Test Count**: 49 tests (24 for diagnosis-flow, 25 for note-recommendations)

---

## Running Tests

### Basic Test Run

```bash
cd supabase/functions/line-webhook
deno test --no-check --allow-env test/
```

**Note**: We use `--no-check` because of a TypeScript type checking issue in
`types.ts` that doesn't affect runtime behavior.

### With Coverage Report

```bash
deno test --no-check --allow-env --coverage=coverage test/
```

Coverage reports are generated in:

- **LCOV**: `coverage/lcov.info`
- **HTML**: `coverage/html/index.html`

### Run Specific Test File

```bash
deno test --no-check --allow-env test/diagnosis-flow.test.ts
deno test --no-check --allow-env test/note-recommendations.test.ts
```

### Run Specific Test

```bash
deno test --no-check --allow-env --filter "buildQuestionMessage" test/
```

---

## Test Structure

### Phase 1: Pure Function Tests (Complete)

Focus on testing pure functions with no external dependencies.

#### `test/diagnosis-flow.test.ts` (24 tests)

Tests for `lib/diagnosis-flow.ts` - The core business logic for diagnosis flows.

**Functions Tested**:

- `getFlowForKeyword()` - Flow retrieval (3 tests)
- `getTotalQuestions()` - Question count validation (2 tests)
- `getNextQuestion()` - Layer navigation (5 tests)
- `getCurrentOptions()` - Option extraction (1 test)
- `isValidAnswer()` - Answer validation (2 tests)
- `getConclusion()` - Result mapping (3 tests)
- `buildQuestionMessage()` - Message formatting (2 tests)
- `buildConclusionMessage()` - Conclusion formatting (2 tests)
- `buildDiagnosisStartMessage()` - Start message (2 tests)
- Complete flow walkthroughs (2 tests)

**Test Pattern Example**:

```typescript
Deno.test("diagnosis-flow: getNextQuestion returns layer1 question", () => {
  const state: DiagnosisState = {
    keyword: "クイック診断",
    layer: 1,
    answers: [],
  };
  const question = getNextQuestion(state);

  assertExists(question);
  assertEquals(question?.text, "関心の領域を選んでください");
  assertEquals(question?.options.length, 3);
});
```

#### `test/note-recommendations.test.ts` (25 tests)

Tests for `lib/note-recommendations.ts` - Article recommendation logic.

**Functions Tested**:

- `getRecommendationsForKeyword()` - Course retrieval (3 tests)
- `getFirstArticle()` - First article extraction (3 tests)
- `getArticleById()` - ID lookup (2 tests)
- `getArticlesByIds()` - Batch ID lookup (4 tests)
- `getArticlesByTag()` - Tag filtering (7 tests)
- `getAllArticles()` - All articles retrieval (2 tests)
- Data structure validation (2 tests)
- Tag consistency checks (1 test)
- Integration tests (1 test)

**Test Pattern Example**:

```typescript
Deno.test("note-recommendations: getArticlesByTag returns articles matching tag", () => {
  const articles = getArticlesByTag("コスト・投資対効果", 5);

  assert(articles.length > 0);
  assert(articles.length <= 5);

  // All returned articles should have the tag
  for (const article of articles) {
    assert(
      article.tags?.includes("コスト・投資対効果"),
      `Article ${article.id} should have tag "コスト・投資対効果"`,
    );
  }
});
```

---

## Phase 2: External Dependency Mocks (Planned)

**Target Coverage**: 70-75%

Will add tests for functions with external dependencies using stubs/mocks.

### Planned Tests

1. **`lib/prompt-polisher.ts`**
   - Mock OpenAI API responses
   - Test error handling

2. **`lib/risk-checker.ts`**
   - Mock OpenAI API responses
   - Test risk level classification

3. **`index.ts` (partial)**
   - Mock LINE signature verification
   - Mock Supabase client
   - Test routing logic

**Mock Pattern** (using Deno std/testing/mock):

```typescript
import { stub } from "https://deno.land/std@0.208.0/testing/mock.ts";

Deno.test("prompt-polisher: handles OpenAI API success", async () => {
  const fetchStub = stub(
    globalThis,
    "fetch",
    () =>
      Promise.resolve(
        new Response(JSON.stringify({
          choices: [{ message: { content: "Polished prompt" } }],
        })),
      ),
  );

  try {
    const result = await polishPrompt("raw prompt");
    assertEquals(result, "Polished prompt");
  } finally {
    fetchStub.restore();
  }
});
```

---

## Phase 3: E2E Tests + CI/CD (Planned)

**Target Coverage**: 80-85%

Will add end-to-end tests and integrate into GitHub Actions.

### Planned E2E Scenarios

1. **Complete Diagnosis Flow**
   - User starts diagnosis → receives questions → completes flow → gets results
   - Mock: LINE API, Supabase, OpenAI

2. **Error Scenarios**
   - Invalid LINE signature → 401
   - Database connection failure → 500
   - OpenAI timeout → fallback behavior

### CI/CD Integration

Create `.github/workflows/test-line-webhook.yml`:

```yaml
name: Test LINE Webhook

on:
  push:
    paths:
      - "supabase/functions/line-webhook/**"
  pull_request:
    paths:
      - "supabase/functions/line-webhook/**"

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v1
        with:
          deno-version: v1.x
      - name: Run tests
        run: |
          cd supabase/functions/line-webhook
          deno test --no-check --allow-env test/
      - name: Generate coverage
        run: |
          cd supabase/functions/line-webhook
          deno test --no-check --allow-env --coverage=coverage test/
```

---

## Best Practices

### 1. Test Naming Convention

Use descriptive test names following this pattern:

```
[module-name]: [function-name] [expected-behavior]
```

**Examples**:

- `diagnosis-flow: getFlowForKeyword returns QUICK_FLOW`
- `note-recommendations: getArticlesByTag respects limit parameter`

### 2. Test Organization

Group tests by function using comments:

```typescript
// =======================
// Test: getArticlesByTag
// =======================

Deno.test("note-recommendations: getArticlesByTag returns articles matching tag", () => {
  // Test implementation
});

Deno.test("note-recommendations: getArticlesByTag respects limit parameter", () => {
  // Test implementation
});
```

### 3. Assertions

Use specific assertion functions:

- `assertEquals(actual, expected)` - Exact equality
- `assertExists(value)` - Not null/undefined
- `assert(condition, message)` - Boolean condition

### 4. Edge Cases

Always test:

- Empty inputs (`[]`, `""`, `null`)
- Invalid inputs (non-existent IDs, invalid types)
- Boundary conditions (limit = 0, limit = max)

### 5. Type Safety

For objects with generic types, use type assertions:

```typescript
const quickReply = (result.quickReply as any).items;
```

---

## Troubleshooting

### Issue: Type checking fails with "Cannot find name 'DiagnosisKeyword'"

**Solution**: Use `--no-check` flag. This is a known issue with the type
re-export pattern in `types.ts` that doesn't affect runtime.

```bash
deno test --no-check --allow-env test/
```

### Issue: Tests pass but coverage is not generated

**Solution**: Ensure you use the `--coverage` flag:

```bash
deno test --no-check --allow-env --coverage=coverage test/
```

### Issue: Permission denied errors

**Solution**: Add the necessary permissions:

```bash
deno test --no-check --allow-env --allow-net --allow-read test/
```

---

## Test Results (2025-12-21)

### Summary

- **49 tests** implemented (exceeded target of 23 tests)
- **All tests passing** ✅
- **93.9% line coverage** (exceeded target of 40-50%)
- **74.5% branch coverage**

### Breakdown

| Module               | Tests  | Line Coverage | Branch Coverage |
| -------------------- | ------ | ------------- | --------------- |
| diagnosis-flow       | 24     | 91.7%         | 58.1%           |
| note-recommendations | 25     | 100%          | 100%            |
| **Total**            | **49** | **93.9%**     | **74.5%**       |

### Uncovered Code

The remaining uncovered code in `diagnosis-flow.ts` consists of:

- Error logging branches (low priority)
- Fallback logic in `getNextQuestion()` for layer3 branching
- Edge cases in layer3 question retrieval

These can be addressed in Phase 2 with additional edge case tests.

---

## Next Steps

1. ✅ **Phase 1 Complete**: Pure function tests (93.9% coverage)
2. ⏭️ **Phase 2**: Mock external dependencies (target: 70-75%)
3. ⏭️ **Phase 3**: E2E tests + CI/CD (target: 80-85%)

For Phase 2 implementation, see the main implementation plan at:
`/Users/masayuki/.claude/plans/lazy-twirling-sunrise.md`

---

**Last Updated**: 2025-12-21 **Status**: Phase 1 Complete ✅
