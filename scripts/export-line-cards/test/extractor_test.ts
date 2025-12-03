/**
 * Extractor Unit Tests
 */

import { assertEquals, assertArrayIncludes } from "https://deno.land/std@0.210.0/assert/mod.ts";
import { extractCardsFromFile } from "../src/extractor.ts";
import { join } from "https://deno.land/std@0.210.0/path/mod.ts";

const TEST_VAULT = join(Deno.cwd(), "test", "fixtures");

// Create test fixtures directory and files
async function setupTestFixtures(): Promise<void> {
  const fixturesDir = TEST_VAULT;
  try {
    await Deno.mkdir(fixturesDir, { recursive: true });
  } catch {
    // Directory might already exist
  }

  // Create sample test file
  const sampleContent = `# Test Note

This is a regular line without tags.

- This is a tagged line #cv_line #ai_gov
- Another tagged line with tax theme #cv_line #tax
- Regular bullet point
- General tagged line #cv_line

## Section 2

Some more content here.
- Nested item with #cv_line #career theme
  - Sub-item that should be included
`;

  await Deno.writeTextFile(join(fixturesDir, "sample.md"), sampleContent);
}

// Clean up test fixtures
async function cleanupTestFixtures(): Promise<void> {
  try {
    await Deno.remove(TEST_VAULT, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

Deno.test({
  name: "extractCardsFromFile - extracts #cv_line tagged lines",
  async fn() {
    await setupTestFixtures();
    try {
      const result = await extractCardsFromFile(
        join(TEST_VAULT, "sample.md"),
        TEST_VAULT
      );

      assertEquals(result.errors.length, 0, "Should have no errors");
      assertEquals(result.cards.length, 4, "Should extract 4 cards");
    } finally {
      await cleanupTestFixtures();
    }
  },
});

Deno.test({
  name: "extractCardsFromFile - correctly identifies themes",
  async fn() {
    await setupTestFixtures();
    try {
      const result = await extractCardsFromFile(
        join(TEST_VAULT, "sample.md"),
        TEST_VAULT
      );

      const themes = result.cards.map((c) => c.theme);

      assertArrayIncludes(themes, ["ai_gov"], "Should have ai_gov theme");
      assertArrayIncludes(themes, ["tax"], "Should have tax theme");
      assertArrayIncludes(themes, ["career"], "Should have career theme");
      assertArrayIncludes(themes, ["general"], "Should have general theme");
    } finally {
      await cleanupTestFixtures();
    }
  },
});

Deno.test({
  name: "extractCardsFromFile - removes tags from body",
  async fn() {
    await setupTestFixtures();
    try {
      const result = await extractCardsFromFile(
        join(TEST_VAULT, "sample.md"),
        TEST_VAULT
      );

      result.cards.forEach((card) => {
        assertEquals(
          card.body.includes("#cv_line"),
          false,
          "Body should not contain #cv_line"
        );
        assertEquals(
          card.body.includes("#ai_gov"),
          false,
          "Body should not contain #ai_gov"
        );
      });
    } finally {
      await cleanupTestFixtures();
    }
  },
});

Deno.test({
  name: "extractCardsFromFile - generates unique content hash",
  async fn() {
    await setupTestFixtures();
    try {
      const result = await extractCardsFromFile(
        join(TEST_VAULT, "sample.md"),
        TEST_VAULT
      );

      const hashes = result.cards.map((c) => c.contentHash);
      const uniqueHashes = new Set(hashes);

      assertEquals(
        hashes.length,
        uniqueHashes.size,
        "All content hashes should be unique"
      );
    } finally {
      await cleanupTestFixtures();
    }
  },
});

Deno.test({
  name: "extractCardsFromFile - records correct source line numbers",
  async fn() {
    await setupTestFixtures();
    try {
      const result = await extractCardsFromFile(
        join(TEST_VAULT, "sample.md"),
        TEST_VAULT
      );

      result.cards.forEach((card) => {
        assertEquals(
          typeof card.sourceLine,
          "number",
          "Source line should be a number"
        );
        assertEquals(
          card.sourceLine > 0,
          true,
          "Source line should be positive"
        );
      });
    } finally {
      await cleanupTestFixtures();
    }
  },
});

