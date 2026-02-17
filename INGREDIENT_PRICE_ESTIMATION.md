# Ingredient Price Estimation Feature

## Overview
Implemented automatic ingredient price estimation when creating ingredients via AI (menu image import).

## What Was Implemented

### 1. **Ingredient Price Estimator** (`src/lib/ingredient-price-estimator.ts`)

A new utility that estimates ingredient prices using multiple sources:

#### Priority Order:
1. **Tavily Search API** (if `TAVILY_API_KEY` is set)
   - Searches for current market prices
   - Most accurate for real-time pricing

2. **Google AI / OpenAI** (if `GOOGLE_AI_KEY` or `OPENAI_API_KEY` is set)
   - Uses AI to estimate based on typical market prices
   - Provides reasoning and confidence level

3. **Default Category-Based Estimates**
   - Fallback when no API keys are available
   - Based on common ingredient categories:
     - Chicken: 12,000 IQD/kg
     - Beef: 25,000 IQD/kg
     - Lamb: 30,000 IQD/kg
     - Fish: 20,000 IQD/kg
     - Vegetables: 2,000-3,000 IQD/kg
     - Dairy: 3,000-15,000 IQD/kg
     - Oils: 8,000 IQD/L
     - Grains: 3,000 IQD/kg
     - Spices: 5,000 IQD/kg (or 500 for smaller units)

### 2. **Updated Menu Image Import** (`src/app/api/menu/extract-from-image/route.ts`)

When importing menu items from images:
- Automatically estimates prices for new ingredients
- Adds detailed notes to each ingredient:
  ```
  Auto-created from menu image import. 
  Price estimated at 12000 IQD/kg using google_ai (confidence: medium). 
  ⚠️ PLEASE REVIEW AND UPDATE WITH ACTUAL SUPPLIER PRICES.
  ```

## How It Works

### Example Flow:

1. User uploads menu image
2. AI extracts menu items with ingredients
3. System detects missing ingredients (e.g., "chicken breast")
4. For each missing ingredient:
   - Calls `estimateIngredientPrice("chicken breast", "kg")`
   - Tries Tavily search first
   - Falls back to AI estimation
   - Falls back to category defaults
5. Creates ingredient with:
   - Estimated `costPerUnit`
   - Warning note in `notes` field
   - Source and confidence level

### API Response Format:

```typescript
{
  costPerUnit: 12000,
  currency: 'IQD',
  source: 'google_ai' | 'openai' | 'tavily_search' | 'default_estimate',
  confidence: 'high' | 'medium' | 'low'
}
```

## Environment Variables Used

- `TAVILY_API_KEY` - For web search-based pricing (most accurate)
- `GOOGLE_AI_KEY` - For AI-based estimation
- `OPENAI_API_KEY` - Alternative AI-based estimation

## User Experience

### Before:
- Ingredients created with `costPerUnit: 0`
- No indication that prices need review
- Manual price entry required for all ingredients

### After:
- Ingredients created with realistic estimated prices
- Clear warning that prices are estimated
- Shows estimation source and confidence
- Saves time while maintaining accuracy awareness

## Example Ingredient Note:

```
Auto-created from menu image import. 
Price estimated at 25000 IQD/kg using tavily_search (confidence: high). 
⚠️ PLEASE REVIEW AND UPDATE WITH ACTUAL SUPPLIER PRICES.
```

## Testing

To test the feature:

1. **With Tavily API:**
   ```bash
   # Add to .env
   TAVILY_API_KEY=your_key_here
   ```

2. **With Google AI:**
   ```bash
   # Add to .env
   GOOGLE_AI_KEY=your_key_here
   ```

3. **Upload a menu image** at `/menu/new` or wherever menu image import is available

4. **Check created ingredients** in the inventory to see:
   - Estimated prices populated
   - Warning notes added
   - Source and confidence indicated

## Future Enhancements

Potential improvements:
- Cache price estimates to reduce API calls
- Allow bulk price review/approval
- Track price estimation accuracy over time
- Add supplier-specific price learning
- Support multiple currencies
- Regional price variations

## Files Modified

1. `src/lib/ingredient-price-estimator.ts` - New file
2. `src/app/api/menu/extract-from-image/route.ts` - Updated ingredient creation

## Notes

- Prices are estimates and should always be reviewed
- The warning emoji (⚠️) makes it visually clear that review is needed
- Confidence levels help prioritize which prices to review first
- Default estimates are conservative and based on typical Iraqi market prices
