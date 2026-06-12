const state = {
  restaurants: [],
  filtered: [],
  reviews: {},
  markers: new Map(),
  originMarkers: new Map(),
  selectedCountry: null,
  localMap: null,
  worldMap: null,
};

const reviewKey = 'tolworth-food-map-reviews-v2';

const els = {
  restaurantCount: document.querySelector('#restaurantCount'),
  originCount: document.querySelector('#originCount'),
  reviewCount: document.querySelector('#reviewCount'),
  searchInput: document.querySelector('#searchInput'),
  cuisineFilter: document.querySelector('#cuisineFilter'),
  resetFilters: document.querySelector('#resetFilters'),
  restaurantList: document.querySelector('#restaurantList'),
  originList: document.querySelector('#originList'),
  blogGrid: document.querySelector('#blogGrid'),
  reviewSort: document.querySelector('#reviewSort'),
  dialog: document.querySelector('#restaurantDialog'),
  dialogContent: document.querySelector('#dialogContent'),
  closeDialog: document.querySelector('#closeDialog'),
  reviewFormTemplate: document.querySelector('#reviewFormTemplate'),
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char]);
}

function getStoredReviews() {
  try {
    return JSON.parse(localStorage.getItem(reviewKey)) || {};
  } catch {
    return {};
  }
}

function saveStoredReviews() {
  localStorage.setItem(reviewKey, JSON.stringify(state.reviews));
  renderAll();
}

function reviewsFor(id) {
  return state.reviews[id] || [];
}

function averageRating(restaurant) {
  const reviews = reviewsFor(restaurant.id);
  if (!reviews.length) return restaurant.rating;
  const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
  return Math.round((total / reviews.length) * 10) / 10;
}

function latestReviewDate(restaurant) {
  const dates = reviewsFor(restaurant.id).map((review) => review.createdAt).filter(Boolean);
  return dates.length ? Math.max(...dates.map((date) => new Date(date).getTime())) : 0;
}

function originStats() {
  const stats = new Map();
  for (const restaurant of state.restaurants) {
    for (const country of restaurant.originCountries) {
      if (!stats.has(country.code)) stats.set(country.code, { ...country, restaurants: [] });
      stats.get(country.code).restaurants.push(restaurant);
    }
  }
  return [...stats.values()].sort((a, b) => b.restaurants.length - a.restaurants.length || a.name.localeCompare(b.name));
}

function setupCuisineFilter() {
  const cuisines = [...new Set(state.restaurants.map((restaurant) => restaurant.cuisineType))].sort();
  els.cuisineFilter.insertAdjacentHTML('beforeend', cuisines.map((cuisine) => (
    `<option value="${escapeHtml(cuisine)}">${escapeHtml(cuisine)}</option>`
  )).join(''));
}

function cuisineSymbol(cuisine) {
  const symbols = {
    'Bakery / Cakes': 'CK',
    'Burgers / Pizza': 'BP',
    'Café': 'CF',
    'Café / British Breakfast': 'BR',
    'Fish & Chips': 'FC',
    'Fried Chicken': 'CH',
    'Hot Dogs': 'HD',
    'Italian Café / Deli': 'IT',
    'Kebab / Fast Food': 'KB',
    'Mediterranean': 'ME',
    'Peri-Peri Chicken': 'PP',
    'Persian': 'IR',
    'Sandwiches': 'SW',
    'South Indian Vegetarian': 'IN',
    'Tacos': 'MX',
    'Tamil-Mexican Fusion': 'FU',
  };
  return symbols[cuisine] || cuisine.slice(0, 2).toUpperCase();
}

function cuisineColor(cuisine) {
  const colors = {
    'Bakery / Cakes': '#9c4f71',
    'Burgers / Pizza': '#b75b37',
    'Café': '#6b5b3f',
    'Café / British Breakfast': '#476f78',
    'Fish & Chips': '#2f6384',
    'Fried Chicken': '#b94e45',
    'Hot Dogs': '#8d5e00',
    'Italian Café / Deli': '#4f7f52',
    'Kebab / Fast Food': '#8a5a2e',
    'Mediterranean': '#4c6f9b',
    'Peri-Peri Chicken': '#c04a2b',
    'Persian': '#6d4f8f',
    'Sandwiches': '#5d7b45',
    'South Indian Vegetarian': '#2f746b',
    'Tacos': '#bd7c24',
    'Tamil-Mexican Fusion': '#2f746b',
  };
  return colors[cuisine] || '#2f746b';
}

function restaurantIcon(restaurant, visible = true) {
  const color = visible ? cuisineColor(restaurant.cuisineType) : '#8d908a';
  const className = visible ? 'restaurant-map-marker' : 'restaurant-map-marker is-muted';
  return L.divIcon({
    className,
    iconSize: [38, 46],
    iconAnchor: [19, 44],
    popupAnchor: [0, -42],
    html: `
      <span class="marker-pin" style="--marker-color: ${color}">
        <span>${escapeHtml(cuisineSymbol(restaurant.cuisineType))}</span>
      </span>
    `,
  });
}

function setupMaps() {
  state.localMap = L.map('localMap', { scrollWheelZoom: false }).setView([51.38095, -0.28285], 17);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(state.localMap);

  const bounds = [];
  for (const restaurant of state.restaurants) {
    const marker = L.marker([restaurant.lat, restaurant.lng], {
      icon: restaurantIcon(restaurant),
      keyboard: true,
      title: restaurant.name,
    }).addTo(state.localMap);
    marker.bindPopup(popupHtml(restaurant));
    marker.on('click', () => marker.openPopup());
    marker.on('popupopen', () => {
      const button = document.querySelector(`[data-popup-open="${restaurant.id}"]`);
      if (button) button.addEventListener('click', () => openRestaurant(restaurant.id));
    });
    state.markers.set(restaurant.id, marker);
    bounds.push([restaurant.lat, restaurant.lng]);
  }
  state.localMap.fitBounds(bounds, { padding: [28, 28] });
  setTimeout(() => {
    state.localMap.invalidateSize();
    state.localMap.fitBounds(bounds, { padding: [28, 28] });
  }, 250);

  state.worldMap = L.map('worldMap', { scrollWheelZoom: false, worldCopyJump: true }).setView([25, 10], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 6,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(state.worldMap);

  for (const country of originStats()) {
    const marker = L.circleMarker([country.lat, country.lng], {
      radius: 10 + country.restaurants.length * 3,
      color: '#ffffff',
      weight: 2,
      fillColor: '#b94e45',
      fillOpacity: 0.86,
    }).addTo(state.worldMap);
    marker.bindPopup(`
      <div class="popup-card">
        <h3>${escapeHtml(country.name)}</h3>
        <p>${country.restaurants.length} restaurant${country.restaurants.length === 1 ? '' : 's'}</p>
        <button type="button" data-country-open="${country.code}">Show restaurants</button>
      </div>
    `);
    marker.on('popupopen', () => {
      const button = document.querySelector(`[data-country-open="${country.code}"]`);
      if (button) button.addEventListener('click', () => selectCountry(country.code));
    });
    state.originMarkers.set(country.code, marker);
  }
  setTimeout(() => state.worldMap.invalidateSize(), 250);
}

function popupHtml(restaurant) {
  return `
    <div class="popup-card">
      <h3>${escapeHtml(restaurant.name)}</h3>
      <p>${escapeHtml(restaurant.cuisineType)}</p>
      <p>${escapeHtml(restaurant.address)}</p>
      <button type="button" data-popup-open="${restaurant.id}">Open review</button>
    </div>
  `;
}

function applyFilters() {
  const query = els.searchInput.value.trim().toLowerCase();
  const cuisine = els.cuisineFilter.value;
  state.filtered = state.restaurants.filter((restaurant) => {
    const haystack = [
      restaurant.name,
      restaurant.address,
      restaurant.cuisineType,
      restaurant.cuisineOrigin,
      ...restaurant.originCountries.map((country) => country.name),
    ].join(' ').toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    const matchesCuisine = cuisine === 'all' || restaurant.cuisineType === cuisine;
    const matchesCountry = !state.selectedCountry || restaurant.originCountries.some((country) => country.code === state.selectedCountry);
    return matchesQuery && matchesCuisine && matchesCountry;
  });
  renderDirectory();
  updateMarkerStyles();
}

function updateMarkerStyles() {
  const active = new Set(state.filtered.map((restaurant) => restaurant.id));
  for (const restaurant of state.restaurants) {
    const marker = state.markers.get(restaurant.id);
    if (!marker) continue;
    const visible = active.has(restaurant.id);
    marker.setIcon(restaurantIcon(restaurant, visible));
    marker.setOpacity(visible ? 1 : 0.32);
    marker.setZIndexOffset(visible ? 400 : 0);
  }
}

function renderDirectory() {
  els.restaurantList.innerHTML = state.filtered.map((restaurant) => `
    <article class="restaurant-card">
      <div class="card-topline">
        <span class="chip">${escapeHtml(restaurant.price)}</span>
        <span class="rating">${averageRating(restaurant).toFixed(1)} ★</span>
      </div>
      <div>
        <h3>${escapeHtml(restaurant.name)}</h3>
        <p>${escapeHtml(restaurant.cuisineType)}</p>
      </div>
      <p>${escapeHtml(restaurant.address)}</p>
      <div class="blog-meta">
        ${restaurant.originCountries.map((country) => `<span class="origin-chip">${escapeHtml(country.name)}</span>`).join('')}
      </div>
      <div class="card-actions">
        <button class="primary-button" type="button" data-open="${restaurant.id}">Review</button>
        <button class="ghost-button" type="button" data-map="${restaurant.id}">Map</button>
      </div>
    </article>
  `).join('');

  els.restaurantList.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => openRestaurant(button.dataset.open));
  });
  els.restaurantList.querySelectorAll('[data-map]').forEach((button) => {
    button.addEventListener('click', () => {
      const restaurant = byId(button.dataset.map);
      state.localMap.setView([restaurant.lat, restaurant.lng], 19);
      state.markers.get(restaurant.id).openPopup();
      document.querySelector('#tolworth').scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function renderOrigins() {
  const stats = originStats();
  els.originCount.textContent = String(stats.length);
  els.originList.innerHTML = stats.map((country) => `
    <div class="country-row">
      <span>${escapeHtml(country.name)}</span>
      <button type="button" data-country="${country.code}">${country.restaurants.length} places</button>
    </div>
  `).join('');
  els.originList.querySelectorAll('[data-country]').forEach((button) => {
    button.addEventListener('click', () => selectCountry(button.dataset.country));
  });
}

function selectCountry(code) {
  state.selectedCountry = state.selectedCountry === code ? null : code;
  if (state.selectedCountry) {
    const marker = state.originMarkers.get(code);
    if (marker) {
      state.worldMap.setView(marker.getLatLng(), 4);
      marker.openPopup();
    }
  }
  applyFilters();
  document.querySelector('#tolworth').scrollIntoView({ behavior: 'smooth' });
}

function renderBlog() {
  const sorted = [...state.restaurants].sort((a, b) => {
    if (els.reviewSort.value === 'rating') return averageRating(b) - averageRating(a);
    if (els.reviewSort.value === 'newest') return latestReviewDate(b) - latestReviewDate(a);
    return a.name.localeCompare(b.name);
  });
  els.blogGrid.innerHTML = sorted.map((restaurant) => {
    const userReviews = reviewsFor(restaurant.id);
    const latest = userReviews.at(-1);
    const excerpt = latest?.body || restaurant.starterReview;
    return `
      <article class="blog-card">
        <img src="${escapeHtml(restaurant.heroImage)}" alt="${escapeHtml(restaurant.recommendedDish)} at ${escapeHtml(restaurant.name)}">
        <div class="blog-card-body">
          <div class="blog-meta">
            <span class="chip">${escapeHtml(restaurant.cuisineType)}</span>
            <span class="rating">${averageRating(restaurant).toFixed(1)} ★</span>
          </div>
          <h3>${escapeHtml(restaurant.name)}</h3>
          <p>${escapeHtml(excerpt)}</p>
          <button class="primary-button" type="button" data-open="${restaurant.id}">Read and add review</button>
        </div>
      </article>
    `;
  }).join('');
  els.blogGrid.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => openRestaurant(button.dataset.open));
  });
}

function renderCounters() {
  els.restaurantCount.textContent = String(state.restaurants.length);
  const count = Object.values(state.reviews).reduce((sum, reviews) => sum + reviews.length, 0);
  els.reviewCount.textContent = String(count);
}

function byId(id) {
  return state.restaurants.find((restaurant) => restaurant.id === id);
}

function openRestaurant(id) {
  const restaurant = byId(id);
  if (!restaurant) return;
  els.dialogContent.innerHTML = restaurantDetailHtml(restaurant);
  wireReviewForm(restaurant);
  els.dialog.showModal();
}

function restaurantDetailHtml(restaurant) {
  const userReviews = reviewsFor(restaurant.id);
  const reviewItems = [
    {
      author: 'Starter note',
      rating: restaurant.rating,
      date: restaurant.visitedDate,
      dish: restaurant.recommendedDish,
      body: restaurant.starterReview,
      photo: restaurant.heroImage,
    },
    ...userReviews,
  ];
  return `
    <img class="dialog-hero" src="${escapeHtml(restaurant.heroImage)}" alt="${escapeHtml(restaurant.recommendedDish)} at ${escapeHtml(restaurant.name)}">
    <div class="dialog-body">
      <header class="dialog-header">
        <div class="blog-meta">
          <span class="chip">${escapeHtml(restaurant.cuisineType)}</span>
          <span class="rating">${averageRating(restaurant).toFixed(1)} ★</span>
          <span class="chip">${escapeHtml(restaurant.price)}</span>
        </div>
        <h2>${escapeHtml(restaurant.name)}</h2>
        <p>${escapeHtml(restaurant.summary)}</p>
      </header>
      <div class="detail-grid">
        <section class="review-stack">
          <h3>Reviews</h3>
          ${reviewItems.map((review) => `
            <article class="review-item">
              <div class="rating-row">
                <strong>${escapeHtml(review.author || 'Anonymous')}</strong>
                <span class="rating">${Number(review.rating).toFixed(1)} ★</span>
              </div>
              <p>${escapeHtml(review.date || review.createdAt?.slice(0, 10) || 'Date to add')}</p>
              ${review.dish ? `<p><strong>Order:</strong> ${escapeHtml(review.dish)}</p>` : ''}
              <p>${escapeHtml(review.body)}</p>
              ${review.photo ? `<img src="${escapeHtml(review.photo)}" alt="Review photo for ${escapeHtml(restaurant.name)}">` : ''}
            </article>
          `).join('')}
        </section>
        <aside>
          <section class="review-stack">
            <h3>Details</h3>
            <p><strong>Address:</strong> ${escapeHtml(restaurant.address)}</p>
            <p><strong>Origin:</strong> ${escapeHtml(restaurant.cuisineOrigin)}</p>
            <p><strong>Pin:</strong> ${escapeHtml(restaurant.coordinateStatus)}</p>
            <div class="blog-meta">
              ${restaurant.originCountries.map((country) => `<span class="origin-chip">${escapeHtml(country.name)}</span>`).join('')}
            </div>
          </section>
          <section class="review-stack">
            <h3>Add a review</h3>
            <div id="reviewFormMount"></div>
          </section>
        </aside>
      </div>
    </div>
  `;
}

function wireReviewForm(restaurant) {
  const mount = els.dialogContent.querySelector('#reviewFormMount');
  const form = els.reviewFormTemplate.content.firstElementChild.cloneNode(true);
  const range = form.elements.rating;
  const output = form.elements.ratingOutput;
  range.addEventListener('input', () => {
    output.value = Number(range.value).toFixed(1);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const body = String(data.get('body') || '').trim();
    if (!body) {
      form.elements.body.focus();
      return;
    }
    const file = data.get('photo');
    const photo = file && file.size ? await fileToDataUrl(file) : null;
    const review = {
      author: String(data.get('author') || 'Anonymous').trim() || 'Anonymous',
      date: String(data.get('date') || ''),
      rating: Number(data.get('rating') || 4),
      dish: String(data.get('dish') || '').trim(),
      body,
      photo,
      createdAt: new Date().toISOString(),
    };
    state.reviews[restaurant.id] = [...reviewsFor(restaurant.id), review];
    saveStoredReviews();
    openRestaurant(restaurant.id);
  });
  mount.appendChild(form);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', reject);
    reader.readAsDataURL(file);
  });
}

function renderAll() {
  renderCounters();
  renderOrigins();
  applyFilters();
  renderBlog();
}

function setupEvents() {
  els.searchInput.addEventListener('input', applyFilters);
  els.cuisineFilter.addEventListener('change', applyFilters);
  els.reviewSort.addEventListener('change', renderBlog);
  els.resetFilters.addEventListener('click', () => {
    els.searchInput.value = '';
    els.cuisineFilter.value = 'all';
    state.selectedCountry = null;
    applyFilters();
  });
  els.closeDialog.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('click', (event) => {
    if (event.target === els.dialog) els.dialog.close();
  });
}

async function init() {
  const response = await fetch('./data/restaurants.json');
  const data = await response.json();
  state.restaurants = data.restaurants;
  state.filtered = data.restaurants;
  state.reviews = getStoredReviews();
  setupCuisineFilter();
  setupMaps();
  setupEvents();
  renderAll();
}

init();
