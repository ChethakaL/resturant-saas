# Smart Menu — Where to See New Features in the UI

This guide explains where each of the previously “gap” features appears in the customer-facing menu so you can verify them.

---

## 1. DOG items hidden until scroll depth > 60%

**What it does:** Low-margin “DOG” items are hidden until the user has scrolled more than 60% down the menu. After that, they appear (with minimal styling) so the first screen stays focused on stars and workhorses.

**Where to see it:**
- **Screen:** Customer menu (public menu page, e.g. `/`).
- **Requirement:** Menu engine mode must be **Profit** or **Adaptive** (not Classic), and the category must have items classified as DOG (low margin, low popularity).
- **How to check:**
  1. Use Profit or Adaptive mode in dashboard (Menu → Smart Menu / optimization).
  2. Open the public menu and scroll less than halfway — DOG items in category lists should not appear.
  3. Scroll past about 60% of the page — DOG items appear in the same category sections (and “See more” count includes them if the category is collapsed).

**Note:** In Classic mode, all items are shown regardless of scroll (no `scrollDepthHide`).

---

## 2. Bundle 35% co-purchase correlation

**What it does:** Bundles (“Popular combos”) are only created from item pairs that meet the **35% co-purchase correlation** (e.g. in 35%+ of orders that contain one item, the other is also present). The threshold is configurable via `bundleCorrelationThreshold` in menu engine settings.

**Where to see it:**
- **Screen:** Customer menu.
- **Sections:** “Popular combos” carousel (when `bundles` are enabled and pairs meet the threshold) and any **category anchor bundle** (the “Save X” combo shown at the top of a category when that category has no high-priced anchor item).
- **How to check:**
  1. Enable bundles and Profit/Adaptive mode.
  2. If you have enough order history so some pairs meet the 35% rule, you’ll see bundles in the combos carousel and/or as category anchors.
  3. If no pair meets the threshold, the combos carousel won’t show any bundles (by design).

**Backend:** Co-purchase pairs are built in `app/page.tsx`; filtering by correlation is in `lib/menu-engine.ts` (`generateBundles`).

---

## 3. A/B experiments applied in the UI

Experiments are assigned once per guest (stored in `localStorage` under `iserve_experiments`) and then drive how prices, images, and upsells are shown.

### 3a. Price format (18 vs 17.9 vs 18.5)

**What it does:** Prices can be shown as **whole**, **decimal_9** (e.g. 17.9), or **decimal_5** (e.g. 18.5) depending on the assigned variant.

**Where to see it:**
- **Menu item cards:** Price next to the item name in each category.
- **Cart:** Sticky bar at the bottom (subtotal) and inside the cart drawer (line item prices and total).
- **Checkout nudges:** “Most guests complete with a drink” / “End on a sweet note?” suggestion price.
- **Upsell modals:** Price of the suggested add-on (sequential or bundled).

**How to test:** Clear `localStorage` (or use an incognito window), open the menu, then in DevTools → Application → Local Storage find `iserve_experiments` and edit `price_format` to `"whole"`, `"decimal_9"`, or `"decimal_5"` and refresh. Prices should update accordingly across cards, cart, and upsells.

---

### 3b. Photo visibility (show vs hide)

**What it does:** When the variant is **hide**, item images are not shown on menu cards (text-only cards).

**Where to see it:**
- **Menu item cards:** The image area on each card is hidden for all items when the variant is `hide`.

**How to test:** In `iserve_experiments`, set `photo_visibility` to `"hide"` and refresh. Cards should show no image (only name, description, price, tags).

---

### 3c. Upsell strategy (sequential vs bundled)

**What it does:** After adding a main item, upsells are either **sequential** (one suggestion at a time, Add/Skip) or **bundled** (all suggestions in one modal, Add per item, Skip all).

**Where to see it:**
- **Trigger:** Add any main item that has upsell suggestions (Profit/Adaptive with upsells enabled).
- **Sequential:** Bottom sheet with one suggestion, “Add” and “Skip” (next suggestion or close).
- **Bundled:** Single modal listing all suggested add-ons (e.g. protein, side, drink, dessert), each with “Add”, and one “Skip” to close.

**How to test:** Set `upsell_strategy` in `iserve_experiments` to `"sequential"` or `"bundled"`, then add a main item that has upsells configured. You should see either the step-by-step flow or the all-at-once list.

---

## Quick reference

| Feature              | Where in UI                                      | Condition / How to see                          |
|----------------------|--------------------------------------------------|-------------------------------------------------|
| DOG hidden by scroll | Category item lists                              | Profit/Adaptive, scroll &lt; 60% then &gt; 60%   |
| 35% bundle filter    | “Popular combos” carousel, category anchor combos| Bundles on, some pairs meet 35% correlation     |
| Price format test    | Item cards, cart bar, cart drawer, nudges, upsells | Set `price_format` in localStorage              |
| Photo visibility     | Item cards                                       | Set `photo_visibility` to `"hide"`              |
| Upsell strategy      | Post-add upsell modal                            | Set `upsell_strategy` to `"sequential"` or `"bundled"` |
