/**
 * i18n translations for the admin and waiter portals.
 *
 * Supported management languages:
 *   - 'en'        → English
 *   - 'ku'        → Sorani Kurdish  (Kurdî)
 *   - 'ar-fusha'  → Fusha Arabic    (العربية الفصحى)
 */

export type ManagementLocale = 'en' | 'ku' | 'ar-fusha'

export interface TranslationStrings {
    /* ── Sidebar (Admin) ── */
    sidebar_dashboard: string
    sidebar_add_menu_items: string
    sidebar_optimize_menu: string
    sidebar_restaurant_dna: string
    sidebar_sales_reports: string
    sidebar_inventory: string
    sidebar_tables: string
    sidebar_sales_pos: string
    sidebar_hr: string
    sidebar_shifts: string
    sidebar_payroll: string
    sidebar_subscription: string
    sidebar_sign_out: string
    sidebar_soon: string

    /* ── Sidebar (Waiter) ── */
    waiter_tables: string
    waiter_my_orders: string
    waiter_chefs: string
    waiter_role_label: string
    waiter_sign_out: string

    /* ── Dashboard Page ── */
    dashboard_title: string
    dashboard_welcome: string
    dashboard_today: string
    dashboard_this_week: string
    dashboard_this_month: string
    dashboard_revenue: string
    dashboard_orders: string
    dashboard_customers_served: string
    dashboard_tables_in_use: string
    dashboard_vs_yesterday: string
    dashboard_completed_today: string
    dashboard_based_on_orders: string
    dashboard_of_total: string
    dashboard_total_orders: string
    dashboard_busiest_hour: string
    dashboard_orders_avg: string
    dashboard_total_revenue: string
    dashboard_net_profit: string
    dashboard_net_margin: string
    dashboard_food_cost: string
    dashboard_revenue_margin_trend: string
    dashboard_daily_revenue_margin: string
    dashboard_wastage_title: string
    dashboard_total_wastage_cost: string
    dashboard_waste_records: string
    dashboard_no_wastage: string
    dashboard_view_sales_reports: string
    dashboard_projected_loss: string
    dashboard_projected_revenue: string
    dashboard_top_cost_drivers: string
    dashboard_ingredient: string
    dashboard_qty: string
    dashboard_cost: string
    dashboard_reason: string
    dashboard_top_selling: string
    dashboard_worst_selling: string
    dashboard_highest_margin: string
    dashboard_lowest_margin: string
    dashboard_commonly_together: string
    dashboard_col_item: string
    dashboard_col_qty: string
    dashboard_col_profit: string
    dashboard_col_margin: string
    dashboard_col_peak: string
    dashboard_col_revenue: string
    dashboard_col_with: string
    dashboard_col_item_combination: string
    dashboard_col_count: string
    dashboard_col_total_margin: string
    dashboard_col_peak_time: string
    dashboard_time_morning: string
    dashboard_time_afternoon: string
    dashboard_time_evening: string
    dashboard_forecast_cogs: string
    dashboard_forecast_labor: string
    dashboard_forecast_operating: string

    /* ── Menu Page ── */
    menu_title: string
    menu_subtitle: string
    menu_client_url: string
    menu_add_item: string
    menu_total_items: string
    menu_average_margin: string
    menu_categories: string
    menu_all_items: string
    menu_search_placeholder: string
    menu_all_statuses: string
    menu_draft: string
    menu_published: string
    menu_costing_incomplete: string
    menu_search: string
    menu_clear: string
    menu_page_of: string
    menu_items: string
    menu_previous: string
    menu_next: string
    menu_create_item: string
    menu_edit_item: string

    /* ── Menu Table ── */
    menu_col_item_name: string
    menu_col_category: string
    menu_col_availability: string
    menu_col_direct_cost: string
    menu_col_gross_profit: string
    menu_col_suggested_price: string
    menu_col_price: string
    menu_col_actions: string
    menu_available: string
    menu_unavailable: string
    menu_sold_out: string
    menu_saving: string
    menu_complete_costing: string
    menu_no_items: string
    menu_delete_title: string
    menu_delete_confirm: string
    menu_deleting: string
    menu_add_categories: string
    menu_add_by_image: string
    menu_import_digital: string
    menu_chef_pick: string

    /* ── Menu Form (edit/create page) ── */
    menu_form_add_title: string
    menu_form_edit_title: string
    menu_form_add_subtitle: string
    menu_form_edit_subtitle: string
    menu_form_back: string
    menu_form_tab_overview: string
    menu_form_tab_smart_chef: string
    menu_form_tab_manual: string
    menu_form_tab_recipe: string
    menu_form_tab_translations: string
    menu_form_cost_analysis: string
    menu_form_selling_price: string
    menu_form_total_cost: string
    menu_form_profit: string
    menu_form_margin: string
    menu_form_save_draft: string
    menu_form_publish: string
    menu_form_create_publish: string
    menu_form_item_details: string
    menu_form_item_name: string
    menu_form_category: string
    menu_form_selling_price_iqd: string
    menu_form_status: string
    menu_form_select_category: string
    menu_form_description_helper: string
    menu_form_generate_description: string
    menu_form_image_url: string
    menu_form_placeholder_name: string
    menu_form_placeholder_description: string
    menu_form_margin_excellent: string
    menu_form_margin_warning: string
    menu_form_nutrition_optional: string
    menu_form_calories: string
    menu_form_protein_g: string
    menu_form_carbs_g: string
    menu_form_dietary_tags: string
    menu_form_placeholder_tags: string
    menu_form_comma_separated: string
    menu_form_add_image_hint: string
    menu_form_configure_background: string
    menu_form_select_category_hint: string
    menu_form_estimate_nutrition: string
    menu_form_consistent_backgrounds: string
    menu_form_how_it_looks: string
    menu_form_preview_description: string
    menu_form_edit_assistant: string
    menu_form_edit_assistant_description: string
    menu_form_edit_assistant_placeholder: string
    menu_form_no_image: string
    menu_form_uncategorized: string
    menu_form_untitled_item: string
    menu_form_no_description: string
    menu_form_add_ons_label: string
    menu_form_updating: string
    menu_form_apply_updates: string
    menu_form_update_form_from_text: string
    menu_form_nutrition_display: string

    /* ── Category names (for display in tables) ── */
    category_drinks: string
    category_main_dishes: string
    category_sides: string
    category_grills: string
    category_signature_dishes: string
    category_shareables: string
    category_desserts: string
    category_add_ons: string
    category_kids: string
    category_appetizers: string
    category_beverages: string

    /* ── Menu Translation tab ── */
    menu_translations_title: string
    menu_translations_description: string
    menu_translation_name: string
    menu_translation_description_label: string
    menu_translation_refresh: string
    menu_translation_edited: string
    menu_translation_protein: string
    menu_translation_carbs: string

    /* ── Menu Optimization ── */
    menu_optimize_title: string
    menu_optimize_subtitle: string

    /* ── Inventory Page ── */
    inventory_title: string
    inventory_subtitle: string
    inventory_add_ingredient: string
    inventory_all_ingredients: string
    inventory_cost_note: string
    inventory_add_new: string
    inventory_edit: string
    inventory_deliveries: string

    /* ── Tables Page ── */
    tables_title: string
    tables_subtitle: string
    tables_add_table: string
    tables_available: string
    tables_occupied: string
    tables_reserved: string
    tables_all_branches: string
    tables_unassigned: string
    tables_add_branch: string
    tables_new_branch: string
    tables_waiters: string
    tables_manage_waiters: string
    tables_add_waiter: string
    tables_edit_waiter: string
    tables_delete_waiter: string
    tables_waiters_description: string
    tables_no_waiters: string
    tables_add_first_waiter: string
    tables_no_email: string
    tables_active: string
    tables_inactive: string
    tables_total_tables: string
    tables_loading: string
    tables_table_label: string
    tables_seats: string
    tables_order: string
    tables_waiter: string
    tables_total: string
    tables_na: string
    tables_no_active_orders: string
    tables_no_tables_branch: string
    tables_no_tables: string
    tables_status_pending: string
    tables_status_preparing: string
    tables_status_ready: string
    tables_status_completed: string

    /* ── Orders Page ── */
    orders_title: string
    orders_subtitle: string
    orders_new_order: string
    orders_all_orders: string

    /* ── Sales / P&L / Reports ── */
    sales_title: string
    sales_subtitle: string

    /* ── HR Pages ── */
    hr_employees_title: string
    hr_employees_subtitle: string
    hr_add_employee: string
    hr_shifts_title: string
    hr_shifts_subtitle: string
    hr_payroll_title: string
    hr_payroll_subtitle: string

    /* ── Categories ── */
    categories_title: string
    categories_subtitle: string

    /* ── Add-ons ── */
    addons_title: string
    addons_subtitle: string

    /* ── Meal Prep ── */
    meal_prep_title: string
    meal_prep_subtitle: string

    /* ── Analytics ── */
    analytics_title: string
    analytics_subtitle: string

    /* ── Billing / Subscription ── */
    billing_title: string
    billing_subtitle: string
    billing_branches: string
    billing_plan_includes: string
    billing_using_branches: string
    billing_extra_branches_cost: string
    billing_no_branches: string
    billing_add_first_branch_desc: string
    billing_add_first_branch: string
    billing_tables_count: string
    billing_orders_count: string
    billing_remove_branch: string
    billing_delete_branch: string
    billing_add_branch: string
    billing_need_more_branches: string
    billing_extra_branch_cost_desc: string
    billing_extra_branch_cost_desc_invoice: string
    /* Subscription tab */
    sub_active_subscription: string
    sub_annual_plan: string
    sub_monthly_plan: string
    sub_subscription_active: string
    sub_renews_on: string
    sub_manage_subscription: string
    sub_portal_description: string
    sub_choose_plan: string
    sub_thank_you: string
    sub_now_active: string
    sub_checkout_canceled: string
    sub_canceled: string
    /* Subscription plans */
    sub_billing_not_configured: string
    sub_monthly: string
    sub_per_month: string
    sub_cancel_anytime: string
    sub_coming_soon: string
    sub_feature_menu: string
    sub_feature_ai: string
    sub_feature_analytics: string
    sub_feature_tables: string
    sub_feature_theme: string
    sub_feature_pos: string
    sub_feature_hr: string
    sub_current_plan: string
    sub_subscribe_now: string
    sub_annual: string
    sub_per_year: string
    sub_save_amount: string
    sub_best_value: string
    /* Referral */
    sub_referral_title: string
    sub_referral_description: string
    sub_referral_link: string
    sub_referral_copy: string
    sub_referral_copied: string

    /* ── Settings page ── */
    settings_title: string
    settings_subtitle: string
    settings_management_language: string
    settings_management_language_description: string
    settings_save_button: string
    settings_style_presets: string
    settings_brand_colors: string
    settings_menu_background: string
    settings_typography: string
    settings_restaurant_name: string
    settings_carousel_style: string
    settings_timezone: string
    settings_dish_photo_bg: string
    settings_ai_description_tone: string
    settings_restaurant_photo: string
    settings_smart_designer: string
    settings_smart_designer_description: string

    /* ── Common ── */
    common_loading: string
    common_save: string
    common_cancel: string
    common_error: string
    common_delete: string
    common_edit: string
    common_back: string
    common_actions: string
    common_name: string
    common_description: string
    common_price: string
    common_status: string
    common_date: string
    common_total: string
    common_yes: string
    common_no: string

    /* ── Waiter Dashboard ── */
    waiter_dashboard_title: string
    waiter_new_order: string
    waiter_order_placed: string
    waiter_preparing: string
    waiter_ready: string
    waiter_served: string
    waiter_completed: string
}

const en: TranslationStrings = {
    /* Sidebar (Admin) */
    sidebar_dashboard: 'Dashboard',
    sidebar_add_menu_items: 'Add Menu Items',
    sidebar_optimize_menu: 'Optimize your menu sales',
    sidebar_restaurant_dna: 'Restaurant DNA',
    sidebar_sales_reports: 'Sales Reports',
    sidebar_inventory: 'Inventory',
    sidebar_tables: 'Tables',
    sidebar_sales_pos: 'Sales POS',
    sidebar_hr: 'HR',
    sidebar_shifts: 'Shifts',
    sidebar_payroll: 'Payroll',
    sidebar_subscription: 'Subscription',
    sidebar_sign_out: 'Sign Out',
    sidebar_soon: 'SOON',

    /* Sidebar (Waiter) */
    waiter_tables: 'Tables',
    waiter_my_orders: 'My Orders',
    waiter_chefs: 'Chefs',
    waiter_role_label: 'WAITER',
    waiter_sign_out: 'Sign Out',

    /* Dashboard */
    dashboard_title: 'Dashboard',
    dashboard_welcome: 'Welcome back',
    dashboard_today: 'Today',
    dashboard_this_week: 'This Week',
    dashboard_this_month: 'This Month',
    dashboard_revenue: 'Revenue',
    dashboard_orders: 'Orders',
    dashboard_customers_served: 'Customers Served',
    dashboard_tables_in_use: 'Tables in Use',
    dashboard_vs_yesterday: 'vs yesterday',
    dashboard_completed_today: 'Completed today',
    dashboard_based_on_orders: 'Based on orders',
    dashboard_of_total: 'of {0} total',
    dashboard_total_orders: 'Total Orders',
    dashboard_busiest_hour: 'Busiest Hour',
    dashboard_orders_avg: '{0} orders avg',
    dashboard_total_revenue: 'Total Revenue',
    dashboard_net_profit: 'Net Profit',
    dashboard_net_margin: 'Net Margin',
    dashboard_food_cost: 'Food Cost %',
    dashboard_revenue_margin_trend: 'Revenue and Margin Trend',
    dashboard_daily_revenue_margin: 'Daily revenue and margin for the past month',
    dashboard_wastage_title: 'Wastage (This Month)',
    dashboard_total_wastage_cost: 'Total wastage cost',
    dashboard_waste_records: '{0} waste record(s) this month',
    dashboard_no_wastage: 'No wastage recorded this month',
    dashboard_view_sales_reports: 'View Sales Reports →',
    dashboard_projected_loss: 'Projected net loss this month',
    dashboard_projected_revenue: 'projected revenue',
    dashboard_top_cost_drivers: 'Top cost drivers',
    dashboard_ingredient: 'Ingredient',
    dashboard_qty: 'Qty',
    dashboard_cost: 'Cost',
    dashboard_reason: 'Reason',
    dashboard_top_selling: 'Top Selling Items (This Month)',
    dashboard_worst_selling: 'Worst Selling Items (This Month)',
    dashboard_highest_margin: 'Highest Margin Items',
    dashboard_lowest_margin: 'Lowest Margin Items',
    dashboard_commonly_together: 'Items Commonly Purchased Together',
    dashboard_col_item: 'Item',
    dashboard_col_qty: 'Qty',
    dashboard_col_profit: 'Profit',
    dashboard_col_margin: 'Margin',
    dashboard_col_peak: 'Peak',
    dashboard_col_revenue: 'Revenue',
    dashboard_col_with: 'With',
    dashboard_col_item_combination: 'Item Combination',
    dashboard_col_count: 'Count',
    dashboard_col_total_margin: 'Total Margin',
    dashboard_col_peak_time: 'Peak Time',
    dashboard_time_morning: 'Morning',
    dashboard_time_afternoon: 'Afternoon',
    dashboard_time_evening: 'Evening',
    dashboard_forecast_cogs: 'COGS',
    dashboard_forecast_labor: 'Labor',
    dashboard_forecast_operating: 'Operating Expenses',

    /* Menu Page */
    menu_title: 'Menu',
    menu_subtitle: 'Menu items, categories, add-ons, and how the digital menu suggests items to guests.',
    menu_client_url: 'Client menu URL:',
    menu_add_item: 'Add Menu Item',
    menu_total_items: 'Total Menu Items',
    menu_average_margin: 'Average Margin',
    menu_categories: 'Categories',
    menu_all_items: 'All Menu Items',
    menu_search_placeholder: 'Search menu items',
    menu_all_statuses: 'All statuses',
    menu_draft: 'Draft',
    menu_published: 'Published',
    menu_costing_incomplete: 'Costing incomplete',
    menu_search: 'Search',
    menu_clear: 'Clear',
    menu_page_of: 'Page {0} of {1} ({2} items)',
    menu_items: 'items',
    menu_previous: 'Previous',
    menu_next: 'Next',
    menu_create_item: 'Create Menu Item',
    menu_edit_item: 'Edit Menu Item',

    /* Menu Table */
    menu_col_item_name: 'Item Name',
    menu_col_category: 'Category',
    menu_col_availability: 'Availability',
    menu_col_direct_cost: 'Direct Cost',
    menu_col_gross_profit: 'Gross Profit',
    menu_col_suggested_price: 'Suggested Price',
    menu_col_price: 'Price',
    menu_col_actions: 'Actions',
    menu_available: 'Available',
    menu_unavailable: 'Unavailable',
    menu_sold_out: 'Sold Out',
    menu_saving: 'Saving...',
    menu_complete_costing: 'Complete Costing',
    menu_no_items: 'No menu items found. Add your first menu item to get started.',
    menu_delete_title: 'Delete menu item',
    menu_delete_confirm: 'Are you sure you want to remove {0} from your menu? This action cannot be undone.',
    menu_deleting: 'Deleting...',
    menu_add_categories: 'Add Categories to your menu',
    menu_add_by_image: 'Add Menu Items by Image',
    menu_import_digital: 'Import by Digital Menu',
    menu_chef_pick: 'Chef pick',

    /* Menu Form (edit/create page) */
    menu_form_add_title: 'Add New Menu Item',
    menu_form_edit_title: 'Edit Menu Item',
    menu_form_add_subtitle: 'Create a new menu item with recipe',
    menu_form_edit_subtitle: 'Update menu item details and recipe',
    menu_form_back: 'Back',
    menu_form_tab_overview: 'Overview',
    menu_form_tab_smart_chef: 'Smart Chef',
    menu_form_tab_manual: 'Manual',
    menu_form_tab_recipe: 'Recipe',
    menu_form_tab_translations: 'Translations',
    menu_form_cost_analysis: 'Cost Analysis',
    menu_form_selling_price: 'Selling Price:',
    menu_form_total_cost: 'Total Cost:',
    menu_form_profit: 'Profit:',
    menu_form_margin: 'Margin:',
    menu_form_save_draft: 'Save as draft',
    menu_form_publish: 'Publish to menu',
    menu_form_create_publish: 'Create & publish to menu',
    menu_form_item_details: 'Menu Item Details',
    menu_form_item_name: 'Item Name',
    menu_form_category: 'Category',
    menu_form_selling_price_iqd: 'Selling Price (IQD)',
    menu_form_status: 'Status',
    menu_form_select_category: 'Select category',
    menu_form_description_helper: 'Max 18 words. Leave blank to auto-generate when you save (sensory, texture, heat, origin, scarcity).',
    menu_form_generate_description: 'Generate Description',
    menu_form_image_url: 'Image URL (optional)',
    menu_form_placeholder_name: 'e.g., Chicken Biryani',
    menu_form_placeholder_description: 'Brief description of the dish...',
    menu_form_margin_excellent: 'Excellent: This item has a healthy profit margin.',
    menu_form_margin_warning: 'Warning: Margin is below 20%. Consider increasing the price or reducing recipe costs.',
    menu_form_nutrition_optional: 'Nutrition (optional)',
    menu_form_calories: 'Calories',
    menu_form_protein_g: 'Protein (g)',
    menu_form_carbs_g: 'Carbs (g)',
    menu_form_dietary_tags: 'Dietary Tags (optional)',
    menu_form_placeholder_tags: 'e.g., vegan, gluten-free, spicy',
    menu_form_comma_separated: 'Comma-separated tags',
    menu_form_add_image_hint: 'Add an image for this item (paste a URL or generate with AI)',
    menu_form_configure_background: 'Configure background prompt or upload reference image',
    menu_form_select_category_hint: 'Select a category to continue',
    menu_form_estimate_nutrition: 'Estimate Nutrition',
    menu_form_consistent_backgrounds: 'Want consistent backgrounds across all dishes?',
    menu_form_how_it_looks: 'How it looks',
    menu_form_preview_description: 'Preview of this menu item. Use the other tabs to edit, or the Edit assistant below to update from new text.',
    menu_form_edit_assistant: 'Edit assistant',
    menu_form_edit_assistant_description: 'Paste updated info (e.g. new description or price) and we\'ll update the form. Then review in Details, Recipe, or More.',
    menu_form_edit_assistant_placeholder: 'e.g.: Update price to 14,000 IQD. Mention \'Yield: 10\' if updating a batch recipe.',
    menu_form_no_image: 'No image',
    menu_form_uncategorized: 'Uncategorized',
    menu_form_untitled_item: 'Untitled item',
    menu_form_no_description: 'No description.',
    menu_form_add_ons_label: 'Add-ons',
    menu_form_updating: 'Updating...',
    menu_form_apply_updates: 'Apply updates',
    menu_form_update_form_from_text: 'Update form from text',
    menu_form_nutrition_display: '{0} cal {1}g protein {2}g carbs',
    category_drinks: 'Drinks',
    category_main_dishes: 'Main Dishes',
    category_sides: 'Sides',
    category_grills: 'Grills',
    category_signature_dishes: 'Signature Dishes',
    category_shareables: 'Shareables',
    category_desserts: 'Desserts',
    category_add_ons: 'Add-ons',
    category_kids: 'Kids',
    category_appetizers: 'Appetizers',
    category_beverages: 'Beverages',

    /* Menu Translation tab */
    menu_translations_title: 'Menu Translations',
    menu_translations_description: 'Auto-generate translated names and descriptions. You can always edit them before saving.',
    menu_translation_name: 'Name',
    menu_translation_description_label: 'Description',
    menu_translation_refresh: 'Refresh',
    menu_translation_edited: 'Edited',
    menu_translation_protein: 'Protein',
    menu_translation_carbs: 'Carbs',

    /* Menu Optimization */
    menu_optimize_title: 'Optimize your menu to increase profit and sales',
    menu_optimize_subtitle: 'We offer three options to optimize your menu.',

    /* Inventory */
    inventory_title: 'Inventory Management',
    inventory_subtitle: 'Manage your ingredients',
    inventory_add_ingredient: 'Add Ingredient',
    inventory_all_ingredients: 'All Ingredients',
    inventory_cost_note: 'Cost per unit is updated automatically when you record a delivery or an expense in P&L linked to an ingredient (quantity + unit cost). You don\'t need to change it here unless you want to correct a value.',
    inventory_add_new: 'Add New Ingredient',
    inventory_edit: 'Edit Ingredient',
    inventory_deliveries: 'Deliveries',

    /* Tables */
    tables_title: 'Tables',
    tables_subtitle: 'Manage your restaurant tables',
    tables_add_table: 'Add Table',
    tables_available: 'Available',
    tables_occupied: 'Occupied',
    tables_reserved: 'Reserved',
    tables_all_branches: 'All Branches',
    tables_unassigned: 'Unassigned',
    tables_add_branch: 'Add Branch',
    tables_new_branch: 'New Branch',
    tables_waiters: 'Waiters',
    tables_manage_waiters: 'Manage Waiters',
    tables_add_waiter: 'Add Waiter',
    tables_edit_waiter: 'Edit',
    tables_delete_waiter: 'Remove',
    tables_waiters_description: 'Add waiters so they can sign in at /waiter/login and manage tables and orders with your restaurant\'s menu.',
    tables_no_waiters: 'No waiters yet',
    tables_add_first_waiter: 'Add your first waiter',
    tables_no_email: 'No email',
    tables_active: 'Active',
    tables_inactive: 'Inactive',
    tables_total_tables: 'Total Tables',
    tables_loading: 'Loading tables...',
    tables_table_label: 'Table',
    tables_seats: 'seats',
    tables_order: 'Order',
    tables_waiter: 'Waiter',
    tables_total: 'Total',
    tables_na: 'N/A',
    tables_no_active_orders: 'No active orders',
    tables_no_tables_branch: 'No tables found for this branch.',
    tables_no_tables: 'No tables found. Add your first table to get started.',
    tables_status_pending: 'Pending',
    tables_status_preparing: 'Preparing',
    tables_status_ready: 'Ready',
    tables_status_completed: 'Completed',

    /* Orders */
    orders_title: 'Orders',
    orders_subtitle: 'View and manage customer orders',
    orders_new_order: 'New Order',
    orders_all_orders: 'All Orders',

    /* Sales Reports */
    sales_title: 'Sales Reports',
    sales_subtitle: 'Track your revenue, costs, and profitability',

    /* HR */
    hr_employees_title: 'Employees',
    hr_employees_subtitle: 'Manage your team',
    hr_add_employee: 'Add New Employee',
    hr_shifts_title: 'Shift Schedule',
    hr_shifts_subtitle: 'Manage staff shifts',
    hr_payroll_title: 'Payroll Management',
    hr_payroll_subtitle: 'Manage employee payments',

    /* Categories */
    categories_title: 'Category Manager',
    categories_subtitle: 'Organize your menu items into categories',

    /* Add-ons */
    addons_title: 'Add-ons',
    addons_subtitle: 'Manage menu item add-ons and extras',

    /* Meal Prep */
    meal_prep_title: 'Meal Prep',
    meal_prep_subtitle: 'Plan and track meal preparations',

    /* Analytics */
    analytics_title: 'Analytics',
    analytics_subtitle: 'Detailed insights into your menu performance',

    /* Billing */
    billing_title: 'Membership',
    billing_subtitle: 'Manage your subscription plan',
    billing_branches: 'Branches',
    billing_plan_includes: 'Your plan includes {{count}} branch. Additional branches cost ${{price}}/month each.',
    billing_using_branches: 'Using {{used}} of {{total}} branches',
    billing_extra_branches_cost: '+${{price}}/month for {{count}} extra branch(es)',
    billing_no_branches: 'No branches yet',
    billing_add_first_branch_desc: 'Add your first branch to organize tables and sales by location.',
    billing_add_first_branch: 'Add Your First Branch',
    billing_tables_count: 'tables',
    billing_orders_count: 'orders',
    billing_remove_branch: 'Remove branch (subscription will be updated)',
    billing_delete_branch: 'Delete branch',
    billing_add_branch: 'Add Branch',
    billing_need_more_branches: 'Need more branches?',
    billing_extra_branch_cost_desc: 'Each additional branch is ${{price}}/month. Contact us to upgrade.',
    billing_extra_branch_cost_desc_invoice: 'Each additional branch is ${{price}}/month. Add one below and it will be reflected on your next invoice.',
    sub_active_subscription: 'Active subscription',
    sub_annual_plan: 'Annual plan · $500/year',
    sub_monthly_plan: 'Monthly plan · $50/month',
    sub_subscription_active: 'Your subscription is active',
    sub_renews_on: 'Renews on {{date}}',
    sub_manage_subscription: 'Manage subscription',
    sub_portal_description: 'Update payment method, view invoices, or cancel — in your secure Stripe portal.',
    sub_choose_plan: 'Choose your plan',
    sub_thank_you: 'Thank you',
    sub_now_active: 'Your subscription is now active.',
    sub_checkout_canceled: 'Checkout was canceled.',
    sub_canceled: 'Canceled',
    sub_billing_not_configured: 'Billing is not fully configured. Set STRIPE_PRICE_MONTHLY and STRIPE_PRICE_ANNUAL.',
    sub_monthly: 'Monthly',
    sub_per_month: '/month',
    sub_cancel_anytime: 'Cancel anytime. No long-term commitment.',
    sub_coming_soon: 'Coming soon',
    sub_feature_menu: 'Menu management & digital menu builder',
    sub_feature_ai: 'AI-powered menu optimization',
    sub_feature_analytics: 'P&L analytics & sales reports',
    sub_feature_tables: 'Table & inventory tracking',
    sub_feature_theme: 'Restaurant theme customization',
    sub_feature_pos: 'POS & order management',
    sub_feature_hr: 'HR, shifts & payroll',
    sub_current_plan: 'Current plan',
    sub_subscribe_now: 'Subscribe now',
    sub_annual: 'Annual',
    sub_per_year: '/year',
    sub_save_amount: 'Save $100',
    sub_best_value: 'Best value. Save $100 compared to monthly billing.',
    sub_referral_title: 'Refer friends, get 10% off',
    sub_referral_description: 'Share your link. When they subscribe, you get 10% off your next month.',
    sub_referral_link: 'Your referral link',
    sub_referral_copy: 'Copy link',
    sub_referral_copied: 'Copied',

    /* Settings */
    settings_title: 'Restaurant DNA',
    settings_subtitle: "Your restaurant's unique identity — colors, fonts, and everything that makes your brand yours.",
    settings_management_language: 'Management Language',
    settings_management_language_description: 'Choose the language for this dashboard.',
    settings_save_button: 'Save Restaurant DNA',
    settings_style_presets: 'Style Presets',
    settings_brand_colors: 'Brand Colors',
    settings_menu_background: 'Menu Background',
    settings_typography: 'Typography',
    settings_restaurant_name: 'Restaurant Name',
    settings_carousel_style: 'Carousel Style',
    settings_timezone: 'Timezone',
    settings_dish_photo_bg: 'Dish Photo Background',
    settings_ai_description_tone: 'AI Menu Description Tone',
    settings_restaurant_photo: 'Restaurant Photo (Optional)',
    settings_smart_designer: 'Smart Designer',
    settings_smart_designer_description: 'AI-powered design assistant — get color recommendations, font suggestions, and carousel advice.',

    /* Common */
    common_loading: 'Loading...',
    common_save: 'Save',
    common_cancel: 'Cancel',
    common_error: 'Error',
    common_delete: 'Delete',
    common_edit: 'Edit',
    common_back: 'Back',
    common_actions: 'Actions',
    common_name: 'Name',
    common_description: 'Description',
    common_price: 'Price',
    common_status: 'Status',
    common_date: 'Date',
    common_total: 'Total',
    common_yes: 'Yes',
    common_no: 'No',

    /* Waiter Dashboard */
    waiter_dashboard_title: 'Waiter Dashboard',
    waiter_new_order: 'New Order',
    waiter_order_placed: 'Order Placed',
    waiter_preparing: 'Preparing',
    waiter_ready: 'Ready',
    waiter_served: 'Served',
    waiter_completed: 'Completed',
}

const ku: TranslationStrings = {
    /* Sidebar (Admin) */
    sidebar_dashboard: 'داشبۆرد',
    sidebar_add_menu_items: 'زیادکردنی خواردنەکان',
    sidebar_optimize_menu: 'باشترکردنی فرۆشتنی مینیو',
    sidebar_restaurant_dna: 'ناسنامەی چێشتخانە',
    sidebar_sales_reports: 'ڕاپۆرتی فرۆشتن',
    sidebar_inventory: 'کۆگا',
    sidebar_tables: 'مێزەکان',
    sidebar_sales_pos: 'فرۆشتن POS',
    sidebar_hr: 'بەڕێوەبردنی کارمەندان',
    sidebar_shifts: 'شیفتەکان',
    sidebar_payroll: 'مووچە',
    sidebar_subscription: 'بەشداری',
    sidebar_sign_out: 'چوونە دەرەوە',
    sidebar_soon: 'بەم زووانە',

    /* Sidebar (Waiter) */
    waiter_tables: 'مێزەکان',
    waiter_my_orders: 'داواکاریەکانم',
    waiter_chefs: 'ئاشپەزەکان',
    waiter_role_label: 'گارسۆن',
    waiter_sign_out: 'چوونە دەرەوە',

    /* Dashboard */
    dashboard_title: 'داشبۆرد',
    dashboard_welcome: 'بەخێربێیتەوە',
    dashboard_today: 'ئەمڕۆ',
    dashboard_this_week: 'ئەم هەفتەیە',
    dashboard_this_month: 'ئەم مانگە',
    dashboard_revenue: 'داهات',
    dashboard_orders: 'داواکاریەکان',
    dashboard_customers_served: 'خاوەن کڕیارەکان',
    dashboard_tables_in_use: 'مێزە بەکارهاتووەکان',
    dashboard_vs_yesterday: 'بەراورد بە دوێنێ',
    dashboard_completed_today: 'ئەمڕۆ تەواوبوو',
    dashboard_based_on_orders: 'بەپێی داواکاریەکان',
    dashboard_of_total: 'لە {0} کۆی گشتی',
    dashboard_total_orders: 'کۆی داواکاریەکان',
    dashboard_busiest_hour: 'قەرەباڵغترین کاتژمێر',
    dashboard_orders_avg: '{0} داواکاری تێکڕا',
    dashboard_total_revenue: 'کۆی داهات',
    dashboard_net_profit: 'قازانجی ڕەوا',
    dashboard_net_margin: 'ڕێژەی قازانج',
    dashboard_food_cost: 'ڕێژەی تێچوونی خواردن',
    dashboard_revenue_margin_trend: 'ڕەوتی داهات و قازانج',
    dashboard_daily_revenue_margin: 'داهات و قازانجی ڕۆژانە بۆ مانگی ڕابردوو',
    dashboard_wastage_title: 'بەفیڕۆچوو (ئەم مانگە)',
    dashboard_total_wastage_cost: 'کۆی تێچوونی بەفیڕۆچوو',
    dashboard_waste_records: '{0} تۆماری بەفیڕۆچوو لەم مانگەدا',
    dashboard_no_wastage: 'هیچ بەفیڕۆچوویەک تۆمارنەکراوە لەم مانگەدا',
    dashboard_view_sales_reports: 'بینینی ڕاپۆرتی فرۆشتن ←',
    dashboard_projected_loss: 'زیانی چاوەڕوانکراو بۆ ئەم مانگە',
    dashboard_projected_revenue: 'داهاتی چاوەڕوانکراو',
    dashboard_top_cost_drivers: 'سەرەکیترین تێچووەکان',
    dashboard_ingredient: 'خامەتاو',
    dashboard_qty: 'بڕ',
    dashboard_cost: 'تێچوون',
    dashboard_reason: 'هۆکار',
    dashboard_top_selling: 'باشترین خواردنەکان لە فرۆشتندا (ئەم مانگە)',
    dashboard_worst_selling: 'خراپترین خواردنەکان لە فرۆشتندا (ئەم مانگە)',
    dashboard_highest_margin: 'خواردنەکانی بەرزترین قازانج',
    dashboard_lowest_margin: 'خواردنەکانی نزمترین قازانج',
    dashboard_commonly_together: 'خواردنەکانی بەیەکەوە دەکڕدرێن',
    dashboard_col_item: 'خواردن',
    dashboard_col_qty: 'بڕ',
    dashboard_col_profit: 'قازانج',
    dashboard_col_margin: 'ڕێژەی قازانج',
    dashboard_col_peak: 'خاڵی بەرز',
    dashboard_col_revenue: 'داهات',
    dashboard_col_with: 'لەگەڵ',
    dashboard_col_item_combination: 'کۆمبۆی خواردن',
    dashboard_col_count: 'ژمارە',
    dashboard_col_total_margin: 'کۆی ڕێژەی قازانج',
    dashboard_col_peak_time: 'کاتی خاڵی بەرز',
    dashboard_time_morning: 'بەیانی',
    dashboard_time_afternoon: 'دواینیوەڕۆ',
    dashboard_time_evening: 'ئێوارە',
    dashboard_forecast_cogs: 'تێچوونی خواردن',
    dashboard_forecast_labor: 'کرێی کار',
    dashboard_forecast_operating: 'خەرجییەکانی بەڕێوەبردن',

    /* Menu Page */
    menu_title: 'مینیو',
    menu_subtitle: 'خواردنەکان، پۆلەکان، زیادکراوەکان، و چۆنیەتی پێشنیارکردنی خواردن لە مینیوی دیجیتاڵ.',
    menu_client_url: 'لینکی مینیوی کڕیار:',
    menu_add_item: 'زیادکردنی خواردن',
    menu_total_items: 'کۆی خواردنەکان',
    menu_average_margin: 'تێکڕای قازانج',
    menu_categories: 'پۆلەکان',
    menu_all_items: 'هەموو خواردنەکان',
    menu_search_placeholder: 'گەڕان لە خواردنەکان',
    menu_all_statuses: 'هەموو باردۆخەکان',
    menu_draft: 'ڕەشنووس',
    menu_published: 'بڵاوکراوەتەوە',
    menu_costing_incomplete: 'تێچوون تەواونییە',
    menu_search: 'گەڕان',
    menu_clear: 'پاککردنەوە',
    menu_page_of: 'لاپەڕەی {0} لە {1} ({2} خواردن)',
    menu_items: 'خواردن',
    menu_previous: 'پێشوو',
    menu_next: 'دواتر',
    menu_create_item: 'دروستکردنی خواردنی نوێ',
    menu_edit_item: 'دەستکاریکردنی خواردن',

    /* Menu Table */
    menu_col_item_name: 'ناوی خواردن',
    menu_col_category: 'پۆل',
    menu_col_availability: 'بەردەستی',
    menu_col_direct_cost: 'تێچوونی ڕاستەوخۆ',
    menu_col_gross_profit: 'قازانجی کۆ',
    menu_col_suggested_price: 'نرخی پێشنیارکراو',
    menu_col_price: 'نرخ',
    menu_col_actions: 'کردارەکان',
    menu_available: 'بەردەست',
    menu_unavailable: 'نا بەردەست',
    menu_sold_out: 'تەواوبوو',
    menu_saving: 'پاشەکەوتدەکرێت...',
    menu_complete_costing: 'تەواوکردنی تێچوون',
    menu_no_items: 'هیچ خواردنێک نەدۆزرایەوە. یەکەم خواردنەکەت زیادبکە بۆ دەستپێکردن.',
    menu_delete_title: 'سڕینەوەی خواردن',
    menu_delete_confirm: 'ئایا دڵنیایت لە سڕینەوەی {0} لە مینیوەکەت؟ ئەم کردارە ناگەڕێتەوە.',
    menu_deleting: 'سڕینەوە...',
    menu_add_categories: 'زیادکردنی پۆل بۆ مینیوەکەت',
    menu_add_by_image: 'زیادکردنی خواردن بە وێنە',
    menu_import_digital: 'هاوردەکردن لە مینیوی دیجیتاڵ',
    menu_chef_pick: 'هەڵبژاردەی ئاشپەز',

    /* Menu Form (edit/create page) */
    menu_form_add_title: 'زیادکردنی خواردنی نوێ',
    menu_form_edit_title: 'دەستکاریکردنی خواردن',
    menu_form_add_subtitle: 'دروستکردنی خواردنی نوێ لەگەڵ ڕەچەتە',
    menu_form_edit_subtitle: 'نوێکردنەوەی وردەکاری خواردن و ڕەچەتە',
    menu_form_back: 'گەڕانەوە',
    menu_form_tab_overview: 'پوختە',
    menu_form_tab_smart_chef: 'ئاشپەزی زیرەک',
    menu_form_tab_manual: 'دەستی',
    menu_form_tab_recipe: 'ڕەچەتە',
    menu_form_tab_translations: 'وەرگێڕانەکان',
    menu_form_cost_analysis: 'شیکاریی تێچوون',
    menu_form_selling_price: 'نرخی فرۆشتن:',
    menu_form_total_cost: 'کۆی تێچوون:',
    menu_form_profit: 'قازانج:',
    menu_form_margin: 'قازانجی ڕێژەیی:',
    menu_form_save_draft: 'پاشەکەوتکردن وەک ڕەشنووس',
    menu_form_publish: 'بڵاوکردنەوە لە مینیو',
    menu_form_create_publish: 'دروستکردن و بڵاوکردنەوە',
    menu_form_item_details: 'وردەکاری خواردنی مینیو',
    menu_form_item_name: 'ناوی خواردن',
    menu_form_category: 'پۆل',
    menu_form_selling_price_iqd: 'نرخی فرۆشتن (IQD)',
    menu_form_status: 'باردۆخ',
    menu_form_select_category: 'پۆلێک هەڵبژێرە',
    menu_form_description_helper: 'بەردەستی ماکسی ١٨ وشە. بە بەتاڵی بهێڵەوە بۆ دروستکردنی ئۆتۆماتیکی کاتێک پاشەکەوت دەکەیت.',
    menu_form_generate_description: 'دروستکردنی وەسف',
    menu_form_image_url: 'لینکی وێنە (ئارەزوومەندانە)',
    menu_form_placeholder_name: 'وەک، بریانی مەرغ',
    menu_form_placeholder_description: 'وەسفێکی کورت بۆ خواردنەکە...',
    menu_form_margin_excellent: 'نایابە: ئەم خواردنە ڕێژەی قازانجی تەندروستە.',
    menu_form_margin_warning: 'ئاگاداری: ڕێژەی قازانج لە ٢٠٪ کەمترە. گەشەپێدانی نرخ یان کەمکردنەوەی تێچوونی ڕەچەتە بیربکەرەوە.',
    menu_form_nutrition_optional: 'خۆراک (ئارەزوومەندانە)',
    menu_form_calories: 'کالۆری',
    menu_form_protein_g: 'پرۆتین (گ)',
    menu_form_carbs_g: 'کاربۆهایدرەیت (گ)',
    menu_form_dietary_tags: 'تاگی خۆراک (ئارەزوومەندانە)',
    menu_form_placeholder_tags: 'وەک، ڤێگان، بێ گلوتن، تامدار',
    menu_form_comma_separated: 'تاگەکانی جیاکراوە لە کۆما',
    menu_form_add_image_hint: 'وێنەیەک زیاد بکە بۆ ئەم خواردنە (لینکێک بنووسە یان بە AI دروستی بکە)',
    menu_form_configure_background: 'ڕێکخستنی پسپۆڕی پاشبنەما یان هەڵکردنی وێنەی ئاماژە',
    menu_form_select_category_hint: 'پۆلێک هەڵبژێرە بۆ دروستکردن',
    menu_form_estimate_nutrition: 'خەمڵاندنی خۆراک',
    menu_form_consistent_backgrounds: 'پاشبنەمای هاوشێوە دەتەوێت بۆ هەموو خواردنەکان؟',
    menu_form_how_it_looks: 'چۆنیەتی دەرکەوتن',
    menu_form_preview_description: 'پێشبینینی ئەم خواردنە. تابەکانی دیکە بەکار بهێنە بۆ دەستکاری، یان یارمەتیدەری دەستکاری خوارەوە بۆ نوێکردنەوە لە دەقی نوێ.',
    menu_form_edit_assistant: 'یارمەتیدەری دەستکاری',
    menu_form_edit_assistant_description: 'زانیاری نوێ بنووسە (وەک وەسف یان نرخ) و ئێمە فۆڕمەکە نوێ دەکەینەوە. پاشان لە وردەکاری، ڕەچەتە، یان زیاتر پێداچوونەوە بکە.',
    menu_form_edit_assistant_placeholder: 'وەک: نرخ بگۆڕە بۆ ١٤٬٠٠٠ IQD.',
    menu_form_no_image: 'هیچ وێنەیەک نییە',
    menu_form_uncategorized: 'بەبێ پۆل',
    menu_form_untitled_item: 'خواردنی بێ ناو',
    menu_form_no_description: 'هیچ وەسفێک نییە.',
    menu_form_add_ons_label: 'زیادکراوەکان',
    menu_form_updating: 'نوێکردنەوە...',
    menu_form_apply_updates: 'جێبەجێکردنی گۆڕانکارییەکان',
    menu_form_update_form_from_text: 'نوێکردنەوەی فۆڕم لە دەق',
    menu_form_nutrition_display: '{0} کالۆری {1}گ پرۆتین {2}گ کاربۆهایدرەیت',
    category_drinks: 'خواردنەوەکان',
    category_main_dishes: 'خواردنە سەرەکییەکان',
    category_sides: 'هاوخواردنەکان',
    category_grills: 'برژین',
    category_signature_dishes: 'خواردنە تایبەتەکان',
    category_shareables: 'هاوبەشکراوەکان',
    category_desserts: 'دێزێرتەکان',
    category_add_ons: 'زیادکراوەکان',
    category_kids: 'مناڵان',
    category_appetizers: 'خواردنی پێشخواردن',
    category_beverages: 'خواردنەوەکان',

    /* Menu Translation tab */
    menu_translations_title: 'وەرگێڕانی مینیو',
    menu_translations_description: 'ناو و وەسف بۆ زمانەکانی دیکە بەشێوەی ئۆتۆماتیکی دروست بکە. دەتوانیت پێش پاشەکەوتکردن دەستکاری بکەیت.',
    menu_translation_name: 'ناو',
    menu_translation_description_label: 'وەسف',
    menu_translation_refresh: 'نوێکردنەوە',
    menu_translation_edited: 'دەستکاریکراو',
    menu_translation_protein: 'پرۆتین',
    menu_translation_carbs: 'کاربۆهایدرەیت',

    /* Menu Optimization */
    menu_optimize_title: 'باشترکردنی مینیو بۆ زیادکردنی قازانج و فرۆشتن',
    menu_optimize_subtitle: 'سێ هەڵبژاردن بۆ باشترکردنی مینیو.',

    /* Inventory */
    inventory_title: 'بەڕێوەبردنی کۆگا',
    inventory_subtitle: 'بەڕێوەبردنی خامەتاوەکان',
    inventory_add_ingredient: 'زیادکردنی خامەتاو',
    inventory_all_ingredients: 'هەموو خامەتاوەکان',
    inventory_cost_note: 'تێچوونی یەکە بەشێوەی ئۆتۆماتیکی نوێدەکرێتەوە کاتێک گەیاندن یان خەرجییەک تۆمار دەکەیت.',
    inventory_add_new: 'زیادکردنی خامەتاوی نوێ',
    inventory_edit: 'دەستکاریکردنی خامەتاو',
    inventory_deliveries: 'گەیاندنەکان',

    /* Tables */
    tables_title: 'مێزەکان',
    tables_subtitle: 'بەڕێوەبردنی مێزەکانی چێشتخانە',
    tables_add_table: 'زیادکردنی مێز',
    tables_available: 'بەردەست',
    tables_occupied: 'داگیرکراو',
    tables_reserved: 'ڕیزەرڤکراو',
    tables_all_branches: 'هەموو لقەکان',
    tables_unassigned: 'ناپەیوەندکراو',
    tables_add_branch: 'زیادکردنی لق',
    tables_new_branch: 'لقە نوێیە',
    tables_waiters: 'خزمەتکاران',
    tables_manage_waiters: 'بەڕێوەبردنی خزمەتکاران',
    tables_add_waiter: 'زیادکردنی خزمەتکار',
    tables_edit_waiter: 'دەستکاری',
    tables_delete_waiter: 'سڕینەوە',
    tables_waiters_description: 'خزمەتکار زیاد بکە بۆ ئەوەی بتوانن لە /waiter/login داخڵ بن و مێزەکان و داواکاریەکان بە مێنیوی چێشتخانەکەت بەڕێوەببەن.',
    tables_no_waiters: 'هێشتا خزمەتکار نییە',
    tables_add_first_waiter: 'یەکەم خزمەتکارت زیاد بکە',
    tables_no_email: 'ئیمەیڵ نییە',
    tables_active: 'چالاک',
    tables_inactive: 'ناچالاک',
    tables_total_tables: 'کۆی مێزەکان',
    tables_loading: 'مێزەکان بار دەکرێن...',
    tables_table_label: 'مێز',
    tables_seats: 'کورسی',
    tables_order: 'داواکاری',
    tables_waiter: 'خزمەتکار',
    tables_total: 'کۆ',
    tables_na: 'نییە',
    tables_no_active_orders: 'هیچ داواکاری چالاک نییە',
    tables_no_tables_branch: 'هیچ مێزێک بۆ ئەم لقە نەدۆزرایەوە.',
    tables_no_tables: 'هیچ مێزێک نەدۆزرایەوە. یەکەم مێزت زیاد بکە.',
    tables_status_pending: 'چاوەڕوان',
    tables_status_preparing: 'ئامادەکردن',
    tables_status_ready: 'ئامادە',
    tables_status_completed: 'تەواو',

    /* Orders */
    orders_title: 'داواکاریەکان',
    orders_subtitle: 'بینین و بەڕێوەبردنی داواکاریەکانی کڕیار',
    orders_new_order: 'داواکاری نوێ',
    orders_all_orders: 'هەموو داواکاریەکان',

    /* Sales Reports */
    sales_title: 'ڕاپۆرتی فرۆشتن',
    sales_subtitle: 'شوێنکەوتنی داهات، تێچوون، و قازانج',

    /* HR */
    hr_employees_title: 'کارمەندان',
    hr_employees_subtitle: 'بەڕێوەبردنی تیمەکەت',
    hr_add_employee: 'زیادکردنی کارمەندی نوێ',
    hr_shifts_title: 'خشتەی شیفت',
    hr_shifts_subtitle: 'بەڕێوەبردنی شیفتەکانی کارمەندان',
    hr_payroll_title: 'بەڕێوەبردنی مووچە',
    hr_payroll_subtitle: 'بەڕێوەبردنی پارەدانی کارمەندان',

    /* Categories */
    categories_title: 'بەڕێوەبەری پۆل',
    categories_subtitle: 'ڕێکخستنی خواردنەکان لە پۆلەکاندا',

    /* Add-ons */
    addons_title: 'زیادکراوەکان',
    addons_subtitle: 'بەڕێوەبردنی زیادکراوە و زیادەکانی خواردن',

    /* Meal Prep */
    meal_prep_title: 'ئامادەکردنی خواردن',
    meal_prep_subtitle: 'پلاندانان و شوێنکەوتنی ئامادەکردنی خواردن',

    /* Analytics */
    analytics_title: 'شیکاری',
    analytics_subtitle: 'وردەکاریەکانی کارایی مینیووەکەت',

    /* Billing */
    billing_title: 'ئەندامێتی',
    billing_subtitle: 'بەڕێوەبردنی پلانی بەشداری',
    billing_branches: 'لقەکان',
    billing_plan_includes: 'پلانەکەت {{count}} لق لەخۆدەگرێت. لقە زیادەکان {{price}}$/مانگ هەر یەک.',
    billing_using_branches: '{{used}} لە {{total}} لق بەکاردەهێنرێت',
    billing_extra_branches_cost: '+{{price}}$/مانگ بۆ {{count}} لقی زیادە',
    billing_no_branches: 'هێشتا لق نییە',
    billing_add_first_branch_desc: 'یەکەم لقت زیاد بکە بۆ ڕێکخستنی مێزەکان و فرۆشتن بە شوێن.',
    billing_add_first_branch: 'یەکەم لقت زیاد بکە',
    billing_tables_count: 'مێز',
    billing_orders_count: 'داواکاری',
    billing_remove_branch: 'لابردنی لق (بەشداری نوێ دەکرێتەوە)',
    billing_delete_branch: 'سڕینەوەی لق',
    billing_add_branch: 'زیادکردنی لق',
    billing_need_more_branches: 'لقە زیاترت دەوێت؟',
    billing_extra_branch_cost_desc: 'هەر لقی زیادە {{price}}$/مانگە. پەیوەندیمان پێوە بکە بۆ بەرزبونەوە.',
    billing_extra_branch_cost_desc_invoice: 'هەر لقی زیادە {{price}}$/مانگە. یەکێک زیاد بکە و لە قەستەکەتەوە دەردەکەوێت.',
    sub_active_subscription: 'بەشداری چالاک',
    sub_annual_plan: 'پلانی ساڵانە · ٥٠٠$/ساڵ',
    sub_monthly_plan: 'پلانی مانگانە · ٥٠$/مانگ',
    sub_subscription_active: 'بەشدارییەکەت چالاکە',
    sub_renews_on: 'نوێدەکرێتەوە لە {{date}}',
    sub_manage_subscription: 'بەڕێوەبردنی بەشداری',
    sub_portal_description: 'شێوازی پارەدان نوێ بکە، وتارەکان ببینە، یان هەڵوەشێنەوە — لە پۆرتاڵی ئاسوودەی Stripe.',
    sub_choose_plan: 'پلانەکەت هەڵبژێرە',
    sub_thank_you: 'سوپاس',
    sub_now_active: 'بەشدارییەکەت ئێستا چالاکە.',
    sub_checkout_canceled: 'کڕین هەڵوەشێندرایەوە.',
    sub_canceled: 'هەڵوەشێندرایەوە',
    sub_billing_not_configured: 'پارەدان تەواو ڕێکخراو نییە. STRIPE_PRICE_MONTHLY و STRIPE_PRICE_ANNUAL دابنێ.',
    sub_monthly: 'مانگانە',
    sub_per_month: '/مانگ',
    sub_cancel_anytime: 'هەر کات دەتوانیت هەڵوەشێنیتەوە. هیچ پابەندێکی درێژخایەن نییە.',
    sub_coming_soon: 'بەم زووانە',
    sub_feature_menu: 'بەڕێوەبردنی مێنیو و دروستکەری مێنیوی دیجیتاڵ',
    sub_feature_ai: 'باشترکردنی مێنیو بە AI',
    sub_feature_analytics: 'شیکاری P&L و ڕاپۆرتی فرۆشتن',
    sub_feature_tables: 'چاودێری مێز و ئامادەکردن',
    sub_feature_theme: 'تایبەتمەندی ڕووکاری چێشتخانە',
    sub_feature_pos: 'بەڕێوەبردنی POS و داواکاری',
    sub_feature_hr: 'سەرچاوەی مرۆڤ، شفتی کار و مووچە',
    sub_current_plan: 'پلانی ئێستا',
    sub_subscribe_now: 'ئێستا بەشداری بکە',
    sub_annual: 'ساڵانە',
    sub_per_year: '/ساڵ',
    sub_save_amount: '١٠٠$ واشە',
    sub_best_value: 'باشترین بەها. ١٠٠$ واشە بەراورد بە پارەدانی مانگانە.',
    sub_referral_title: 'هاوڕێکان بناسێنە، ١٠٪ داشکێنە',
    sub_referral_description: 'لینکەکەت بڵاوبکەرەوە. کاتێک ئەوان بەشداری دەکەن، تۆ ١٠٪ داشکێنە لە مانگی داهاتوو.',
    sub_referral_link: 'لینکی ئاماژەپێدانەکەت',
    sub_referral_copy: 'لینک کۆپیکردن',
    sub_referral_copied: 'کۆپی کرا',

    /* Settings */
    settings_title: 'ناسنامەی چێشتخانە',
    settings_subtitle: 'ناسنامەی تایبەتی چێشتخانەکەت — ڕەنگ، فۆنت، و هەموو ئەوەی براندەکەت دەناسێنێت.',
    settings_management_language: 'زمانی بەڕێوەبردن',
    settings_management_language_description: 'زمان بۆ ئەم داشبۆردە هەڵبژێرە.',
    settings_save_button: 'پاشەکەوتکردنی ناسنامەی چێشتخانە',
    settings_style_presets: 'شێوازی ئامادەکراو',
    settings_brand_colors: 'ڕەنگەکانی براند',
    settings_menu_background: 'پاشبنەمای مینیو',
    settings_typography: 'تایپۆگرافی',
    settings_restaurant_name: 'ناوی چێشتخانە',
    settings_carousel_style: 'شێوازی کارۆسێل',
    settings_timezone: 'ناوچەی کات',
    settings_dish_photo_bg: 'پاشبنەمای وێنەی خواردن',
    settings_ai_description_tone: 'شێوازی وەسفی AI',
    settings_restaurant_photo: 'وێنەی چێشتخانە (ئارەزوومەندانە)',
    settings_smart_designer: 'دیزاینەری زیرەک',
    settings_smart_designer_description: 'یارمەتیدەری دیزاینی بە توانای AI — پێشنیاری ڕەنگ، فۆنت، و ئامۆژگاری کارۆسێل.',

    /* Common */
    common_loading: 'چاوەڕوان بە...',
    common_save: 'پاشەکەوتکردن',
    common_cancel: 'هەڵوەشاندنەوە',
    common_error: 'هەڵە',
    common_delete: 'سڕینەوە',
    common_edit: 'دەستکاری',
    common_back: 'گەڕانەوە',
    common_actions: 'کردارەکان',
    common_name: 'ناو',
    common_description: 'وەسف',
    common_price: 'نرخ',
    common_status: 'باردۆخ',
    common_date: 'بەروار',
    common_total: 'کۆی گشتی',
    common_yes: 'بەڵێ',
    common_no: 'نەخێر',

    /* Waiter Dashboard */
    waiter_dashboard_title: 'داشبۆردی گارسۆن',
    waiter_new_order: 'داواکاری نوێ',
    waiter_order_placed: 'داواکاری تۆمارکرا',
    waiter_preparing: 'ئامادەدەکرێت',
    waiter_ready: 'ئامادەیە',
    waiter_served: 'پێشکەشکرا',
    waiter_completed: 'تەواوبوو',
}

const arFusha: TranslationStrings = {
    /* Sidebar (Admin) */
    sidebar_dashboard: 'لوحة التحكم',
    sidebar_add_menu_items: 'إضافة أصناف القائمة',
    sidebar_optimize_menu: 'تحسين مبيعات القائمة',
    sidebar_restaurant_dna: 'هوية المطعم',
    sidebar_sales_reports: 'تقارير المبيعات',
    sidebar_inventory: 'المخزون',
    sidebar_tables: 'الطاولات',
    sidebar_sales_pos: 'نقاط البيع',
    sidebar_hr: 'الموارد البشرية',
    sidebar_shifts: 'المناوبات',
    sidebar_payroll: 'الرواتب',
    sidebar_subscription: 'الاشتراك',
    sidebar_sign_out: 'تسجيل الخروج',
    sidebar_soon: 'قريباً',

    /* Sidebar (Waiter) */
    waiter_tables: 'الطاولات',
    waiter_my_orders: 'طلباتي',
    waiter_chefs: 'الطهاة',
    waiter_role_label: 'نادل',
    waiter_sign_out: 'تسجيل الخروج',

    /* Dashboard */
    dashboard_title: 'لوحة التحكم',
    dashboard_welcome: 'مرحباً بعودتك',
    dashboard_today: 'اليوم',
    dashboard_this_week: 'هذا الأسبوع',
    dashboard_this_month: 'هذا الشهر',
    dashboard_revenue: 'الإيرادات',
    dashboard_orders: 'الطلبات',
    dashboard_customers_served: 'العملاء الذين تمت خدمتهم',
    dashboard_tables_in_use: 'الطاولات المستخدمة',
    dashboard_vs_yesterday: 'مقارنة بالأمس',
    dashboard_completed_today: 'اكتملت اليوم',
    dashboard_based_on_orders: 'بناءً على الطلبات',
    dashboard_of_total: 'من أصل {0}',
    dashboard_total_orders: 'إجمالي الطلبات',
    dashboard_busiest_hour: 'ساعة الذروة',
    dashboard_orders_avg: '{0} طلبات في المتوسط',
    dashboard_total_revenue: 'إجمالي الإيرادات',
    dashboard_net_profit: 'صافي الربح',
    dashboard_net_margin: 'هامش الربح',
    dashboard_food_cost: 'نسبة تكلفة الطعام',
    dashboard_revenue_margin_trend: 'اتجاه الإيرادات والهامش',
    dashboard_daily_revenue_margin: 'الإيرادات والهامش اليومي للشهر الماضي',
    dashboard_wastage_title: 'الهدر (هذا الشهر)',
    dashboard_total_wastage_cost: 'إجمالي تكلفة الهدر',
    dashboard_waste_records: '{0} سجل(ات) هدر هذا الشهر',
    dashboard_no_wastage: 'لم يتم تسجيل أي هدر هذا الشهر',
    dashboard_view_sales_reports: 'عرض تقارير المبيعات ←',
    dashboard_projected_loss: 'خسارة متوقعة هذا الشهر',
    dashboard_projected_revenue: 'الإيرادات المتوقعة',
    dashboard_top_cost_drivers: 'أكبر عوامل التكلفة',
    dashboard_ingredient: 'المكوّن',
    dashboard_qty: 'الكمية',
    dashboard_cost: 'التكلفة',
    dashboard_reason: 'السبب',
    dashboard_top_selling: 'أكثر الأصناف مبيعاً (هذا الشهر)',
    dashboard_worst_selling: 'أقل الأصناف مبيعاً (هذا الشهر)',
    dashboard_highest_margin: 'أعلى هامش ربح',
    dashboard_lowest_margin: 'أقل هامش ربح',
    dashboard_commonly_together: 'الأصناف التي تُشترى معاً عادةً',
    dashboard_col_item: 'الصنف',
    dashboard_col_qty: 'الكمية',
    dashboard_col_profit: 'الربح',
    dashboard_col_margin: 'الهامش',
    dashboard_col_peak: 'الذروة',
    dashboard_col_revenue: 'الإيرادات',
    dashboard_col_with: 'مع',
    dashboard_col_item_combination: 'تركيبة الأصناف',
    dashboard_col_count: 'العدد',
    dashboard_col_total_margin: 'إجمالي الهامش',
    dashboard_col_peak_time: 'وقت الذروة',
    dashboard_time_morning: 'صباحاً',
    dashboard_time_afternoon: 'ظهراً',
    dashboard_time_evening: 'مساءً',
    dashboard_forecast_cogs: 'تكلفة البضاعة',
    dashboard_forecast_labor: 'العمالة',
    dashboard_forecast_operating: 'المصروفات التشغيلية',

    /* Menu Page */
    menu_title: 'القائمة',
    menu_subtitle: 'أصناف القائمة والفئات والإضافات وكيفية اقتراح الأصناف للضيوف في القائمة الرقمية.',
    menu_client_url: 'رابط قائمة العميل:',
    menu_add_item: 'إضافة صنف',
    menu_total_items: 'إجمالي الأصناف',
    menu_average_margin: 'متوسط الهامش',
    menu_categories: 'الفئات',
    menu_all_items: 'جميع الأصناف',
    menu_search_placeholder: 'البحث في الأصناف',
    menu_all_statuses: 'جميع الحالات',
    menu_draft: 'مسودة',
    menu_published: 'منشور',
    menu_costing_incomplete: 'التكلفة غير مكتملة',
    menu_search: 'بحث',
    menu_clear: 'مسح',
    menu_page_of: 'صفحة {0} من {1} ({2} صنف)',
    menu_items: 'أصناف',
    menu_previous: 'السابق',
    menu_next: 'التالي',
    menu_create_item: 'إنشاء صنف جديد',
    menu_edit_item: 'تعديل الصنف',

    /* Menu Table */
    menu_col_item_name: 'اسم الصنف',
    menu_col_category: 'الفئة',
    menu_col_availability: 'التوفر',
    menu_col_direct_cost: 'التكلفة المباشرة',
    menu_col_gross_profit: 'إجمالي الربح',
    menu_col_suggested_price: 'السعر المقترح',
    menu_col_price: 'السعر',
    menu_col_actions: 'الإجراءات',
    menu_available: 'متاح',
    menu_unavailable: 'غير متاح',
    menu_sold_out: 'نفد',
    menu_saving: 'جارٍ الحفظ...',
    menu_complete_costing: 'إكمال التكلفة',
    menu_no_items: 'لم يتم العثور على أصناف. أضف أول صنف للبدء.',
    menu_delete_title: 'حذف صنف من القائمة',
    menu_delete_confirm: 'هل أنت متأكد من إزالة {0} من قائمتك؟ لا يمكن التراجع عن هذا الإجراء.',
    menu_deleting: 'جارٍ الحذف...',
    menu_add_categories: 'إضافة فئات لقائمتك',
    menu_add_by_image: 'إضافة أصناف بالصورة',
    menu_import_digital: 'استيراد من قائمة رقمية',
    menu_chef_pick: 'اختيار الشيف',

    /* Menu Form (edit/create page) */
    menu_form_add_title: 'إضافة صنف جديد',
    menu_form_edit_title: 'تعديل الصنف',
    menu_form_add_subtitle: 'إنشاء صنف جديد مع الوصفة',
    menu_form_edit_subtitle: 'تحديث تفاصيل الصنف والوصفة',
    menu_form_back: 'رجوع',
    menu_form_tab_overview: 'نظرة عامة',
    menu_form_tab_smart_chef: 'الشيف الذكي',
    menu_form_tab_manual: 'يدوي',
    menu_form_tab_recipe: 'الوصفة',
    menu_form_tab_translations: 'الترجمات',
    menu_form_cost_analysis: 'تحليل التكلفة',
    menu_form_selling_price: 'سعر البيع:',
    menu_form_total_cost: 'إجمالي التكلفة:',
    menu_form_profit: 'الربح:',
    menu_form_margin: 'هامش الربح:',
    menu_form_save_draft: 'حفظ كمسودة',
    menu_form_publish: 'نشر في القائمة',
    menu_form_create_publish: 'إنشاء ونشر في القائمة',
    menu_form_item_details: 'تفاصيل الصنف',
    menu_form_item_name: 'اسم الصنف',
    menu_form_category: 'الفئة',
    menu_form_selling_price_iqd: 'سعر البيع (IQD)',
    menu_form_status: 'الحالة',
    menu_form_select_category: 'اختر الفئة',
    menu_form_description_helper: 'بحد أقصى 18 كلمة. اتركه فارغاً للإنشاء التلقائي عند الحفظ.',
    menu_form_generate_description: 'إنشاء الوصف',
    menu_form_image_url: 'رابط الصورة (اختياري)',
    menu_form_placeholder_name: 'مثال: برياني الدجاج',
    menu_form_placeholder_description: 'وصف موجز للطبق...',
    menu_form_margin_excellent: 'ممتاز: هذا الصنف يتمتع بهامش ربح صحي.',
    menu_form_margin_warning: 'تحذير: الهامش أقل من 20٪. يُنصح برفع السعر أو تقليل تكلفة الوصفة.',
    menu_form_nutrition_optional: 'القيمة الغذائية (اختياري)',
    menu_form_calories: 'السعرات الحرارية',
    menu_form_protein_g: 'البروتين (غ)',
    menu_form_carbs_g: 'الكربوهيدرات (غ)',
    menu_form_dietary_tags: 'وسوم الحمية (اختياري)',
    menu_form_placeholder_tags: 'مثال: نباتي، خالٍ من الغلوتين، حار',
    menu_form_comma_separated: 'وسوم مفصولة بفاصلة',
    menu_form_add_image_hint: 'أضف صورة لهذا الصنف (الصق رابطاً أو أنشئ بالذكاء الاصطناعي)',
    menu_form_configure_background: 'تكوين خلفية الصور أو رفع صورة مرجعية',
    menu_form_select_category_hint: 'اختر الفئة للمتابعة',
    menu_form_estimate_nutrition: 'تقدير القيمة الغذائية',
    menu_form_consistent_backgrounds: 'تريد خلفيات متناسقة لجميع الأطباق؟',
    menu_form_how_it_looks: 'كيف يبدو',
    menu_form_preview_description: 'معاينة هذا الصنف. استخدم التبويبات الأخرى للتعديل، أو مساعد التحرير أدناه للتحديث من نص جديد.',
    menu_form_edit_assistant: 'مساعد التحرير',
    menu_form_edit_assistant_description: 'الصق المعلومات المحدثة (مثل الوصف أو السعر الجديد) وسنقوم بتحديث النموذج. ثم راجع في التفاصيل أو الوصفة أو المزيد.',
    menu_form_edit_assistant_placeholder: 'مثال: تحديث السعر إلى 14,000 دينار عراقي.',
    menu_form_no_image: 'لا صورة',
    menu_form_uncategorized: 'غير مصنف',
    menu_form_untitled_item: 'صنف بدون عنوان',
    menu_form_no_description: 'لا وصف.',
    menu_form_add_ons_label: 'الإضافات',
    menu_form_updating: 'جاري التحديث...',
    menu_form_apply_updates: 'تطبيق التحديثات',
    menu_form_update_form_from_text: 'تحديث النموذج من النص',
    menu_form_nutrition_display: '{0} سعرة {1}غ بروتين {2}غ كربوهيدرات',
    category_drinks: 'المشروبات',
    category_main_dishes: 'الأطباق الرئيسية',
    category_sides: 'الأطباق الجانبية',
    category_grills: 'المشاوي',
    category_signature_dishes: 'أطباق التوقيع',
    category_shareables: 'للمشاركة',
    category_desserts: 'الحلويات',
    category_add_ons: 'الإضافات',
    category_kids: 'الأطفال',
    category_appetizers: 'المقبلات',
    category_beverages: 'المشروبات',

    /* Menu Translation tab */
    menu_translations_title: 'ترجمات القائمة',
    menu_translations_description: 'إنشاء ترجمات تلقائية للأسماء والأوصاف. يمكنك التعديل قبل الحفظ.',
    menu_translation_name: 'الاسم',
    menu_translation_description_label: 'الوصف',
    menu_translation_refresh: 'تحديث',
    menu_translation_edited: 'معدّل',
    menu_translation_protein: 'البروتين',
    menu_translation_carbs: 'الكربوهيدرات',

    /* Menu Optimization */
    menu_optimize_title: 'تحسين قائمتك لزيادة الأرباح والمبيعات',
    menu_optimize_subtitle: 'نقدم ثلاثة خيارات لتحسين قائمتك.',

    /* Inventory */
    inventory_title: 'إدارة المخزون',
    inventory_subtitle: 'إدارة المكونات الخاصة بك',
    inventory_add_ingredient: 'إضافة مكوّن',
    inventory_all_ingredients: 'جميع المكونات',
    inventory_cost_note: 'يتم تحديث تكلفة الوحدة تلقائياً عند تسجيل توصيل أو مصروف مرتبط بمكوّن.',
    inventory_add_new: 'إضافة مكوّن جديد',
    inventory_edit: 'تعديل المكوّن',
    inventory_deliveries: 'التوصيلات',

    /* Tables */
    tables_title: 'الطاولات',
    tables_subtitle: 'إدارة طاولات المطعم',
    tables_add_table: 'إضافة طاولة',
    tables_available: 'متاحة',
    tables_occupied: 'مشغولة',
    tables_reserved: 'محجوزة',
    tables_all_branches: 'جميع الفروع',
    tables_unassigned: 'غير معيّن',
    tables_add_branch: 'إضافة فرع',
    tables_new_branch: 'فرع جديد',
    tables_waiters: 'الطاقم',
    tables_manage_waiters: 'إدارة الموظفين',
    tables_add_waiter: 'إضافة موظف',
    tables_edit_waiter: 'تعديل',
    tables_delete_waiter: 'إزالة',
    tables_waiters_description: 'أضف الموظفين ليتمكنوا من تسجيل الدخول عبر /waiter/login وإدارة الطاولات والطلبات بقائمة مطعمك.',
    tables_no_waiters: 'لا يوجد موظفون بعد',
    tables_add_first_waiter: 'أضف أول موظف',
    tables_no_email: 'لا يوجد بريد',
    tables_active: 'نشط',
    tables_inactive: 'غير نشط',
    tables_total_tables: 'إجمالي الطاولات',
    tables_loading: 'جاري تحميل الطاولات...',
    tables_table_label: 'طاولة',
    tables_seats: 'مقاعد',
    tables_order: 'طلب',
    tables_waiter: 'موظف',
    tables_total: 'الإجمالي',
    tables_na: 'غير متاح',
    tables_no_active_orders: 'لا توجد طلبات نشطة',
    tables_no_tables_branch: 'لم تُعثر على طاولات لهذا الفرع.',
    tables_no_tables: 'لم تُعثر على طاولات. أضف أول طاولة للبدء.',
    tables_status_pending: 'قيد الانتظار',
    tables_status_preparing: 'قيد التحضير',
    tables_status_ready: 'جاهز',
    tables_status_completed: 'مكتمل',

    /* Orders */
    orders_title: 'الطلبات',
    orders_subtitle: 'عرض وإدارة طلبات العملاء',
    orders_new_order: 'طلب جديد',
    orders_all_orders: 'جميع الطلبات',

    /* Sales Reports */
    sales_title: 'تقارير المبيعات',
    sales_subtitle: 'تتبع الإيرادات والتكاليف والربحية',

    /* HR */
    hr_employees_title: 'الموظفون',
    hr_employees_subtitle: 'إدارة فريقك',
    hr_add_employee: 'إضافة موظف جديد',
    hr_shifts_title: 'جدول المناوبات',
    hr_shifts_subtitle: 'إدارة مناوبات الموظفين',
    hr_payroll_title: 'إدارة الرواتب',
    hr_payroll_subtitle: 'إدارة مدفوعات الموظفين',

    /* Categories */
    categories_title: 'مدير الفئات',
    categories_subtitle: 'تنظيم أصناف القائمة في فئات',

    /* Add-ons */
    addons_title: 'الإضافات',
    addons_subtitle: 'إدارة إضافات وملحقات الأصناف',

    /* Meal Prep */
    meal_prep_title: 'تحضير الوجبات',
    meal_prep_subtitle: 'التخطيط وتتبع تحضير الوجبات',

    /* Analytics */
    analytics_title: 'التحليلات',
    analytics_subtitle: 'رؤى تفصيلية حول أداء قائمتك',

    /* Billing */
    billing_title: 'العضوية',
    billing_subtitle: 'إدارة خطة اشتراكك',
    billing_branches: 'الفروع',
    billing_plan_includes: 'تتضمن خطتك فرعاً واحداً. كل فرع إضافي يكلف {{price}}$/شهر.',
    billing_using_branches: 'استخدام {{used}} من {{total}} فرعاً',
    billing_extra_branches_cost: '+{{price}}$/شهر لـ {{count}} فرع إضافي',
    billing_no_branches: 'لا توجد فروع بعد',
    billing_add_first_branch_desc: 'أضف فرعك الأول لتنظيم الطاولات والمبيعات حسب الموقع.',
    billing_add_first_branch: 'أضف فرعك الأول',
    billing_tables_count: 'طاولات',
    billing_orders_count: 'طلبات',
    billing_remove_branch: 'إزالة الفرع (سيتم تحديث الاشتراك)',
    billing_delete_branch: 'حذف الفرع',
    billing_add_branch: 'إضافة فرع',
    billing_need_more_branches: 'تحتاج فروعاً أكثر؟',
    billing_extra_branch_cost_desc: 'كل فرع إضافي يكلف {{price}}$/شهر. تواصل معنا للترقية.',
    billing_extra_branch_cost_desc_invoice: 'كل فرع إضافي يكلف {{price}}$/شهر. أضف واحداً أدناه وسيظهر في فاتورتك القادمة.',
    sub_active_subscription: 'اشتراك نشط',
    sub_annual_plan: 'الخطة السنوية · 500$/سنة',
    sub_monthly_plan: 'الخطة الشهرية · 50$/شهر',
    sub_subscription_active: 'اشتراكك نشط',
    sub_renews_on: 'يتجدد في {{date}}',
    sub_manage_subscription: 'إدارة الاشتراك',
    sub_portal_description: 'تحديث طريقة الدفع، عرض الفواتير، أو الإلغاء — في بوابة Stripe الآمنة.',
    sub_choose_plan: 'اختر خطتك',
    sub_thank_you: 'شكراً',
    sub_now_active: 'اشتراكك نشط الآن.',
    sub_checkout_canceled: 'تم إلغاء الدفع.',
    sub_canceled: 'ملغى',
    sub_billing_not_configured: 'الفواتير غير مكوّنة بالكامل. ضع STRIPE_PRICE_MONTHLY و STRIPE_PRICE_ANNUAL.',
    sub_monthly: 'شهري',
    sub_per_month: '/شهر',
    sub_cancel_anytime: 'يمكنك الإلغاء في أي وقت. بدون التزام طويل الأمد.',
    sub_coming_soon: 'قريباً',
    sub_feature_menu: 'إدارة القائمة وبناء القائمة الرقمية',
    sub_feature_ai: 'تحسين القائمة بالذكاء الاصطناعي',
    sub_feature_analytics: 'تحليلات الربح والخسارة وتقارير المبيعات',
    sub_feature_tables: 'تتبع الطاولات والمخزون',
    sub_feature_theme: 'تخصيص مظهر المطعم',
    sub_feature_pos: 'إدارة نقاط البيع والطلبات',
    sub_feature_hr: 'الموارد البشرية والورديات والرواتب',
    sub_current_plan: 'الخطة الحالية',
    sub_subscribe_now: 'اشترك الآن',
    sub_annual: 'سنوي',
    sub_per_year: '/سنة',
    sub_save_amount: 'وفر 100$',
    sub_best_value: 'أفضل قيمة. وفر 100$ مقارنة بالدفع الشهري.',
    sub_referral_title: 'أَحِرْ أصدقاءً واحصل على ١٠٪ خصم',
    sub_referral_description: 'شارك رابطك. عندما يشتركوا، تحصل على ١٠٪ خصم على الشهر القادم.',
    sub_referral_link: 'رابط الإحالة الخاص بك',
    sub_referral_copy: 'نسخ الرابط',
    sub_referral_copied: 'تم النسخ',

    /* Settings */
    settings_title: 'هوية المطعم',
    settings_subtitle: 'هوية مطعمك الفريدة — الألوان والخطوط وكل ما يميز علامتك التجارية.',
    settings_management_language: 'لغة الإدارة',
    settings_management_language_description: 'اختر لغة لوحة التحكم.',
    settings_save_button: 'حفظ هوية المطعم',
    settings_style_presets: 'أنماط جاهزة',
    settings_brand_colors: 'ألوان العلامة التجارية',
    settings_menu_background: 'خلفية القائمة',
    settings_typography: 'الخطوط',
    settings_restaurant_name: 'اسم المطعم',
    settings_carousel_style: 'نمط العرض الدوّار',
    settings_timezone: 'المنطقة الزمنية',
    settings_dish_photo_bg: 'خلفية صور الأطباق',
    settings_ai_description_tone: 'أسلوب الوصف بالذكاء الاصطناعي',
    settings_restaurant_photo: 'صورة المطعم (اختياري)',
    settings_smart_designer: 'المصمم الذكي',
    settings_smart_designer_description: 'مساعد تصميم يعمل بالذكاء الاصطناعي — توصيات الألوان والخطوط ونصائح العرض.',

    /* Common */
    common_loading: 'جارٍ التحميل...',
    common_save: 'حفظ',
    common_cancel: 'إلغاء',
    common_error: 'خطأ',
    common_delete: 'حذف',
    common_edit: 'تعديل',
    common_back: 'رجوع',
    common_actions: 'الإجراءات',
    common_name: 'الاسم',
    common_description: 'الوصف',
    common_price: 'السعر',
    common_status: 'الحالة',
    common_date: 'التاريخ',
    common_total: 'المجموع',
    common_yes: 'نعم',
    common_no: 'لا',

    /* Waiter Dashboard */
    waiter_dashboard_title: 'لوحة تحكم النادل',
    waiter_new_order: 'طلب جديد',
    waiter_order_placed: 'تم تسجيل الطلب',
    waiter_preparing: 'قيد التحضير',
    waiter_ready: 'جاهز',
    waiter_served: 'تم التقديم',
    waiter_completed: 'مكتمل',
}

export const translations: Record<ManagementLocale, TranslationStrings> = {
    en,
    ku,
    'ar-fusha': arFusha,
}

export function getTranslations(locale: string): TranslationStrings {
    if (locale === 'ku') return translations.ku
    if (locale === 'ar-fusha' || locale === 'ar_fusha') return translations['ar-fusha']
    return translations.en
}

/**
 * Given the current management language, return which languages the
 * menu translation tab should show.
 *
 * Rules:
 *   - English backend  → translate to Arabic (ar_fusha) + Kurdish (ku)
 *   - Arabic backend   → translate to English (en) + Kurdish (ku)
 *   - Kurdish backend  → translate to English (en) + Arabic (ar_fusha)
 */
/** Maps English category names (case-insensitive) to translation keys */
const CATEGORY_NAME_TO_KEY: Record<string, keyof TranslationStrings> = {
  drinks: 'category_drinks',
  'main dishes': 'category_main_dishes',
  sides: 'category_sides',
  grills: 'category_grills',
  'signature dishes': 'category_signature_dishes',
  shareables: 'category_shareables',
  desserts: 'category_desserts',
  'add-ons': 'category_add_ons',
  'add ons': 'category_add_ons',
  kids: 'category_kids',
  appetizers: 'category_appetizers',
  beverages: 'category_beverages',
  'main course': 'category_main_dishes',
  'main course dishes': 'category_main_dishes',
}

export function getTranslatedCategoryName(
  categoryName: string,
  t: TranslationStrings
): string {
  if (!categoryName || typeof categoryName !== 'string') return categoryName || ''
  const key = CATEGORY_NAME_TO_KEY[categoryName.trim().toLowerCase()]
  return key ? (t[key] as string) : categoryName
}

export function getMenuTranslationLanguages(managementLanguage: string): {
    code: string
    label: string
}[] {
    if (managementLanguage === 'ku') {
        return [
            { code: 'en', label: 'English' },
            { code: 'ar_fusha', label: 'Arabic (العربية الفصحى)' },
        ]
    }
    if (managementLanguage === 'ar-fusha' || managementLanguage === 'ar_fusha') {
        return [
            { code: 'en', label: 'English' },
            { code: 'ku', label: 'Sorani Kurdish (کوردی سۆرانی)' },
        ]
    }
    // English or default
    return [
        { code: 'ar_fusha', label: 'Arabic (العربية الفصحى)' },
        { code: 'ku', label: 'Sorani Kurdish (کوردی سۆرانی)' },
    ]
}
