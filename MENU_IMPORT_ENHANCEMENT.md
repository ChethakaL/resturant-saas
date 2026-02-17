# Menu Import Enhancement - Recipe & Ingredient Management

## Overview
Enhanced the "Add Menu Items by Image" feature to automatically extract recipes (steps, tips, ingredients) and validate ingredients against inventory, with a confirmation flow for missing ingredients.

## Changes Made

### 1. Backend API Route (`/api/menu/extract-from-image/route.ts`)

**Enhanced AI Extraction:**
- Modified the Gemini AI prompt to extract comprehensive recipe information:
  - Recipe steps (step-by-step cooking instructions)
  - Recipe tips (helpful cooking tips)
  - Prep time and cook time
  - Recipe yield (number of servings)
  - Ingredients with quantities, units, and piece counts

**Ingredient Validation:**
- Fetches existing ingredients from the restaurant's inventory
- Compares extracted ingredients against inventory using normalized names
- Identifies missing ingredients

**Confirmation Flow:**
- If missing ingredients are detected:
  - Returns `requiresConfirmation: true` with list of missing ingredients
  - Waits for user confirmation before proceeding
- If user confirms (`confirmMissingIngredients: true`):
  - Automatically creates missing ingredients in inventory
  - Sets initial stock to 0 with appropriate units
  - Adds note: "Auto-created from menu image import"

### 2. Frontend Component (`BulkMenuImport.tsx`)

**State Management:**
- Added `availableIngredients` state to track inventory
- Added `showMissingIngredientsDialog` for confirmation UI
- Added `missingIngredients` to store list of missing ingredients
- Added `pendingExtractionData` to cache extraction results during confirmation

**Enhanced Data Model:**
- Updated `ExtractedMenuItem` interface to include:
  - `recipeSteps`: string[]
  - `recipeTips`: string[]
  - `prepTime`: string | null
  - `cookTime`: string | null
  - `recipeYield`: number | null
  - `ingredients`: ParsedIngredient[]
  - `missingIngredients`: string[]

**Extraction Flow:**
- Modified `extractMenuItems()` to handle confirmation parameter
- Checks for `requiresConfirmation` in API response
- Shows confirmation dialog if missing ingredients detected
- Re-calls API with `confirmMissingIngredients: true` after user confirms

**Menu Item Creation:**
- Refreshes ingredients list before creating menu items
- Maps ingredient names to IDs from inventory
- Includes recipe data when creating menu items:
  - Recipe steps and tips
  - Prep/cook times
  - Ingredient associations with quantities and units

**New UI Component:**
- Added missing ingredients confirmation dialog
- Shows list of ingredients that will be created
- Provides clear Cancel/Confirm options
- Explains that ingredients will be added with zero stock

## User Flow

1. **Upload Menu Image**: User uploads a photo of their menu
2. **AI Extraction**: System extracts menu items with full recipe details
3. **Ingredient Check**: System validates all ingredients against inventory
4. **Confirmation (if needed)**: 
   - If missing ingredients found, shows confirmation dialog
   - Lists all missing ingredients
   - User can cancel or proceed
5. **Ingredient Creation**: Creates missing ingredients automatically
6. **Menu Item Creation**: Creates menu items with:
   - Basic info (name, description, price, category)
   - Recipe details (steps, tips, times)
   - Ingredient associations
7. **Success**: All items created with complete recipe information

## Benefits

✅ **Complete Recipe Data**: Every menu item gets proper recipe steps and tips
✅ **Ingredient Validation**: Prevents orphaned ingredient references
✅ **User Control**: Clear confirmation before modifying inventory
✅ **Automatic Setup**: Missing ingredients created automatically with proper units
✅ **Cost Tracking Ready**: Ingredients linked for future cost calculations
✅ **SOP Compliance**: Recipe steps serve as Standard Operating Procedures

## Technical Details

**Ingredient Matching:**
- Uses case-insensitive, trimmed name comparison
- Handles variations in naming
- Preserves original unit information from AI extraction

**Data Integrity:**
- All ingredients validated before menu item creation
- Skips invalid ingredient mappings with warnings
- Maintains referential integrity in database

**Error Handling:**
- Graceful handling of missing ingredients
- Clear error messages for failed creations
- Partial success reporting (X of Y items created)

## Next Steps

Users can now:
1. Review and update ingredient stock quantities
2. Set cost per unit for accurate pricing
3. Adjust recipe steps and tips as needed
4. Use recipes as SOPs for kitchen staff
