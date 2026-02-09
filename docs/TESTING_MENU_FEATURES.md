# Testing: Menu carousels, sections, themes & branding

Use these steps to verify the new menu and settings features.

---

## Where to check what’s developed

**Run the app**

```bash
npm run dev
```

Then open **http://localhost:3000** in your browser (use a mobile viewport or device to see the customer menu as intended).

**Where to see things**

| What | Where |
|------|--------|
| **Customer menu (QR menu)** | Home page: **http://localhost:3000** — carousels, categories, menu item cards, cart (when engine is not Classic). |
| **Carousel** | Top of the menu: e.g. “CHEF’S SELECTION” — one card per slide on mobile, same height cards. |
| **Menu Engine (mode, bundles, moods, upsells)** | Same home page when engine mode is **Profit** or **Smart Adaptive** (see below). |
| **Menu Engine settings** | Dashboard → **Settings** → **Menu Engine** tab — switch mode (Classic / Profit / Smart Adaptive), toggles, sliders, “Load quadrant data”. |
| **Cart & place order** | On the menu: add items → “View order” bar at bottom → Place order (uses `/api/public/orders`). |

**Where things live in the codebase**

| Feature | Files |
|--------|--------|
| Engine types & defaults | `src/types/menu-engine.ts`, `src/lib/menu-engine-defaults.ts` |
| Engine logic (server-only) | `src/lib/menu-engine.ts` |
| Menu price format (no currency) | `src/lib/utils.ts` → `formatMenuPrice()` |
| Data fetch + engine run | `src/app/page.tsx` → `getMenuData()` |
| Customer menu UI | `src/components/customer/SmartMenu.tsx` |
| Carousel (one card per slide, fixed height) | `src/components/customer/MenuCarousel.tsx` |
| Menu item cards (with engine hints) | `src/components/customer/MenuItemCard.tsx` |
| Cart, moods, bundles, upsells | `src/components/customer/CartDrawer.tsx`, `MoodSelector.tsx`, `BundleCarousel.tsx`, `SequentialUpsell.tsx`, etc. |
| Engine settings API | `src/app/api/settings/menu-engine/route.ts` |
| Quadrant data (admin only) | `src/app/api/menu-engine/quadrants/route.ts` |
| Settings “Menu Engine” tab | `src/app/(dashboard)/settings/SettingsClient.tsx` |

**Note:** In **Classic** mode the menu looks like before (no mood selector, no bundles/cart upsells). Switch to **Profit** or **Smart Adaptive** in Settings → Menu Engine to see the new behavior.

---

## 1. Manager-controlled sections (show/hide categories)

**Where:** Dashboard → **Category Manager** (or **Categories** in sidebar).

- Open the categories page. You should see a list of your menu sections (e.g. Appetizers, Main Course).
- Each row has an **eye** (visible) or **eye-off** (hidden) button.
- **Test:** Click the eye to hide a section. Open the **public menu** (home page `/`) in another tab and refresh. The hidden section and its items should not appear.
- **Test:** Click the eye-off to show the section again. Refresh the public menu; the section should reappear.

---

## 2. Carousel type (Chef’s Highlights vs Recommendations)

**Where:** Dashboard → **Settings** → **Carousel Sections** tab.

- For each carousel you can set a **type** via the dropdown next to the title: **Chef’s Highlights** or **Recommendations**.
- **Test:** Set one carousel to “Chef’s Highlights” and another to “Recommendations”. Save if needed (blur the title field or change position).
- Open the **public menu** (`/`). The two carousels should look different:
  - **Chef’s Highlights:** Stronger border and title color (primary color), more prominent.
  - **Recommendations:** Softer, default styling.

---

## 3. Time-based carousel items

**Where:** Dashboard → **Settings** → **Menu Theme** and **Carousel Sections**.

**Timezone**

- In **Menu Theme**, find **Menu timezone**. Choose e.g. **Erbil (Asia/Baghdad)**.
- Click **Save Theme**. This timezone is used for Day / Evening / Night slots.

**Slots**

- In **Carousel Sections**, for a carousel click **Time slots**.
- In the dialog you get three slots:
  - **Day (6am–12pm)**
  - **Evening (12pm–6pm)**
  - **Night (6pm–6am)**
- For each slot, tick the menu items you want to show in that slot. Leave a slot empty to fall back to “Pick items” or auto-filled items.
- Click **Save schedule**.

**Test**

- Set different items for e.g. Day and Night.
- Open the public menu and refresh. The carousel should show items for the **current** time in the selected timezone (e.g. if it’s afternoon in Erbil, you see Evening items).
- Change your system time or timezone and refresh to see another slot (or wait until the next slot).

---

## 4. Predefined menu themes

**Where:** Dashboard → **Settings** → **Menu Theme**.

- At the top you see **Preset theme**: Classy, Fast Food, Cozy, Minimal, Luxe, and **Custom**.
- **Test:** Click **Classy**. Primary/accent colors and background style should update. Click **Save Theme**.
- Open the public menu; it should use the Classy look (e.g. dark background, serif, gold accent).
- **Test:** Switch to **Fast Food**, save, and reload the public menu; you should see a lighter, more casual style.
- **Test:** Click **Custom** and change colors manually; save and check the public menu.

---

## 5. Menu background image (URL)

**Where:** Dashboard → **Settings** → **Menu Theme**.

- Find **Menu background image URL**.
- Paste a direct image URL (e.g. from a CDN or your site), e.g. `https://example.com/background.jpg`.
- Click **Save Theme**.
- Open the public menu. The page background should be that image (with a dark overlay so text stays readable).

---

## 6. Generate background from description (AI)

**Where:** Dashboard → **Settings** → **Menu Theme**.

- Find **Generate background from description**.
- Enter a short vibe, e.g. “Cozy warm restaurant with wooden tables and soft lighting”.
- Click **Generate with AI**. Wait for the request to finish (needs `GOOGLE_AI_KEY` in `.env`).
- After success, the generated image is set as the background URL in the form. Click **Save Theme** to persist it.
- Open the public menu; the background should match the description (with overlay).

---

## 7. Default carousels and “Set up default carousels”

**Where:** Dashboard → **Settings** → **Carousel Sections**.

- If you have no carousels, you see **Set Up Default Carousels**.
- Click it. Two carousels are created: one **Chef’s Selection** (Chef’s Highlights) at the top, one **Try Something New** (Recommendations) after the first category.
- Confirm both appear in the list and on the public menu with the correct types and styling.

---

## 8. Automatic carousel item selection

When a carousel has **no** manually picked items and **no** time-slot schedule, the system fills it automatically with items sorted by **margin** (high margin first), up to 8 items.

**Test**

- Create a new carousel. Do **not** click “Pick Items” and do **not** set Time slots.
- Open the public menu. That carousel should show up to 8 items, chosen by margin (and existing logic).
- Then use **Pick Items** or **Time slots** and confirm manual/time-based selection overrides this.

---

## Quick checklist

| Feature                      | Where to configure        | What to check on public menu (`/`)     |
|-----------------------------|---------------------------|----------------------------------------|
| Hide/show section           | Categories                | Section and its items disappear/appear |
| Carousel type               | Settings → Carousels     | Different look for Highlights vs Recs |
| Time-based carousel items   | Settings → Carousels → Time slots + Theme timezone | Items change by time of day   |
| Preset themes               | Settings → Menu Theme     | Classy / Fast Food / etc. apply        |
| Background image URL        | Settings → Menu Theme     | Your image as menu background          |
| AI background from text     | Settings → Menu Theme     | Generated image as background after Save |

---

## Troubleshooting

- **Time slots not changing:** Ensure **Save schedule** was clicked and **Menu timezone** is set and saved. Slots use the server time in that timezone.
- **Background image not showing:** Use a URL that returns an image with CORS allowed, or use the “Generate with AI” flow (stores a data URL).
- **AI generate fails:** Set `GOOGLE_AI_KEY` in `.env` (Gemini). Same key as for menu item image generation.
