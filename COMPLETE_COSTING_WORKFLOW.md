# Complete Costing Workflow

## Overview
Instead of estimating ingredient prices automatically, the system now guides users to manually enter actual supplier prices for accurate costing.

## Changes Made

### 1. **Removed Automatic Price Estimation**
- **File**: `src/app/api/menu/extract-from-image/route.ts`
- **Change**: Ingredients created from menu image import now have `costPerUnit = 0`
- **Note Added**: "⚠️ COSTING INCOMPLETE - Please update cost per unit with actual supplier prices."

### 2. **Added "Complete Costing" Button**
- **File**: `src/components/menu/MenuItemsTable.tsx`
- **Location**: Actions column, next to Edit and Delete buttons
- **Visibility**: Only shows for menu items with `costingStatus === 'INCOMPLETE'`
- **Action**: Redirects to `/menu/{id}?tab=ingredients` to guide users to fill ingredient costs

## User Workflow

### **Step 1: Import Menu from Image**
1. User uploads menu image
2. AI extracts menu items with ingredients
3. New ingredients are created with `costPerUnit = 0`
4. Menu items are marked with `costingStatus = 'INCOMPLETE'`

### **Step 2: Identify Incomplete Costing**
- Menu items with incomplete costing show:
  - ⚠️ **"Costing incomplete"** badge (amber/yellow)
  - **"Complete Costing"** button in actions column

### **Step 3: Complete the Costing**
1. Click **"Complete Costing"** button
2. User is redirected to menu item edit page
3. Ingredients tab is pre-selected (`?tab=ingredients`)
4. User fills in actual cost per unit for each ingredient
5. Once all ingredients have costs, `costingStatus` updates to `'COMPLETE'`

### **Step 4: Accurate Costing**
- System calculates accurate item cost based on real supplier prices
- Profit margins and suggested prices are now reliable
- No more estimated/guessed prices

## Benefits

### **For Restaurant Owners:**
✅ **Accurate Costs**: Real supplier prices, not estimates
✅ **Better Decisions**: Reliable profit margin calculations
✅ **Price Confidence**: Know exactly what each dish costs
✅ **Supplier Tracking**: Actual prices from your suppliers

### **For the System:**
✅ **No AI Errors**: No risk of wrong price estimates
✅ **Data Quality**: All costs are verified by users
✅ **Compliance**: Boss-approved workflow
✅ **Transparency**: Users know exactly where prices come from

## UI Elements

### **Costing Incomplete Badge**
```tsx
<Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600">
  Costing incomplete
</Badge>
```

### **Complete Costing Button**
```tsx
<Button variant="outline" size="sm" className="text-amber-600 border-amber-300 hover:bg-amber-50">
  Complete Costing
</Button>
```

## Technical Details

### **Costing Status Logic**
```typescript
const hasRecipe = validIngredients.length > 0
const hasCosting = validIngredients.some((ing) => ing.unitCostCached != null)
const costingStatus = hasRecipe && hasCosting ? 'COMPLETE' : 'INCOMPLETE'
```

### **Ingredient Creation (No Estimation)**
```typescript
{
  name: 'chicken breast',
  unit: 'kg',
  costPerUnit: 0,  // ← No estimation!
  notes: '⚠️ COSTING INCOMPLETE - Please update cost per unit with actual supplier prices.'
}
```

## Example Flow

**Before (with estimation):**
1. Upload menu → AI estimates prices → User might not review → Inaccurate costing

**After (manual completion):**
1. Upload menu → Ingredients created with $0 cost
2. System shows "Costing incomplete" badge
3. User clicks "Complete Costing"
4. User enters actual supplier prices
5. Accurate costing ✅

## Files Modified

1. ✅ `src/app/api/menu/extract-from-image/route.ts` - Removed price estimation
2. ✅ `src/components/menu/MenuItemsTable.tsx` - Added "Complete Costing" button

## Files NOT Modified (Price Estimator Still Available)

The price estimation logic in `src/lib/ingredient-price-estimator.ts` is still available but not used automatically. It could be used in the future for:
- Optional price suggestions
- Price comparison tools
- Market price research

---

**Result**: Users now have full control over ingredient pricing with a clear, guided workflow to complete costing. No more guessing or estimation! 🎯
