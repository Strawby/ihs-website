// Tiny site behavior
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const root = document.documentElement;

// Theme toggle (light/dark) with persistence
const THEME_KEY = "site-theme";
const stored = localStorage.getItem(THEME_KEY);
if (stored === "light") root.classList.add("light");
const themeToggle = $("#themeToggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    root.classList.toggle("light");
    localStorage.setItem(
      THEME_KEY,
      root.classList.contains("light") ? "light" : "dark"
    );
  });
}

// Global footer year
$("#year").textContent = new Date().getFullYear();

// Accessible nav menu toggles
const navToggles = document.querySelectorAll(".nav-toggle");
const closeMenus = (exception) => {
  const exceptionItem = exception?.closest(".nav-item");
  navToggles.forEach((btn) => {
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

navToggles.forEach((toggle) => {
  const menu = toggle.nextElementSibling;
  if (!menu) return;

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
});

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

const footerUrl = new URL(
  "partials/footer.html",
  document.currentScript?.src || window.location.href
);

document.querySelectorAll('[data-footer]').forEach(async (slot) => {
  const html = await fetch(footerUrl).then((r) => r.text());
  slot.innerHTML = html;
});
