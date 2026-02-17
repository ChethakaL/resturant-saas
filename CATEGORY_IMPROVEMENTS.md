# Category Management Improvements

## Changes Implemented

### 1. Drag-and-Drop Category Reordering

**What was added:**
- Installed `@dnd-kit` libraries for drag-and-drop functionality
- Added drag-and-drop sensors and handlers to `CategoriesManager` component
- Created `SortableCategoryItem` wrapper component for draggable categories
- Created new API endpoint `/api/categories/reorder` to persist order changes
- Updated UI description to inform users they can drag to reorder

**How it works:**
1. Users can now drag categories by the grip icon to reorder them
2. The order is immediately reflected in the UI (optimistic update)
3. The new order is saved to the database via the reorder API endpoint
4. The `displayOrder` field is updated for all affected categories
5. This order is automatically reflected in the client-facing menu since it already uses `orderBy: { displayOrder: 'asc' }`

**Files modified:**
- `src/components/dashboard/CategoriesManager.tsx` - Added drag-and-drop functionality
- `src/app/api/categories/reorder/route.ts` - New API endpoint (created)

### 2. AI Categorization - Signature Sandwich Recognition

**What was added:**
- Added "signature sandwich" and "signature sandwiches" to the category name mapping

**How it works:**
- When the AI categorization runs, it now recognizes items with "signature sandwich" in their category name
- These items are properly mapped to the "Signature Dishes" category
- This ensures consistency in categorization across different naming conventions

**Files modified:**
- `src/lib/category-suggest.ts` - Updated `CATEGORY_NAME_PRIORITY` mapping

## Testing

To test these features:

1. **Category Reordering:**
   - Navigate to `localhost:3000/categories`
   - Try dragging categories up and down using the grip icon
   - Verify the order persists after page refresh
   - Check that the client-facing menu reflects the new order

2. **AI Categorization:**
   - Create a category named "Signature Sandwich" or "Signature Sandwiches"
   - Add some menu items to it
   - Run "AI categorization" from the categories page
   - Verify items are correctly categorized as "Signature Dishes"

## Technical Notes

- The drag-and-drop uses `@dnd-kit` which provides excellent accessibility support
- The reorder operation uses a database transaction to ensure atomicity
- Optimistic UI updates provide immediate feedback to users
- The existing `displayOrder` field in the database is leveraged for persistence
