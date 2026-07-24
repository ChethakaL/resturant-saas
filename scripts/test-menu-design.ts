import assert from 'node:assert/strict'
import {
  DEFAULT_MENU_DESIGN,
  menuDesignConfigSchema,
  validateCustomMenuHtml,
} from '../src/lib/menu-design'

const validTemplate = `
  <h1 data-iserve="restaurant-name"></h1>
  <nav data-iserve="category-nav"></nav>
  <section data-iserve="featured-slider"></section>
  <section data-iserve="menu-items"></section>
  <aside data-iserve="cart"></aside>
`

assert.deepEqual(menuDesignConfigSchema.parse({}), DEFAULT_MENU_DESIGN)
assert.equal(validateCustomMenuHtml(validTemplate).valid, true)

const missingCart = validateCustomMenuHtml(validTemplate.replace('data-iserve="cart"', ''))
assert.equal(missingCart.valid, false)
if (!missingCart.valid) {
  assert(missingCart.errors.some((error) => error.includes('data-iserve="cart"')))
}

for (const unsafe of [
  `${validTemplate}<script>alert(1)</script>`,
  `${validTemplate}<img src=x onerror="alert(1)">`,
  `${validTemplate}<iframe src="https://example.com"></iframe>`,
  `${validTemplate}<a href="javascript:alert(1)">x</a>`,
  `${validTemplate}<style>@import "https://example.com/x.css";</style>`,
]) {
  assert.equal(validateCustomMenuHtml(unsafe).valid, false)
}

assert.equal(
  menuDesignConfigSchema.safeParse({ ...DEFAULT_MENU_DESIGN, accentColor: 'red' }).success,
  false,
)

console.log('Menu design validation tests passed.')
