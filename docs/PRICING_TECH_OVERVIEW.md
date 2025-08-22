# Pricing Engine Technical Overview

## 1. Files & Entry Points
| Layer | File | Purpose |
|-------|------|---------|
| UI Form | `components/pricing/smart-price-rule-form.tsx` | Unified create/edit rule multi-step form |
| Create Page | `app/dashboard/pricing/books/[id]/rules/new/page.tsx` | Server action insert rule |
| Edit Page | `app/dashboard/pricing/books/[id]/rules/[ruleId]/edit/page.tsx` | Server action update/delete |
| Listing | `app/dashboard/pricing/books/[id]/page.tsx` | Displays rules, bulk actions |
| Engine | `lib/pricing/engine.ts` | Compute final price for SKU/qty/time |
| SQL Schema | `sql/pricing_schema.sql` | Table definition |
| Seed Data | `sql/seed_price_rules.sql` | Sample rule inserts |
| Access | `sql/pricing_rules_access.sql` / `pricing_rules_write_access.sql` | RLS policies |
| Generation Script | `sql/generate_pos_rules_from_products.sql` | Bulk create NET rules from products |

## 2. Data Flow (Create/Edit)
```
User -> SmartPriceRuleForm (client) -> form submit -> Server Action (page.tsx) -> Supabase insert/update -> revalidatePath -> redirect listing
```
Delete: Edit form delete button -> server action delete -> revalidate -> redirect.

## 3. Form Logic Highlights
- Stepwise UX: Scope -> Action -> Price Config -> Advanced.
- Dynamic suggestions (suggestedActions) depend on scope.
- Price preview computed client-side (single rule heuristic).
- Dirty state disables submit in edit until a change.
- Debounced search pickers prevent API spam (300ms, cache + last query suppression).
- Quantity condition preview summarizes min/max constraints.

## 4. Validation (Currently Duplicated)
Both new & edit pages replicate logic:
```
- scope, action_type required
- action_value finite
- scope-specific existence checks (products, categories)
- action_value ranges by type
- quantity range validity
- effective date ordering
```
Refactor target: extract to `lib/pricing/validate-rule.ts` returning `{ ok, problems, normalized }`.

## 5. Engine (`lib/pricing/engine.ts`) Summary
Filtering pipeline:
1. Load all rules for price_book_id.
2. Filter active.
3. Filter effective window.
4. Filter quantity (>= min_qty AND <= max_qty when not null).
5. Filter scope match (exact SKU preferred by priority naturally).
6. Pick rule with highest priority.
7. Apply action transformation.

Potential extension: multi-rule stacking; weighting by scope specificity (sku > category > tag) before priority tie-breaker.

## 6. Performance Considerations
- Current engine loads all rules for book then filters in-memory. For large sets optimize with SQL where clauses (push filters server-side) or materialized views.
- Picker search now client cached; could move to API endpoints with `LIKE` & pagination.
- Future: Add composite indexes: `(price_book_id, is_active, scope)`, `(price_book_id, sku_code)`, `(price_book_id, category_id)`.

## 7. Security / RLS
Ensure RLS policies allow appropriate read/write for authenticated role only. See access policy SQL files. No customer segmentation yet; safe to broaden read.

## 8. Adding New `action_type`
1. Update UI enum & suggestions.
2. Extend validation switch.
3. Extend engine switch.
4. (Optional) Migration if additional fields needed (e.g., promo label, stack flags).

## 9. Observability / Logging (Gap)
No structured logging around rule evaluation; add instrumentation in engine for debugging (e.g., return chosenRule + reasons, optionally store evaluation traces).

## 10. Roadmap (Tech)
| Item | Benefit |
|------|---------|
| Extract validation util | DRY & testable |
| Add unit tests engine | Prevent regression when adding stacking |
| Add evaluation API `/api/pricing/preview` | External systems can request price |
| Switching to server-driven filtering | Large rule sets performance |
| Index additions | Query speed |
| Promotion specialization | Distinguish promotion semantics |
| Rule versioning / audit | Compliance & traceability |

## 11. Quick Reference Enums
```
Scope: 'sku' | 'category' | 'tag'
ActionType: 'net' | 'percent' | 'amount' | 'promotion'
```

## 12. Known Edge Cases
- action_value = 0 with percent/amount => still valid (no change / zero discount) – currently accepted.
- Overlapping rules same priority: engine just picks first with max priority (implicit) – might be nondeterministic ordering.
- Timezone: stored `timestamptz`, client uses local when entering datetimes; ensure consistent UTC handling.
- Large qty when max_qty null: rule matches any qty >= min_qty.

---
Update this file with any structural changes so assistants understand the tech layer quickly.
