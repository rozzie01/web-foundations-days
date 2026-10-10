// ---------- 1. Select the elements ----------
const API_URL = "https://jsonplaceholder.typicode.com/users";

const loadBtn = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusText = document.querySelector("#status");
const list = document.querySelector("#users-list");

// ---------- 2. The data ----------
let users = []; // every user we have loaded

// ---------- 3. Draw a list of users ----------
function renderUsers(usersToShow) {
  list.replaceChildren();

  if (usersToShow.length === 0) {
    const message = document.createElement("li");
    message.textContent = "No users match your filter.";
    list.appendChild(message);
    return;
  }

  usersToShow.forEach((user) => {
    const li = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const email = document.createElement("p");
    email.textContent = `Email: ${user.email}`;

    const city = document.createElement("p");
    city.textContent = `City: ${user.address.city}`;

    const company = document.createElement("p");
    company.textContent = `Company: ${user.company.name}`;

    li.appendChild(name);
    li.appendChild(email);
    li.appendChild(city);
    li.appendChild(company);
    list.appendChild(li);
  });
}

// ---------- 4. Filter the stored users ----------
function filterUsers() {
  const term = filterInput.value.trim().toLowerCase();
  const matches = users.filter((user) =>
    user.name.toLowerCase().includes(term)
  );
  renderUsers(matches);
}

// ---------- 5. Load users from the API ----------
async function loadUsers() {
  statusText.textContent = "Loading users...";
  loadBtn.disabled = true;
  users = [];
  list.replaceChildren();

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    users = await response.json();
    filterUsers(); // draws all users, or only those matching text already in the box
    statusText.textContent = `Loaded ${users.length} users.`;
  } catch (error) {
    statusText.textContent = "Could not load users. Please try again.";
    console.error(error);
  } finally {
    loadBtn.disabled = false; // runs after success AND after failure
  }
}

// ---------- 6. Listeners ----------
loadBtn.addEventListener("click", loadUsers);

filterInput.addEventListener("input", () => {
  if (users.length === 0) return; // nothing loaded yet
  filterUsers();
});

