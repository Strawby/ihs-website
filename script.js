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

const initHamburger = (ctx = document) => {
  const nav = ctx.querySelector(".nav");
  const hamburger = ctx.querySelector(".nav-hamburger");
  const navInner = ctx.querySelector(".nav-inner");

  if (!nav || !hamburger || !navInner || nav.dataset.hamburgerEnhanced)
    return;

  nav.dataset.hamburgerEnhanced = "true";
  nav.classList.add("nav--collapsible");

  const setOpen = (open) => {
    nav.classList.toggle("nav--open", open);
    hamburger.setAttribute("aria-expanded", open ? "true" : "false");
    hamburger.setAttribute(
      "aria-label",
      open ? "Close navigation menu" : "Open navigation menu"
    );
    if (!open) closeMenus();
  };

  setOpen(false);

  hamburger.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = !nav.classList.contains("nav--open");
    setOpen(willOpen);
  });

  navInner.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });

  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target)) setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
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

// Gradually blur hero video on scroll and fall back to image if video fails
const heroVideo = $(".hero-video");
if (heroVideo) {
  const heroSection = heroVideo.closest(".hero");
  const heroMedia = heroVideo.closest(".hero-media");
  const compactNavQuery = window.matchMedia("(max-width: 900px)");
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

  const showHeroFallback = () => {
    heroMedia?.classList.add("hero-media--fallback");
  };

  heroVideo.addEventListener("error", showHeroFallback);
  heroVideo.addEventListener("stalled", showHeroFallback);

  const syncHeroVideoToViewport = () => {
    const shouldHideVideo = compactNavQuery.matches;

    heroMedia?.classList.toggle("hero-media--static", shouldHideVideo);

    if (shouldHideVideo) {
      if (!heroVideo.paused) heroVideo.pause();
    } else if (heroVideo.paused) {
      heroVideo.play().catch(() => {});
    }
  };

  updateBlur();
  syncHeroVideoToViewport();

  if (compactNavQuery.addEventListener) {
    compactNavQuery.addEventListener("change", syncHeroVideoToViewport);
  } else {
    compactNavQuery.addListener(syncHeroVideoToViewport);
  }

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
const siteBasePath = new URL("..", headerUrl);

const resolveSitePath = (path) => new URL(path, siteBasePath).pathname;
const applyRelativePaths = (ctx = document) => {
  ctx.querySelectorAll("[data-path]").forEach((el) => {
    const path = el.getAttribute("data-path");
    if (path) el.setAttribute("href", resolveSitePath(path));
  });

  ctx.querySelectorAll("img[data-src]").forEach((img) => {
    const src = img.getAttribute("data-src");
    if (src) img.setAttribute("src", resolveSitePath(src));
  });
};

const normalizeGalleryManifest = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.images)) return data.images;
  return [];
};

const initLightbox = (ctx = document) => {
  const overlay = ctx.querySelector("[data-gallery-lightbox]");
  if (!overlay) return null;
  if (overlay.dataset.enhanced) return overlay._lightboxController;

  const overlayImg = overlay.querySelector("img");
  const prevButton = overlay.querySelector(".lightbox-nav--prev");
  const nextButton = overlay.querySelector(".lightbox-nav--next");
  const closeButton = overlay.querySelector(".lightbox-close");
  let activeIndex = 0;
  let activeItems = [];
  let activeLabel = "Gallery photo";

  const setOverlayVisible = (visible) => {
    overlay.hidden = !visible;
    overlay.setAttribute("aria-hidden", visible ? "false" : "true");
    document.body.style.overflow = visible ? "hidden" : "";
  };

  const updateOverlay = (index) => {
    if (!activeItems.length) return;
    activeIndex = (index + activeItems.length) % activeItems.length;
    if (overlayImg) {
      overlayImg.src = resolveSitePath(activeItems[activeIndex]);
      overlayImg.alt = `${activeLabel} ${activeIndex + 1} of ${activeItems.length}`;
    }
  };

  const openOverlay = (items, index = 0, label) => {
    const normalizedItems = Array.isArray(items) ? items : [items];
    activeItems = normalizedItems.filter(
      (src) => typeof src === "string" && src.trim()
    );
    if (!activeItems.length) return;

    activeLabel = label || "Gallery photo";
    overlay.setAttribute("aria-label", activeLabel);
    updateOverlay(index);
    setOverlayVisible(true);
    closeButton?.focus({ preventScroll: true });
  };

  const closeOverlay = () => setOverlayVisible(false);

  const showNext = () => {
    if (!activeItems.length) return;
    updateOverlay(activeIndex + 1);
  };

  const showPrev = () => {
    if (!activeItems.length) return;
    updateOverlay(activeIndex - 1);
  };

  nextButton?.addEventListener("click", showNext);
  prevButton?.addEventListener("click", showPrev);
  closeButton?.addEventListener("click", closeOverlay);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeOverlay();
  });

  document.addEventListener("keydown", (event) => {
    if (overlay.hidden) return;
    if (event.key === "Escape") closeOverlay();
    if (event.key === "ArrowRight") showNext();
    if (event.key === "ArrowLeft") showPrev();
  });

  overlay.dataset.enhanced = "true";
  overlay._lightboxController = { open: openOverlay };
  return overlay._lightboxController;
};

const initMediaGalleries = async (ctx = document, lightbox = initLightbox(ctx)) => {
  const galleries = Array.from(ctx.querySelectorAll("[data-media-gallery]"));
  if (!lightbox || !galleries.length) return;

  const loadGalleryItems = async (manifestPath) => {
    if (!manifestPath) return [];
    const manifestUrl = resolveSitePath(manifestPath);
    const response = await fetch(manifestUrl, { cache: "no-cache" });
    if (!response.ok) throw new Error("Unable to fetch gallery manifest");
    const manifest = await response.json();
    return normalizeGalleryManifest(manifest).filter(
      (src) => typeof src === "string" && src.trim()
    );
  };

  await Promise.all(
    galleries.map(async (gallery) => {
      const manifestPath = gallery.getAttribute("data-gallery-manifest");
      const galleryLabel = gallery.getAttribute("data-gallery-label")?.trim();
      let items = [];

      try {
        items = await loadGalleryItems(manifestPath);
      } catch (error) {
        gallery.innerHTML = '<p class="muted">Unable to load gallery right now.</p>';
        return;
      }

      if (!items.length) {
        gallery.innerHTML = '<p class="muted">Check back soon for more photos.</p>';
        return;
      }

      const fragment = document.createDocumentFragment();

      items.forEach((src, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gallery-thumb";
        button.dataset.index = String(index);

        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = `${galleryLabel || "Gallery"} photo thumbnail`;
        img.src = resolveSitePath(src);

        button.appendChild(img);
        button.addEventListener("click", () =>
          lightbox.open(items, index, galleryLabel)
        );
        fragment.appendChild(button);
      });

      gallery.innerHTML = "";
      gallery.appendChild(fragment);
    })
  );
};

const initPoolHeroLightbox = (ctx = document, lightbox = initLightbox(ctx)) => {
  const trigger = ctx.querySelector("[data-hero-lightbox]");
  if (!lightbox || !trigger || trigger.dataset.enhanced) return;

  trigger.dataset.enhanced = "true";
  const img = trigger.querySelector("img");
  const src = img?.getAttribute("src");
  const alt = img?.getAttribute("alt")?.trim();
  const label = alt || "Pool photo";

  trigger.addEventListener("click", () => {
    if (!src) return;
    lightbox.open([src], 0, label);
  });
};

injectPartial("[data-header]", headerUrl, (slot) => {
  applyRelativePaths(slot);
  initNavigation(slot);
  initThemeToggle(slot);
  initHamburger(slot);
});

injectPartial("[data-footer]", footerUrl, (slot) => {
  setYear(slot);
});

initNavigation();
initThemeToggle();
initHamburger();
setYear();
const lightbox = initLightbox();
initMediaGalleries(document, lightbox);
initPoolHeroLightbox(document, lightbox);
