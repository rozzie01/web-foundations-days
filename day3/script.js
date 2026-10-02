let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const allowedCategories = ["personal", "work", "study"];

function searchNotes(word) {
  const search = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(search));
}

function longestNote() {
  if (notes.length === 0) return null; // handle the empty array first
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

function countByCategory() {
  const counts = {};
  for (const note of notes) {
    if (counts[note.category] === undefined) {
      counts[note.category] = 0; // first time we see this category
    }
    counts[note.category]++;
  }
  return counts;
}

function getSummary() {
  const total = notes.length;
  if (total === 0) return "0 notes.";

  const counts = countByCategory();
  const noun = total === 1 ? "note" : "notes";
  const parts = [];
  for (const category of allowedCategories) {
    if (counts[category]) {
      parts.push(`${counts[category]} ${category}`);
    }
  }
  return `${total} ${noun}: ${parts.join(", ")}.`;
}

function isDuplicate(text) {
  const cleaned = text.trim().toLowerCase();
  return notes.some((note) => note.text.trim().toLowerCase() === cleaned);
}

function addNote(text, category) {
  const cleaned = text.trim();

  if (cleaned.length < 1 || cleaned.length > 200) {
    console.log("❌ Rejected: a note must be 1-200 characters.");
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log(`❌ Rejected: "${cleaned}" already exists.`);
    return false;
  }
  if (!allowedCategories.includes(category)) {
    console.log(`❌ Rejected: "${category}" is not personal, work or study.`);
    return false;
  }

  const newId = notes.length === 0 ? 1 : Math.max(...notes.map((n) => n.id)) + 1;
  notes.push({ id: newId, text: cleaned, category: category });
  console.log(`✅ Added: "${cleaned}" (${category})`);
  return true;
}

// ---------- TESTS ----------

// searchNotes
console.log(searchNotes("the"));
// Expected: array of 2 notes (ids 2 and 3)
console.log(searchNotes("JAVASCRIPT"));
// Expected: array with 1 note (id 4), even though the case differs
console.log(searchNotes("zebra"));
// Expected: [] (no results)

// longestNote
console.log(longestNote());
// Expected: { id: 3, text: "Email the project report to Grace", category: "work" }
const backup = [...notes];
notes = [];
console.log(longestNote());
// Expected: null (empty array)
notes = backup;

// countByCategory
console.log(countByCategory());
// Expected: { personal: 2, study: 2, work: 1 }

// getSummary
console.log(getSummary());
// Expected: "5 notes: 2 personal, 1 work, 2 study."
notes = [notes[0]];
console.log(getSummary());
// Expected: "1 note: 1 personal."
notes = backup;

// isDuplicate
console.log(isDuplicate("call mum"));
// Expected: true
console.log(isDuplicate("   CALL MUM   "));
// Expected: true (ignores case and extra spaces)
console.log(isDuplicate("Call dad"));
// Expected: false

// addNote
console.log(addNote("Learn Flexbox", "study"));
// Expected: logs ✅ Added, returns true
console.log(addNote("   ", "work"));
// Expected: logs ❌ 1-200 characters, returns false
console.log(addNote("a".repeat(201), "work"));
// Expected: logs ❌ 1-200 characters, returns false
console.log(addNote("call mum", "personal"));
// Expected: logs ❌ already exists, returns false
console.log(addNote("Plan holiday", "fun"));
// Expected: logs ❌ not personal, work or study, returns false
console.log(getSummary());
// Expected: "6 notes: 2 personal, 1 work, 3 study."

