/* ============================
   NewzPitara — Main script
   - News: GNews API (your provided key)
   - Weather: OpenWeatherMap (you must add your key below)
   - Country select + infinite scroll + search + city override
   ============================ */

/* -------------- CONFIG -------------- */
// News API key (you provided)
const NEWS_API_KEY = "afc07da79d0b071bd12783a176bf72b8";

// Weather API: you must insert your OpenWeatherMap API key here
// Get one at https://openweathermap.org/api (free tier). Replace the placeholder string below.
const WEATHER_API_KEY = "d6ff0fb85a9a0f702bfe4cf6944e0edf";

/* -------------- STATE -------------- */
const state = {
  country: "in",            // ISO 2-letter default
  countryName: "India",
  category: "general",
  page: 1,                  // GNews page for infinite scroll
  pageSize: 10,             // items per page (max depends on API)
  loadingNews: false,
  articlesLoaded: 0,
  totalArticles: null,
  newsQuery: "",            // search query
  cityOverride: "",         // optional user-entered city for weather
  weatherRefreshMs: 1000 * 60 * 5 // 5 minutes auto refresh
};

/* -------------- DOM -------------- */
const countrySelect = document.getElementById("countrySelect");
const categorySelect = document.getElementById("categorySelect");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const newsFeed = document.getElementById("newsFeed");
const weatherCard = document.getElementById("weatherCard");
const totalArticlesEl = document.getElementById("totalArticles");
const currentCountryEl = document.getElementById("currentCountry");
const lastUpdatedEl = document.getElementById("lastUpdated");
const cityOverrideInput = document.getElementById("cityOverride");
const applyCityBtn = document.getElementById("applyCityBtn");
const splash = document.getElementById("splash");
const newsCardTpl = document.getElementById("newsCardTpl");
const toggleThemeBtn = document.getElementById("toggleTheme");

/* -------------- COUNTRY LIST & CITY MAPPING --------------
   Minimal list for convenience. Add more as needed.
   country code -> { name, cityForWeather }
   (GNews country param is 2-letter ISO code)
--------------------------------------------------------- */
const COUNTRIES = {
  in: { name: "India", city: "Siwan" },
  us: { name: "United States", city: "New York" },
  gb: { name: "United Kingdom", city: "London" },
  au: { name: "Australia", city: "Sydney" },
  ca: { name: "Canada", city: "Toronto" },
  de: { name: "Germany", city: "Berlin" },
  fr: { name: "France", city: "Paris" },
  jp: { name: "Japan", city: "Tokyo" },
  br: { name: "Brazil", city: "São Paulo" },
  ru: { name: "Russia", city: "Moscow" },
  sg: { name: "Singapore", city: "Singapore" },
  za: { name: "South Africa", city: "Johannesburg" }
};

/* -------------- INITIAL SETUP -------------- */
function populateCountries() {
  countrySelect.innerHTML = "";
  for (const [code, meta] of Object.entries(COUNTRIES)) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = `${meta.name} (${code.toUpperCase()})`;
    countrySelect.appendChild(opt);
  }
  countrySelect.value = state.country;
  currentCountryEl.textContent = COUNTRIES[state.country].name;
}

function initHandlers() {
  countrySelect.addEventListener("change", async (e) => {
    state.country = e.target.value;
    state.countryName = COUNTRIES[state.country]?.name || state.country;
    currentCountryEl.textContent = state.countryName;
    resetNewsAndLoad();
    fetchAndRenderWeather();
  });

  categorySelect.addEventListener("change", () => {
    state.category = categorySelect.value;
    resetNewsAndLoad();
  });

  searchBtn.addEventListener("click", () => {
    state.newsQuery = searchInput.value.trim();
    // If user typed a city, don't mix - city override has its own input
    state.page = 1;
    state.articlesLoaded = 0;
    newsFeed.innerHTML = "";
    loadNewsPage();
  });

  applyCityBtn.addEventListener("click", () => {
    state.cityOverride = cityOverrideInput.value.trim();
    fetchAndRenderWeather(true);
  });

  toggleThemeBtn.addEventListener("click", () => {
    document.documentElement.classList.toggle("light-theme");
  });

  // infinite scroll
  window.addEventListener("scroll", () => {
    const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 700);
    if (nearBottom && !state.loadingNews) {
      loadNewsPage();
    }
  });
}

/* -------------- NEWS -------------- */
function resetNewsAndLoad() {
  state.page = 1;
  state.articlesLoaded = 0;
  state.totalArticles = null;
  newsFeed.innerHTML = "";
  loadNewsPage(true);
}

async function loadNewsPage(isReset = false) {
  // don't overfetch when we've seen all
  if (state.totalArticles && state.articlesLoaded >= state.totalArticles) return;
  state.loadingNews = true;

  // show small loader
  if (state.page === 1) {
    newsFeed.innerHTML = `<div class="loader" style="padding:30px;color:var(--muted)">Loading headlines…</div>`;
  } else {
    const loader = document.createElement("div");
    loader.className = "loader";
    loader.style.padding = "18px";
    loader.style.textAlign = "center";
    loader.style.color = "var(--muted)";
    loader.innerText = "Loading more…";
    newsFeed.appendChild(loader);
  }

  const q = state.newsQuery ? `&q=${encodeURIComponent(state.newsQuery)}` : "";
  const cat = state.category ? `&category=${encodeURIComponent(state.category)}` : "";
  const country = state.country ? `&country=${state.country}` : "";
  const page = state.page;
  const pageSize = state.pageSize;

  try {
    // GNews top-headlines/search endpoints: using top-headlines for category+country combos; if there's a query, use search
    const endpoint = state.newsQuery
      ? `https://gnews.io/api/v4/search?lang=en&max=${pageSize}&page=${page}${q}&apikey=${NEWS_API_KEY}`
      : `https://gnews.io/api/v4/top-headlines?lang=en${cat}${country}&max=${pageSize}&page=${page}&apikey=${NEWS_API_KEY}`;

    const res = await fetch(endpoint);
    const data = await res.json();

    // handle API errors
    if (!data || data.errors) {
      throw new Error(data.message || JSON.stringify(data.errors || data));
    }

    // Remove any loader(s)
    document.querySelectorAll(".loader").forEach(n => n.remove());

    const articles = data.articles || [];
    // GNews sometimes provides totalArticles; if not, we keep loading until returns empty
    state.totalArticles = data.totalArticles || null;

    renderArticles(articles);

    state.articlesLoaded += articles.length;
    totalArticlesEl.textContent = state.totalArticles || state.articlesLoaded;
    lastUpdatedEl.textContent = new Date().toLocaleTimeString();

    // prepare next page
    if (articles.length > 0) state.page += 1;
  } catch (err) {
    console.error("News load error:", err);
    const errEl = document.createElement("div");
    errEl.style.padding = "18px";
    errEl.style.color = "var(--danger)";
    errEl.textContent = `Error loading news: ${err.message || err}`;
    newsFeed.appendChild(errEl);
  } finally {
    state.loadingNews = false;
  }
}

function renderArticles(articles) {
  if (!articles || articles.length === 0) {
    if (state.page === 1) newsFeed.innerHTML = `<div style="padding:20px;color:var(--muted)">No articles found.</div>`;
    return;
  }

  for (const a of articles) {
    const node = newsCardTpl.content.cloneNode(true);
    const art = node.querySelector(".news-card");
    art.querySelector("img").src = a.image || placeholderImage(a.title);
    art.querySelector(".title").textContent = a.title || "Untitled";
    art.querySelector(".desc").textContent = truncate(a.description || a.content || "No description", 140);
    art.querySelector(".source").textContent = a.source?.name || "Unknown";
    art.querySelector(".time").textContent = timeAgo(new Date(a.publishedAt || a.publishedAt));
    const link = art.querySelector(".readmore");
    link.href = a.url || "#";

    newsFeed.appendChild(node);
  }
}

/* -------------- WEATHER -------------- */
let weatherTimer = null;

async function fetchAndRenderWeather(force = false) {
  if (!WEATHER_API_KEY || WEATHER_API_KEY === "YOUR_OPENWEATHERMAP_API_KEY_HERE") {
    weatherCard.innerHTML = `<div style="color:var(--muted);padding:14px">Add your OpenWeatherMap API key to script.js (WEATHER_API_KEY) to show live weather.</div>`;
    return;
  }

  const city = state.cityOverride || (COUNTRIES[state.country]?.city) || "London";

  // simple UI
  weatherCard.innerHTML = `<div class="weather-loading" style="color:var(--muted)">Loading weather for ${city}…</div>`;

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${WEATHER_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather API returned ${res.status}`);
    const data = await res.json();

    renderWeatherCard(data);
    // schedule refresh
    if (weatherTimer) clearTimeout(weatherTimer);
    weatherTimer = setTimeout(() => fetchAndRenderWeather(true), state.weatherRefreshMs);
  } catch (err) {
    console.error("Weather fetch error", err);
    weatherCard.innerHTML = `<div style="color:var(--danger);padding:12px">Unable to load weather for "${city}". ${err.message || ""}</div>`;
  }
}

function renderWeatherCard(data) {
  const c = data.name;
  const t = Math.round(data.main.temp);
  const feels = Math.round(data.main.feels_like);
  const desc = data.weather?.[0]?.description || "—";
  const icon = data.weather?.[0]?.icon || "01d";
  const humidity = data.main.humidity;
  const wind = data.wind.speed;

  weatherCard.innerHTML = `
    <div class="top">
      <div style="display:flex;flex-direction:column;">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="weather-temp">${t}°C</div>
          <div>
            <div style="font-weight:700">${c}</div>
            <div class="weather-desc">${capitalize(desc)}</div>
          </div>
        </div>
      </div>
      <div style="font-size:32px">
        <img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${desc}" style="width:64px;height:64px"/>
      </div>
    </div>

    <div class="weather-row" style="margin-top:12px">
      <div class="weather-item"><div style="font-size:13px;color:var(--muted)">Feels</div><div style="font-weight:700">${feels}°C</div></div>
      <div class="weather-item"><div style="font-size:13px;color:var(--muted)">Humidity</div><div style="font-weight:700">${humidity}%</div></div>
      <div class="weather-item"><div style="font-size:13px;color:var(--muted)">Wind</div><div style="font-weight:700">${wind} m/s</div></div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;color:var(--muted);font-size:13px">
      <div>Updated: ${new Date().toLocaleTimeString()}</div>
      <div style="opacity:0.9">Auto-refresh every ${Math.round(state.weatherRefreshMs/60000)} min</div>
    </div>
  `;
}

/* -------------- HELPERS -------------- */
function placeholderImage(seed) {
  // generate a simple placeholder via Unsplash source (no API key) — falls back if blocked
  const q = encodeURIComponent((seed || "news").slice(0, 40));
  return `https://source.unsplash.com/collection/190727/800x450?${q}`;
}
function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function timeAgo(d) {
  if (!(d instanceof Date)) d = new Date(d);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

/* -------------- BOOTSTRAP -------------- */
async function boot() {
  populateCountries();
  initHandlers();

  // small animation for splash
  setTimeout(() => {
    splash.style.opacity = "0";
    splash.style.transform = "translateY(-8px)";
    setTimeout(() => splash.remove(), 700);
  }, 900);

  // initial loads
  resetNewsAndLoad();
  fetchAndRenderWeather();
}

boot();

/* -------------- UTILITY: keyboard 'enter' handling for search -------------- */
searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") searchBtn.click();
});
cityOverrideInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") applyCityBtn.click();
});
