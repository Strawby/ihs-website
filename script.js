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
  navToggles.forEach((btn) => {
    if (btn === exception) return;
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
