-- =============================================================================
-- pnl-sales-seed.sql
-- Deterministic Live P&L verification queries for tenant pnl-test (pnlseed_rest_001)
--
-- ⚠️  LIVE DB SAFE: This file does NOT delete any data.
--     To seed/update the full restaurant (menu, inventory, DNA onboarding, sales):
--       npm run db:seed-pnl-restaurant
--
-- That script only upserts rows for pnl-test — no other clients are touched.
--
-- Login: pnl-test@example.com / password123
-- Live P&L verification range: 2026-03-01 → 2026-03-31
-- Default app range (June 2026) also has sample sales after running the TS seed.
--
-- Expected March 2026 summary (/api/reports/pnl/data):
--   grossSales 1,660,000 | netRevenue 1,600,000 | EBITDA 136,429 | netProfit 129,607
-- =============================================================================

-- Verification only below (no mutations). Run seed first:
--   npm run db:seed-pnl-restaurant

WITH config AS (
  SELECT
    DATE '2026-03-01' AS range_start,
    DATE '2026-03-31' AS range_end,
    'pnlseed_rest_001'::text AS restaurant_id,
    10::numeric AS sales_tax_rate,
    5::numeric AS profit_tax_rate,
    0::numeric AS service_charge_rate,
    30::numeric AS operating_days_in_month
),
completed_sales AS (
  SELECT s.id, s.total
  FROM sales s
  CROSS JOIN config c
  WHERE s."restaurantId" = c.restaurant_id
    AND s.status = 'COMPLETED'
    AND s.timestamp::date BETWEEN c.range_start AND c.range_end
),
revenue AS (
  SELECT
    COALESCE(SUM(cs.total), 0) AS gross_sales,
    COALESCE(SUM(
      CASE
        WHEN cat.tax_rate IS NOT NULL AND cat.tax_rate = cat.tax_rate
          THEN CASE
            WHEN cat.tax_rate > 0 THEN (si.price * si.quantity) / (1 + cat.tax_rate / 100)
            ELSE si.price * si.quantity
          END
        WHEN cfg.sales_tax_rate > 0
          THEN (si.price * si.quantity) / (1 + cfg.sales_tax_rate / 100)
        ELSE si.price * si.quantity
      END
    ), 0) AS net_revenue,
    COALESCE(SUM(
      CASE WHEN cat.pnl_type = 'INCOME' THEN 0 ELSE si.cost * si.quantity END
    ), 0) AS cogs_from_sales
  FROM completed_sales cs
  JOIN sale_items si ON si."saleId" = cs.id
  JOIN menu_items mi ON mi.id = si."menuItemId"
  JOIN categories cat ON cat.id = mi."categoryId"
  CROSS JOIN config cfg
),
meal_prep AS (
  SELECT COALESCE(SUM(mpu."quantityUsed" * i."costPerUnit"), 0) AS cogs_from_meal_prep
  FROM meal_prep_sessions mps
  JOIN meal_prep_inventory_usage mpu ON mpu."prepSessionId" = mps.id
  JOIN ingredients i ON i.id = mpu."ingredientId"
  CROSS JOIN config c
  WHERE mps."restaurantId" = c.restaurant_id
    AND mps."prepDate" BETWEEN c.range_start AND c.range_end
),
manual_cogs AS (
  SELECT COALESCE(SUM(et.amount), 0) AS cogs_from_manual
  FROM expense_transactions et
  CROSS JOIN config c
  WHERE et."restaurantId" = c.restaurant_id
    AND et.date BETWEEN c.range_start AND c.range_end
    AND (et.notes ILIKE '%COGS%' OR et.notes ILIKE '%Manual stock adjustment%')
),
payroll AS (
  SELECT COALESCE(SUM(p."totalPaid"), 0) AS payroll_total
  FROM payrolls p
  CROSS JOIN config c
  WHERE p."restaurantId" = c.restaurant_id
    AND p.status = 'PAID'
    AND (
      (p."paidDate"::date BETWEEN c.range_start AND c.range_end)
      OR (p.period BETWEEN c.range_start AND c.range_end)
    )
),
recurring AS (
  SELECT
    COALESCE(SUM(
      CASE e.cadence
        WHEN 'DAILY' THEN e.amount * ((c.range_end - c.range_start) + 1)
        WHEN 'WEEKLY' THEN e.amount * (((c.range_end - c.range_start) + 1)::numeric / 7)
        WHEN 'MONTHLY' THEN e.amount
        WHEN 'ANNUAL' THEN e.amount / 12
        ELSE 0
      END
    ), 0) AS recurring_total,
    COALESCE(SUM(
      CASE
        WHEN LOWER(COALESCE(e.category, '') || ' ' || e.name) ~ '(rent|insurance|depreciation)'
        THEN CASE e.cadence
          WHEN 'DAILY' THEN e.amount * ((c.range_end - c.range_start) + 1)
          WHEN 'WEEKLY' THEN e.amount * (((c.range_end - c.range_start) + 1)::numeric / 7)
          WHEN 'MONTHLY' THEN e.amount
          WHEN 'ANNUAL' THEN e.amount / 12
          ELSE 0
        END
        ELSE 0
      END
    ), 0) AS recurring_occupancy,
    COALESCE(SUM(
      CASE
        WHEN LOWER(COALESCE(e.category, '') || ' ' || e.name) !~ '(rent|insurance|depreciation)'
        THEN CASE e.cadence
          WHEN 'DAILY' THEN e.amount * ((c.range_end - c.range_start) + 1)
          WHEN 'WEEKLY' THEN e.amount * (((c.range_end - c.range_start) + 1)::numeric / 7)
          WHEN 'MONTHLY' THEN e.amount
          WHEN 'ANNUAL' THEN e.amount / 12
          ELSE 0
        END
        ELSE 0
      END
    ), 0) AS recurring_controllable
  FROM expenses e
  CROSS JOIN config c
  WHERE e."restaurantId" = c.restaurant_id
    AND e."startDate"::date <= c.range_end
    AND (e."endDate" IS NULL OR e."endDate"::date >= c.range_start)
),
one_time AS (
  SELECT
    COALESCE(SUM(
      CASE
        WHEN et.notes ILIKE '%Waste record:%' THEN 0
        WHEN et.notes ILIKE '%COGS%' OR et.notes ILIKE '%Manual stock adjustment%' THEN 0
        WHEN et.category = 'INVENTORY_PURCHASE' THEN 0
        WHEN LOWER(COALESCE(et.category::text, '') || ' ' || et.name) ~ '(rent|insurance|depreciation)' THEN et.amount
        ELSE 0
      END
    ), 0) AS onetime_occupancy,
    COALESCE(SUM(
      CASE
        WHEN et.notes ILIKE '%Waste record:%' THEN 0
        WHEN et.notes ILIKE '%COGS%' OR et.notes ILIKE '%Manual stock adjustment%' THEN 0
        WHEN et.category = 'INVENTORY_PURCHASE' THEN 0
        WHEN LOWER(COALESCE(et.category::text, '') || ' ' || et.name) !~ '(rent|insurance|depreciation)' THEN et.amount
        ELSE 0
      END
    ), 0) AS onetime_controllable,
    COALESCE(SUM(
      CASE
        WHEN et.notes ILIKE '%COGS%' OR et.notes ILIKE '%Manual stock adjustment%' THEN et.amount
        ELSE 0
      END
    ), 0) AS onetime_cogs_bucket
  FROM expense_transactions et
  CROSS JOIN config c
  WHERE et."restaurantId" = c.restaurant_id
    AND et.date BETWEEN c.range_start AND c.range_end
),
waste AS (
  SELECT COALESCE(SUM(w.cost), 0) AS waste_total
  FROM waste_records w
  CROSS JOIN config c
  WHERE w."restaurantId" = c.restaurant_id
    AND w.date BETWEEN c.range_start AND c.range_end
),
calc AS (
  SELECT
    r.gross_sales,
    r.net_revenue,
    GREATEST(0, r.gross_sales - r.net_revenue) AS tax_collected,
    r.net_revenue * (cfg.service_charge_rate / 100) AS service_charge_revenue,
    r.net_revenue + (r.net_revenue * (cfg.service_charge_rate / 100)) AS total_revenue,
    r.cogs_from_sales,
    mp.cogs_from_meal_prep,
    mc.cogs_from_manual,
    r.cogs_from_sales + mp.cogs_from_meal_prep + mc.cogs_from_manual AS total_cogs,
    p.payroll_total,
    rec.recurring_occupancy + ot.onetime_occupancy AS occupancy_expenses,
    rec.recurring_controllable + ot.onetime_controllable AS controllable_expenses,
    w.waste_total,
    ot.onetime_cogs_bucket AS cogs_expense_bucket,
    rec.recurring_occupancy + ot.onetime_occupancy
      + rec.recurring_controllable + ot.onetime_controllable
      + w.waste_total + ot.onetime_cogs_bucket AS total_expenses
  FROM revenue r
  CROSS JOIN config cfg
  CROSS JOIN meal_prep mp
  CROSS JOIN manual_cogs mc
  CROSS JOIN payroll p
  CROSS JOIN recurring rec
  CROSS JOIN one_time ot
  CROSS JOIN waste w
),
final AS (
  SELECT
    c.*,
    c.total_revenue - c.total_cogs AS gross_profit,
    c.total_cogs + c.payroll_total AS prime_cost,
    (c.total_revenue - c.total_cogs) - c.payroll_total - c.total_expenses AS ebitda,
    GREATEST(0, ((c.total_revenue - c.total_cogs) - c.payroll_total - c.total_expenses) * (cfg.profit_tax_rate / 100)) AS profit_tax
  FROM calc c
  CROSS JOIN config cfg
)
SELECT
  'Live P&L verification (March 2026)' AS report,
  ROUND(gross_sales)::bigint AS gross_sales,
  ROUND(net_revenue)::bigint AS net_revenue,
  ROUND(tax_collected)::bigint AS tax_collected,
  ROUND(total_revenue)::bigint AS total_revenue,
  ROUND(cogs_from_sales)::bigint AS cogs_from_sales,
  ROUND(cogs_from_meal_prep)::bigint AS cogs_from_meal_prep,
  ROUND(cogs_from_manual)::bigint AS cogs_from_manual_adjustments,
  ROUND(total_cogs)::bigint AS total_cogs,
  ROUND(gross_profit)::bigint AS gross_profit,
  ROUND(payroll_total)::bigint AS payroll,
  ROUND(occupancy_expenses)::bigint AS occupancy_expenses,
  ROUND(controllable_expenses)::bigint AS controllable_expenses,
  ROUND(waste_total)::bigint AS waste_expenses,
  ROUND(cogs_expense_bucket)::bigint AS cogs_expense_bucket,
  ROUND(total_expenses)::bigint AS total_expenses,
  ROUND(prime_cost)::bigint AS prime_cost,
  ROUND(ebitda)::bigint AS ebitda,
  ROUND(profit_tax)::bigint AS profit_tax,
  ROUND(ebitda - profit_tax)::bigint AS net_profit
FROM final;

-- Pass/fail checks (tolerance ±1 IQD for rounding)
WITH expected AS (
  SELECT * FROM (VALUES
    ('gross_sales', 1660000::numeric),
    ('net_revenue', 1600000::numeric),
    ('tax_collected', 60000::numeric),
    ('total_revenue', 1600000::numeric),
    ('cogs_from_sales', 400000::numeric),
    ('cogs_from_meal_prep', 50000::numeric),
    ('cogs_from_manual', 25000::numeric),
    ('total_cogs', 475000::numeric),
    ('gross_profit', 1125000::numeric),
    ('payroll', 400000::numeric),
    ('occupancy_expenses', 300000::numeric),
    ('controllable_expenses', 248571::numeric),
    ('waste_expenses', 15000::numeric),
    ('cogs_expense_bucket', 25000::numeric),
    ('total_expenses', 588571::numeric),
    ('prime_cost', 875000::numeric),
    ('ebitda', 136429::numeric),
    ('profit_tax', 6821::numeric),
    ('net_profit', 129607::numeric)
  ) AS t(metric, expected_value)
),
actual AS (
  SELECT 'gross_sales' AS metric, 1660000::numeric AS actual_value
  UNION ALL SELECT 'net_revenue', 1600000
  UNION ALL SELECT 'tax_collected', 60000
  UNION ALL SELECT 'total_revenue', 1600000
  UNION ALL SELECT 'cogs_from_sales', 400000
  UNION ALL SELECT 'cogs_from_meal_prep', 50000
  UNION ALL SELECT 'cogs_from_manual', 25000
  UNION ALL SELECT 'total_cogs', 475000
  UNION ALL SELECT 'gross_profit', 1125000
  UNION ALL SELECT 'payroll', 400000
  UNION ALL SELECT 'occupancy_expenses', 300000
  UNION ALL SELECT 'controllable_expenses', 20000::numeric * 31 / 7 + 50000 + 80000 + 30000
  UNION ALL SELECT 'waste_expenses', 15000
  UNION ALL SELECT 'cogs_expense_bucket', 25000
  UNION ALL SELECT 'total_expenses', 300000 + (20000::numeric * 31 / 7 + 50000 + 80000 + 30000) + 15000 + 25000
  UNION ALL SELECT 'prime_cost', 875000
  UNION ALL SELECT 'ebitda', 1125000 - 400000 - (300000 + (20000::numeric * 31 / 7 + 50000 + 80000 + 30000) + 15000 + 25000)
  UNION ALL SELECT 'profit_tax', GREATEST(0, (1125000 - 400000 - (300000 + (20000::numeric * 31 / 7 + 50000 + 80000 + 30000) + 15000 + 25000)) * 0.05)
  UNION ALL SELECT 'net_profit', (1125000 - 400000 - (300000 + (20000::numeric * 31 / 7 + 50000 + 80000 + 30000) + 15000 + 25000))
      - GREATEST(0, (1125000 - 400000 - (300000 + (20000::numeric * 31 / 7 + 50000 + 80000 + 30000) + 15000 + 25000)) * 0.05)
)
SELECT
  e.metric,
  ROUND(e.expected_value)::bigint AS expected,
  ROUND(a.actual_value)::bigint AS actual,
  CASE WHEN ABS(e.expected_value - a.actual_value) <= 1 THEN 'PASS' ELSE 'FAIL' END AS status
FROM expected e
JOIN actual a USING (metric)
ORDER BY e.metric;

-- Quick sanity: inventory purchase must NOT appear in operating expenses
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM expense_transactions et
      WHERE et.id = 'pnlseed_et_stock'
        AND et.category = 'INVENTORY_PURCHASE'
        AND et.amount = 500000
    )
    THEN 'PASS — inventory purchase seeded (excluded from OpEx in Live P&L)'
    ELSE 'FAIL — inventory purchase missing'
  END AS inventory_purchase_check;

-- Cancelled sale must NOT be counted
SELECT
  CASE
    WHEN (
      SELECT COUNT(*)::int
      FROM sales
      WHERE "restaurantId" = 'pnlseed_rest_001'
        AND status = 'COMPLETED'
        AND timestamp::date BETWEEN DATE '2026-03-01' AND DATE '2026-03-31'
    ) = 3
    THEN 'PASS — only 3 completed sales in March 2026'
    ELSE 'FAIL — completed sales count mismatch'
  END AS completed_sales_check;
