// ---------- 1. Select the elements ----------
const textarea = document.querySelector("#note-text");
const charCount = document.querySelector("#char-count");
const wordCount = document.querySelector("#word-count");
const clearBtn = document.querySelector("#clear-btn");
const themeToggle = document.querySelector("#theme-toggle");

const DRAFT_KEY = "counter-draft";
const THEME_KEY = "counter-theme";

// ---------- 2. Counters ----------
function updateCounts() {
  const text = textarea.value;
  const length = text.length;
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  charCount.textContent = `${length} / 200 characters`;
  wordCount.textContent = `${words} words`;

  // second argument: true adds the class, false removes it
  charCount.classList.toggle("warning", length > 180);
  charCount.classList.toggle("over", length > 200);
}

// ---------- 3. Clear everything ----------
function clearAll() {
  textarea.value = "";
  localStorage.removeItem(DRAFT_KEY);
  updateCounts();
  textarea.focus();
}

// ---------- 4. Theme ----------
function applyTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark", isDark);
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
}

// ---------- 5. Event listeners ----------
textarea.addEventListener("input", () => {
  updateCounts();
  localStorage.setItem(DRAFT_KEY, textarea.value);
});

textarea.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearAll();
  }
});

clearBtn.addEventListener("click", clearAll);

themeToggle.addEventListener("click", () => {
  const nowDark = !document.body.classList.contains("dark");
  const theme = nowDark ? "dark" : "light";
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
});

// ---------- 6. On page load: restore draft and theme ----------
const savedDraft = localStorage.getItem(DRAFT_KEY);
if (savedDraft) {
  textarea.value = savedDraft;
}

applyTheme(localStorage.getItem(THEME_KEY) || "light");
updateCounts();