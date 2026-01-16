import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ======================
   Firebase init
====================== */
const firebaseConfig = {
  apiKey: "AIzaSyBuER6gwaNw4om3OCHkwK7nIETeroG-vIs",
  authDomain: "at-map-tmc.firebaseapp.com",
  projectId: "at-map-tmc",
  storageBucket: "at-map-tmc.firebasestorage.app",
  messagingSenderId: "862190385314",
  appId: "1:862190385314:web:f7fbf6a9eed1061231fffb",
  measurementId: "G-90GYNPFF82"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

/* ======================
   Helpers
====================== */
function waitForUser() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

async function requireAuth() {
  let user = await waitForUser();
  if (!user) {
    await signInWithPopup(auth, provider);
    user = auth.currentUser;
  }
  if (!user) throw new Error("Sign in required.");
  return user;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(ts) {
  try {
    return ts?.toDate ? ts.toDate().toLocaleString() : "";
  } catch {
    return "";
  }
}

/* ======================
   Load account + feedback
====================== */
async function loadAccount() {
  const user = await requireAuth();

  document.getElementById("account-email").textContent = user.email || "";

  const userSnap = await getDoc(doc(db, "users", user.uid));
  const username = userSnap.exists() ? userSnap.data().username : "";
  document.getElementById("account-username").textContent =
    username || "(no username)";

  const qy = query(
    collection(db, "feedback"),
    where("uid", "==", user.uid),
    orderBy("createdAt", "desc")
  );

  const qs = await getDocs(qy);

  const list = document.getElementById("feedback-list");
  list.innerHTML = "";

  document.getElementById("feedback-count").textContent =
    `${qs.size} item${qs.size === 1 ? "" : "s"}`;

  qs.forEach((docSnap) => {
    const d = docSnap.data();

    const kind = String(d.kind || "feedback").toLowerCase();
    const rating = d.rating ?? "";
    const notes = (d.notes || "").trim();
    const when = formatDate(d.createdAt);

let firstText = "";

if (kind === "water") {
  // Water sources: ALWAYS show the water name
  firstText = (
    d.waterName ||
    d.placeName ||
    d.name ||
    d.key ||
    ""
  ).trim();

} else if (kind === "resupply" || kind === "city" || kind === "cities") {
  // Cities / resupply towns
  firstText = (
    d.resupplyTown ||
    d.placeName ||
    d.city ||
    d.name ||
    d.key ||
    ""
  ).trim();

} else if (kind === "place") {
  // Places.csv locations
  const pn = (d.placeName || "").trim();
  const pc = (d.placeCity || "").trim();
  firstText = pc ? `${pn} (${pc})` : pn;

} else {
  firstText = (d.name || d.city || d.key || "").trim();
}


    const parts = [];
    if (firstText) parts.push(firstText);
    if (rating !== "") parts.push(String(rating));
    if (notes) parts.push(notes);

    const li = document.createElement("li");
    li.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div style="font-weight:700;">
          ${escapeHtml(parts.join(", "))}
        </div>
        <div class="muted">
          ${escapeHtml(when)}
        </div>
      </div>
    `;

    list.appendChild(li);
  });
}

/* ======================
   Buttons
====================== */
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "./index.html";
  });

  document.getElementById("signout-btn")?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "./index.html";
  });

  loadAccount().catch(err => {
    console.error(err);
    alert(err?.message || String(err));
  });
});
