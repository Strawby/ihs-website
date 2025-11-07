// Tiny site behavior
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const root = document.documentElement;

// Theme toggle (light/dark) with persistence
const THEME_KEY = "site-theme";
const stored = localStorage.getItem(THEME_KEY);
if (stored === "light") root.classList.add("light");
$("#themeToggle").addEventListener("click", () => {
  root.classList.toggle("light");
  localStorage.setItem(THEME_KEY, root.classList.contains("light") ? "light" : "dark");
});

// Demo interaction
$("#year").textContent = new Date().getFullYear();
$("#actionBtn").addEventListener("click", () => {
  addCards([
    { title: "Zero build step", text: "Just HTML/CSS/JS—no bundlers." },
    { title: "Fast deploys", text: "Git push and you're live." },
    { title: "Custom domain", text: "Add a CNAME and enable HTTPS." }
  ]);
});

// Render helper
function addCards(items) {
  const wrap = $("#cards");
  wrap.innerHTML = items.map(({title, text}) => `
    <article class="card" role="listitem">
      <h3>${title}</h3>
      <p>${text}</p>
    </article>
  `).join("");
}
