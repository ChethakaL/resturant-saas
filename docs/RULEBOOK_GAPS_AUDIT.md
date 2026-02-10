# iServe+ Smart Menu Engine — Rulebook Gaps Audit

This document lists **what is missing** relative to the **Revenue Optimization Rulebook v1.0** and your **GAPS TO CLOSE** list. No development has been done; this is an audit only.

---

## HIGH PRIORITY — Missing Entirely

### 1. AI Personalization Layer (Rulebook §13)

| Requirement | Status | Notes |
|-------------|--------|--------|
| **Returning customer recognition** | ❌ Missing | No customer/session identity; no “previous order” or returning-user detection. |
| **Previous order display** | ❌ Missing | No storage or display of last order for a returning guest. |
| **Table-size–aware suggestions** | ❌ Missing | No `tableSize` or party size input; no “table > 3 → suggest sharing platter”. |
| **Upgrade variation for returning** | ❌ Missing | No logic to “increase mid-tier suggestion” for returning customers. |

**Where it would live:** Public menu page (e.g. `src/app/page.tsx`), `SmartMenu` (session/context), new API or storage for “last order” and optional table/party size.

---

### 2. Experimental Framework (Rulebook §14)

| Requirement | Status | Notes |
|-------------|--------|--------|
| **A/B testing infrastructure** | ❌ Missing | No experiments, variants, or assignment. |
| **Price tests (e.g. 18 vs 17.9 vs 18.5)** | ❌ Missing | No price variant assignment or tracking. |
| **Photo vs no-photo test** | ❌ Missing | No experiment to show/hide image by variant. |
| **Sequential vs bundled upsell test** | ❌ Missing | No experiment switching upsell strategy. |
| **Conversion / attachment rate tracking** | ❌ Missing | No event logging or metrics for conversion, attachment rate, average ticket, scroll abandonment. |

**Where it would live:** New experiment/variant service, event logging (e.g. menu view, add-to-cart, checkout), analytics or reporting for metrics.

---

## MEDIUM PRIORITY — Partially Done

### 3. Live Profit Mode (Rulebook §8)

| Requirement | Status | Notes |
|-------------|--------|--------|
| **Ingredient expiry detection** | ❌ Missing | Scarcity uses only prepped-dish stock count and today’s sales. No ingredient-level expiry dates (schema has no expiry field; no “expiring soon” logic). |
| **Stock excess alerts** | ❌ Missing | No “excess stock” detection or alerts for the menu/customer UI. |
| **“Limited Today” / “Today’s Selection” badges** | ✅ Done | `computeScarcityBadges()` in `menu-engine.ts`; badges shown when prepped stock ≤ 5 or low daily sales. |
| **Slight price reduction (no “discount” wording)** | ❌ Missing | Badges exist; **no dynamic price adjustment**. Rule: “Slight price reduction … Never say Discount. Use Today’s Selection.” |

**Where to change:** `src/lib/menu-engine.ts` (scarcity + optional price modifier), schema/APIs if ingredient expiry is added; customer menu to show adjusted price when applicable.

---

### 4. Premium Perception — 1 Hero Image per Category (Rulebook §9, RULE 10)

| Requirement | Status | Notes |
|-------------|--------|--------|
| **1 hero image per category** | ❌ Not enforced | Engine sets `displayTier: 'hero'` for position ≤ 2 **within each subgroup** (STARs in positions 1–2). So multiple items per category can be “hero”. Rule: “1 hero image **per category**”. |
| **High-margin items get image priority** | ⚠️ Partial | STAR and PUZZLE get `showImage: true`; **WORKHORSE also gets `showImage: true`**. Rule: “Cheap items → text only”; WORKHORSE (low margin) should not have image priority. |
| **Cheap items → text only** | ❌ Not enforced | DOG gets `showImage: false`; WORKHORSE does not. |

**Where to change:** `src/lib/menu-engine.ts` — `computeDisplayHints()`: (1) cap at one hero per category, (2) set WORKHORSE to `showImage: false` (or only one “workhorse” image per category if you allow one exception).

---

### 5. Decision Flow UI (Rulebook §10)

| Requirement | Status | Notes |
|-------------|--------|--------|
| **Max 3 swipes per category** | ❌ Missing | Categories show all items in a grid/list; no “swipe” limit or “max 3 swipes” enforcement. |
| **Suggested next item after 6s idle** | ⚠️ Wrong behavior | Idle popup exists and uses `idleUpsellDelaySeconds` (e.g. 6s). **It promotes a STAR (hero/featured) item**, not a **contextual “suggested next item”** (e.g. next logical item in flow or based on current category/selection). |
| **Large hero, sticky Add to order, basket preview** | ✅ Largely done | Layout and sticky behavior exist. |

**Where to change:** `SmartMenu.tsx` (idle popup: suggest contextual next item; optional swipe counting per category); `menu-engine` or settings if “max 3 swipes” is a rule (e.g. show only first N items until “see more”).

---

## LOW PRIORITY — Minor Gaps

### 6. Red Flags (Rulebook §15)

| Requirement | Status | Notes |
|-------------|--------|--------|
| **Identical description length** | ❌ Missing | No validation or detection of items with same description length (or very similar). |
| **Equal visual weight detection** | ❌ Missing | No check that items in a category have varied visual weight (e.g. image vs no image, tier). |
| **Other red flags** | ⚠️ Partial | “Too many choices” is partly addressed by 5–7 item cap and sub-groups. No discount language in customer UI. Alphabetical sorting not used; category order is by profit. |

**Where to add:** Admin/settings validation (e.g. when saving menu or in a “menu health” report); optional runtime checks before rendering.

---

### 7. Price Psychology (Rulebook §7)

| Requirement | Status | Notes |
|-------------|--------|--------|
| **High anchor in every category** | ⚠️ Partial | `computePriceAnchoring()` orders by price and marks premium as anchor; **if category has no expensive item**, there is no high anchor. |
| **Bundle upgrade as anchor when no high anchor** | ❌ Missing | Rule: “If no high anchor exists → create bundle upgrade option to serve as anchor.” Bundles are generated from co-purchase but **not** used as category anchor when no natural high-price item exists. |
| **Decoy / anchor system** | ✅ Present | Anchor set from highest-price item; target profit and safe option ordering exist. |

**Where to change:** `src/lib/menu-engine.ts` — in category ordering / anchoring, when max price in category is below a threshold, inject a bundle (e.g. “X + Y Experience”) as the anchor.

---

### 8. Right-Justified Prices Forbidden (Rulebook §4, RULE 8)

| Requirement | Status | Notes |
|-------------|--------|--------|
| **Align prices next to description; avoid vertical price column** | ⚠️ Arguable | In `MenuItemCard`, price is in a row with `justify-between` (title left, **price right**). Rule: “Right-justified prices = FORBIDDEN”. So current layout is a **right-justified price** column. |

**Where to change:** `src/components/customer/MenuItemCard.tsx` — place price inline with description (e.g. after description line) instead of a separate right-aligned column.

---

## ALREADY IMPLEMENTED (for reference)

- **§1 Core menu engine:** CMS, PS, quadrants (STAR / WORKHORSE / PUZZLE / DOG), promote STAR, upgrade PUZZLE, hide DOG past 60%, WORKHORSE stable.
- **§2 Structure:** 5–7 item cap, sub-groups (Most Ordered, Chef’s Selection, Signature, Light Options), mood flow (“Something light / filling / to share / premium”).
- **§3 Visual hierarchy:** Golden triangle / position bias (first = anchor, etc.), cheapest not first.
- **§4 Price display:** No currency symbol, no .00 (`formatMenuPrice`).
- **§5 Language engine:** Descriptions are not auto-rewritten with sensory/18-word rule in customer UI; admin has generate-description. No “max 18 words” or red-flag validation.
- **§6 Sequential upsell:** Protein → side → beverage → dessert in `buildUpsellSequence`; SequentialUpsell component.
- **§7 Bundles:** Co-purchase bundles at 35% threshold; decoy logic partially (no “bundle as anchor” when no high anchor).
- **§9 Scarcity badges:** “Limited Today” / “Today’s Selection” (no price reduction).
- **§10 Decision flow:** Large hero, sticky add, basket preview; **missing:** max 3 swipes, contextual idle suggestion.
- **§11 Loss aversion:** Checkout nudge for drink and dessert (“refreshing drink”, “sweet note”).
- **§12 Category order:** By profit priority (`orderCategoriesByProfit`).
- **§16 Modes:** Classic / Profit / Adaptive in types; **adaptive** is not implemented differently from profit (no live data-driven logic).

---

## Summary Table (What to Build)

| Priority | Gap | Section |
|----------|-----|---------|
| **High** | AI personalization (returning customer, previous order, table-size suggestions) | §13 |
| **High** | Experimental framework (A/B tests, conversion/attachment tracking) | §14 |
| **Medium** | Live profit: ingredient expiry, stock excess, **slight price reduction** (no “discount” wording) | §8 |
| **Medium** | Premium perception: **1 hero per category**, WORKHORSE no image (or cap) | §9, RULE 10 |
| **Medium** | Decision flow: **max 3 swipes per category**, idle = **suggested next item** (contextual) not just STAR | §10 |
| **Low** | Red flags: **identical description length**, **equal visual weight** checks | §15 |
| **Low** | Price psychology: **bundle as anchor when no high anchor** | §7 |
| **Low** | Price alignment: **avoid right-justified price column** (inline with description) | §8 |

---

## File Reference for Implementation

| Area | Main files |
|------|------------|
| Menu engine logic | `src/lib/menu-engine.ts`, `src/lib/menu-engine-defaults.ts` |
| Customer menu UI | `src/components/customer/SmartMenu.tsx`, `MenuItemCard.tsx`, `IdleUpsellPopup.tsx` |
| Public menu data | `src/app/page.tsx` |
| Settings (engine, modes) | `src/app/(dashboard)/settings/SettingsClient.tsx`, `src/app/api/settings/menu-engine/route.ts` |
| Types | `src/types/menu-engine.ts` |
