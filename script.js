// Tiny site behavior
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const root = document.documentElement;
const resolvePartialUrl = (path) =>
  new URL(path, document.currentScript?.src || window.location.href);

// Theme toggle (light/dark) with persistence
const THEME_KEY = "site-theme";
const stored = localStorage.getItem(THEME_KEY);
if (stored === "light") root.classList.add("light");
const initThemeToggle = (ctx = document) => {
  const themeToggle = $("#themeToggle", ctx);
  if (!themeToggle || themeToggle.dataset.enhanced) return;

  themeToggle.dataset.enhanced = "true";
  themeToggle.addEventListener("click", () => {
    root.classList.toggle("light");
    localStorage.setItem(
      THEME_KEY,
      root.classList.contains("light") ? "light" : "dark"
    );
  });
};

// Global footer year
const setYear = (ctx = document) => {
  const yearEl = $("#year", ctx);
  if (yearEl) yearEl.textContent = new Date().getFullYear();
};

// Sync body offset with header height
const updateHeaderOffset = () => {
  const header = document.querySelector(".site-header");
  if (!header) return;

  const { height } = header.getBoundingClientRect();
  root.style.setProperty("--header-height", `${height}px`);
};

// Accessible nav menu toggles
const getNavToggles = () => Array.from(document.querySelectorAll(".nav-toggle"));
const closeMenus = (exception) => {
  const exceptionItem = exception?.closest(".nav-item");
  getNavToggles().forEach((btn) => {
    const btnItem = btn.closest(".nav-item");
    if (btn === exception) return;

    if (
      exceptionItem &&
      btnItem &&
      (btnItem.contains(exceptionItem) || exceptionItem.contains(btnItem))
    ) {
      return;
    }

    btn.setAttribute("aria-expanded", "false");
    const menu = btn.nextElementSibling;
    if (menu) menu.hidden = true;
  });
};

const enhanceNavToggle = (toggle) => {
  const menu = toggle.nextElementSibling;
  if (!menu || toggle.dataset.enhanced) return;

  toggle.dataset.enhanced = "true";
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    if (isOpen) {
      toggle.setAttribute("aria-expanded", "false");
      menu.hidden = true;
    } else {
      closeMenus(toggle);
      toggle.setAttribute("aria-expanded", "true");
      menu.hidden = false;
    }
  });
};

const initNavigation = (ctx = document) => {
  ctx.querySelectorAll(".nav-toggle").forEach(enhanceNavToggle);
};
// Mobile burger menu
const initBurgerMenu = (ctx = document) => {
  const nav = ctx.querySelector(".nav");
  const burger = ctx.querySelector(".nav-burger");
  if (!nav || !burger || burger.dataset.enhanced) return;

  const closeBurger = () => {
    if (!nav.classList.contains("nav--open")) return;
    nav.classList.remove("nav--open");
    burger.setAttribute("aria-expanded", "false");
    updateHeaderOffset();
  };

  const toggleBurger = () => {
    const isOpen = nav.classList.toggle("nav--open");
    burger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    updateHeaderOffset();
  };

  burger.dataset.enhanced = "true";
  burger.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleBurger();
  });

  nav.addEventListener("click", (event) => {
    if (event.target.closest(".nav-link, .nav-menu-link")) {
      closeBurger();
    }
  });

  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target)) closeBurger();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      closeBurger();
    } else {
      updateHeaderOffset();
    }
  });
};

document.addEventListener("click", (event) => {
  if (!event.target.closest(".nav-item")) {
    closeMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenus();
});

// Gradually blur hero video on scroll
const heroVideo = $(".hero-video");
if (heroVideo) {
  const heroSection = heroVideo.closest(".hero");
  const maxBlur = 8; // px
  let ticking = false;

  const updateBlur = () => {
    const heroHeight = heroSection?.offsetHeight || window.innerHeight;
    const progress = Math.min(
      Math.max(window.scrollY / (heroHeight * 0.9), 0),
      1
    );
    const blur = progress * maxBlur;
    root.style.setProperty("--hero-blur", `${blur.toFixed(2)}px`);
    ticking = false;
  };

  updateBlur();

  document.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        requestAnimationFrame(updateBlur);
        ticking = true;
      }
    },
    { passive: true }
  );
}

const injectPartial = async (selector, url, onReady) => {
  const html = await fetch(url).then((r) => r.text());

  document.querySelectorAll(selector).forEach((slot) => {
    slot.innerHTML = html;
    onReady?.(slot);
  });
};

const headerUrl = resolvePartialUrl("partials/header.html");
const footerUrl = resolvePartialUrl("partials/footer.html");

injectPartial("[data-header]", headerUrl, (slot) => {
  initNavigation(slot);
  initThemeToggle(slot);
  initBurgerMenu(slot);
  updateHeaderOffset();
});

injectPartial("[data-footer]", footerUrl, (slot) => {
  setYear(slot);
});

initNavigation();
initThemeToggle();
setYear();
updateHeaderOffset();
initBurgerMenu();
window.addEventListener("resize", updateHeaderOffset);
