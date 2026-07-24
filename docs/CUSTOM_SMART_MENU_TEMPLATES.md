# Custom Smart Menu templates

Custom templates control the public menu presentation while iServe owns menu data,
category filtering, featured items, the cart, and checkout.

## Required HTML markers

```html
<h1 data-iserve="restaurant-name"></h1>
<nav data-iserve="category-nav"></nav>
<section data-iserve="featured-slider"></section>
<section data-iserve="menu-items"></section>
<aside data-iserve="cart"></aside>
```

The runtime generates elements with these CSS classes:

- `.iserve-category` and `.iserve-category.is-active`
- `.iserve-section-title` and `.iserve-featured-rail`
- `.iserve-items`, `.iserve-item`, and `.iserve-featured-item`
- `.iserve-item-name`, `.iserve-description`, and `.iserve-price`
- `.iserve-add`, `.iserve-cart-summary`, and `.iserve-checkout`

## Security contract

- Maximum file size: 200 KB.
- Script tags and inline event handlers are rejected.
- Forms, iframes, embedded objects, `javascript:` URLs, and CSS `@import` are rejected.
- The published template runs in a sandboxed iframe without same-origin access.
- Order item IDs are checked against the restaurant's available menu items by the API.
