'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type MenuItem = {
  id: string
  name: string
  description?: string | null
  price: number
  imageUrl?: string | null
  calories?: number | null
  category?: { id: string; name: string | null } | null
}

type Props = {
  restaurantId: string
  restaurantName: string
  restaurantLogo?: string | null
  menuItems: MenuItem[]
  showcases?: Array<{ title: string; items: MenuItem[] }>
  customHtml: string
  tableNumber?: string
}

const RUNTIME = String.raw`
(() => {
  const payload = window.__ISERVE_MENU__;
  const state = { category: 'all', cart: {} };
  const money = (value) => new Intl.NumberFormat('en-US').format(value) + ' IQD';
  const target = (name) => document.querySelector('[data-iserve="' + name + '"]');
  const safe = (value) => String(value == null ? '' : value);

  const restaurantName = target('restaurant-name');
  if (restaurantName) restaurantName.textContent = payload.restaurant.name;

  function categories() {
    const unique = [];
    payload.items.forEach((item) => {
      if (item.category && !unique.some((category) => category.id === item.category.id)) {
        unique.push(item.category);
      }
    });
    return unique;
  }

  function inspectTemplate(root) {
    if (!root) return null;
    const sample = root.querySelector('article, .card, .food-card, .featured-card, [class*="card"], [class*="item"]') || root.firstElementChild;
    if (!sample) return null;

    const imgEl = sample.querySelector('img, [class*="image"], [class*="img"]');
    const titleEl = sample.querySelector('h1, h2, h3, h4, [class*="name"], [class*="title"]');
    const descEl = sample.querySelector('p, [class*="desc"], [class*="description"]');
    const priceEl = sample.querySelector('[class*="price"]');
    const btnEl = sample.querySelector('button, a, [class*="button"], [class*="btn"]');

    return {
      cardClass: sample.className || '',
      imgClass: imgEl ? imgEl.className || '' : '',
      titleClass: titleEl ? titleEl.className || '' : '',
      descClass: descEl ? descEl.className || '' : '',
      priceClass: priceEl ? priceEl.className || '' : '',
      btnClass: btnEl ? btnEl.className || '' : '',
      btnText: btnEl ? btnEl.textContent.trim() : 'Add to order',
      hasFoodContent: Boolean(sample.querySelector('.food-content')),
      hasFoodTopline: Boolean(sample.querySelector('.food-topline')),
      hasFeaturedContent: Boolean(sample.querySelector('.featured-content')),
      hasFeaturedFooter: Boolean(sample.querySelector('.featured-footer')),
      hasCardFooter: Boolean(sample.querySelector('.card-footer'))
    };
  }

  const catNavRoot = target('category-nav');
  const catSample = catNavRoot ? catNavRoot.querySelector('a, button, [class*="category"]') : null;
  const catSampleClass = catSample ? catSample.className : '';
  const catSampleTag = catSample ? catSample.tagName.toLowerCase() : 'button';

  const featuredRoot = target('featured-slider');
  const featuredTpl = inspectTemplate(featuredRoot);

  const itemsRoot = target('menu-items');
  const itemsTpl = inspectTemplate(itemsRoot);

  function renderCategories() {
    const root = target('category-nav');
    if (!root) return;
    const options = [{ id: 'all', name: 'All' }].concat(categories());
    root.innerHTML = '';
    options.forEach((category) => {
      const el = document.createElement(catSampleTag === 'a' ? 'a' : 'button');
      if (catSampleTag === 'a') el.href = '#';
      else el.type = 'button';

      const baseClass = catSampleClass || 'category-link';
      el.className = baseClass + ' iserve-category' + (state.category === category.id ? ' is-active' : '');
      el.textContent = safe(category.name);
      el.addEventListener('click', (e) => {
        e.preventDefault();
        state.category = category.id;
        renderCategories();
        renderItems();
      });
      root.appendChild(el);
    });
  }

  function createSmartItemCard(item, featured, tpl) {
    const article = document.createElement('article');
    const baseCardClass = featured
      ? (tpl?.cardClass || 'featured-card') + ' iserve-item iserve-featured-item'
      : (tpl?.cardClass || 'food-card') + ' iserve-item';
    article.className = baseCardClass;

    const imgContainer = document.createElement('div');
    imgContainer.className = tpl?.imgClass || (featured ? 'featured-image' : 'food-image');
    if (item.imageUrl) {
      const img = document.createElement('img');
      img.src = item.imageUrl;
      img.alt = item.name;
      img.loading = 'lazy';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      img.onerror = () => {
        img.remove();
      };
      imgContainer.appendChild(img);
    }
    article.appendChild(imgContainer);

    const content = document.createElement('div');
    content.className = featured
      ? (tpl?.hasFeaturedContent ? 'featured-content' : 'food-content')
      : (tpl?.hasFoodContent ? 'food-content' : 'food-content');

    const title = document.createElement('h3');
    if (tpl?.titleClass) title.className = tpl.titleClass + ' iserve-item-name';
    else title.className = 'iserve-item-name';
    title.textContent = item.name;

    if (!featured && tpl?.hasFoodTopline) {
      const topline = document.createElement('div');
      topline.className = 'food-topline';
      topline.appendChild(title);
      content.appendChild(topline);
    } else {
      content.appendChild(title);
    }

    if (item.description) {
      const desc = document.createElement('p');
      if (tpl?.descClass) desc.className = tpl.descClass + ' iserve-description';
      else desc.className = 'iserve-description';
      desc.textContent = item.description;
      content.appendChild(desc);
    }

    const footer = document.createElement('div');
    footer.className = featured
      ? (tpl?.hasFeaturedFooter ? 'featured-footer' : 'card-footer')
      : (tpl?.hasCardFooter ? 'card-footer' : 'card-footer');

    const price = document.createElement('span');
    price.className = (tpl?.priceClass || 'price') + ' iserve-price';
    price.textContent = money(item.price);
    footer.appendChild(price);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = (tpl?.btnClass || 'button') + ' iserve-add';
    btn.textContent = tpl?.btnText || 'Add to order';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.cart[item.id] = (state.cart[item.id] || 0) + 1;
      renderCart();
    });
    footer.appendChild(btn);

    content.appendChild(footer);
    article.appendChild(content);
    return article;
  }

  function renderFeatured() {
    const root = target('featured-slider');
    if (!root) return;
    const featured = payload.featured.length ? payload.featured : payload.items.slice(0, 3);
    root.innerHTML = '';
    featured.forEach((item) => root.appendChild(createSmartItemCard(item, true, featuredTpl)));
  }

  function renderItems() {
    const root = target('menu-items');
    if (!root) return;
    root.innerHTML = '';
    payload.items
      .filter((item) => state.category === 'all' || item.category?.id === state.category)
      .forEach((item) => root.appendChild(createSmartItemCard(item, false, itemsTpl)));
  }

  function renderCart() {
    const root = target('cart');
    if (!root) return;
    root.innerHTML = '';
    const lines = Object.entries(state.cart)
      .filter(([, quantity]) => quantity > 0)
      .map(([id, quantity]) => ({ item: payload.items.find((item) => item.id === id), quantity }))
      .filter((line) => line.item);
    const count = lines.reduce((sum, line) => sum + line.quantity, 0);
    const total = lines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
    const summary = document.createElement('span');
    summary.className = 'iserve-cart-summary';
    summary.textContent = count ? count + ' item' + (count === 1 ? '' : 's') + ' · ' + money(total) : 'Your order is empty';
    root.appendChild(summary);
    if (!count) return;
    const checkout = document.createElement('button');
    checkout.type = 'button';
    checkout.className = 'button checkout-button iserve-checkout';
    checkout.textContent = payload.tableNumber ? 'Send order' : 'Scan your table QR to order';
    checkout.disabled = !payload.tableNumber;
    checkout.addEventListener('click', () => {
      checkout.disabled = true;
      checkout.textContent = 'Sending…';
      window.parent.postMessage({
        type: 'iserve:place-order',
        items: lines.map((line) => ({ menuItemId: line.item.id, quantity: line.quantity })),
      }, '*');
    });
    root.appendChild(checkout);
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'iserve:order-result') {
      const checkout = document.querySelector('.iserve-checkout');
      if (event.data.ok) {
        state.cart = {};
        renderCart();
        window.alert('Order ' + safe(event.data.orderNumber) + ' sent successfully.');
      } else if (checkout) {
        checkout.disabled = false;
        checkout.textContent = 'Send order';
        window.alert(event.data.error || 'Could not send order.');
      }
    }
  });

  renderCategories();
  renderFeatured();
  renderItems();
  renderCart();

  const reportHeight = () => window.parent.postMessage({
    type: 'iserve:resize',
    height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
  }, '*');
  new ResizeObserver(reportHeight).observe(document.body);
  reportHeight();
})();
`

export default function CustomTemplateMenu({
  restaurantId,
  restaurantName,
  restaurantLogo,
  menuItems,
  showcases,
  customHtml,
  tableNumber,
}: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [frameHeight, setFrameHeight] = useState(900)

  const payload = useMemo(() => ({
    restaurant: { id: restaurantId, name: restaurantName, logo: restaurantLogo || null },
    items: menuItems,
    featured: showcases?.[0]?.items || [],
    featuredTitle: showcases?.[0]?.title || 'Featured',
    tableNumber: tableNumber || null,
  }), [menuItems, restaurantId, restaurantLogo, restaurantName, showcases, tableNumber])

  const srcDoc = useMemo(() => {
    const data = JSON.stringify(payload).replace(/</g, '\\u003c')
    return `${customHtml}
      <script>window.__ISERVE_MENU__=${data};</script>
      <script>${RUNTIME}</script>`
  }, [customHtml, payload])

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return
      if (event.data?.type === 'iserve:resize' && Number.isFinite(event.data.height)) {
        setFrameHeight(Math.max(600, Math.min(5000, event.data.height)))
        return
      }
      if (event.data?.type !== 'iserve:place-order') return

      try {
        const response = await fetch('/api/public/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurantId,
            tableNumber,
            items: event.data.items,
          }),
        })
        const result = await response.json()
        frameRef.current?.contentWindow?.postMessage({
          type: 'iserve:order-result',
          ok: response.ok,
          orderNumber: result.orderNumber,
          error: result.error,
        }, '*')
      } catch {
        frameRef.current?.contentWindow?.postMessage({
          type: 'iserve:order-result',
          ok: false,
          error: 'Could not connect to the ordering service.',
        }, '*')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [restaurantId, tableNumber])

  return (
    <iframe
      ref={frameRef}
      title={`${restaurantName} menu`}
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      className="block min-h-screen w-full border-0 bg-white"
      style={{ height: frameHeight }}
    />
  )
}
