import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  enableIndexedDbPersistence,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. Firebase Konfiguration & Initialisierung
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDjaAvZvKpmJkA1Psb6Ajh8CcIFBxQpM1w",
  authDomain: "klapsencal.firebaseapp.com",
  projectId: "klapsencal",
  storageBucket: "klapsencal.firebasestorage.app",
  messagingSenderId: "709770125091",
  appId: "1:709770125091:web:8ec4a1294b59622d9ff696",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Helper: Sicherstellen, dass stets eine gültige Firebase Auth Session aktiv ist
async function ensureAuth() {
  if (!auth.currentUser) {
    try {
      const cred = await signInAnonymously(auth);
      console.log("Firebase Auth erfolgreich verbunden:", cred.user.uid);
    } catch (e) {
      console.warn("Auth Initialisierungs-Hinweis:", e);
    }
  }
  return auth.currentUser;
}
window.ensureAuth = ensureAuth;

// Sofort beim Start anmelden
ensureAuth();

// Automatische Re-Synchronisation beim Aufwachen der App (Handy entsperrt / Tab gewechselt)
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible") {
    console.log(
      "App wieder im Vordergrund – prüfe Verbindung & synchronisiere Termine...",
    );
    await ensureAuth();
    filterAndRender();
    renderCalendarWidget();
    updateTasksBadge();
  }
});

// Automatische Re-Synchronisation bei Rückkehr der Internetverbindung
window.addEventListener("online", async () => {
  console.log("Internetverbindung wiederhergestellt – synchronisiere...");
  await ensureAuth();
  filterAndRender();
  renderCalendarWidget();
});

// Offline-Persistence aktivieren
try {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === "failed-precondition") {
      console.warn("Persistence: Multiple tabs open");
    } else if (err.code === "unimplemented") {
      console.warn("Persistence not supported by browser");
    }
  });
} catch (e) {
  console.warn("Persistence Init Error:", e);
}

// ==========================================
// 2. Globale Variablen & State
// ==========================================
const DEFAULT_AUTHORS = [
  "Daniel",
  "Daniela",
  "Peter",
  "Simone",
  "Tanja",
  "Thorsten",
  "Nic",
  "Tristan",
  "Simon",
  "Emily",
  "Alexander",
];
const DEFAULT_CATEGORIES = [
  "Essen",
  "Konzert",
  "Veranstaltung",
  "Mittelalter",
  "Geburtstag",
  "Dart",
  "Billard",
  "Urlaub / Abwesend",
  "Sonstiges",
];

const CATEGORY_COLORS = {
  Essen: {
    color: "#f97316",
    bg: "rgba(249, 115, 22, 0.18)",
    border: "rgba(249, 115, 22, 0.45)",
    icon: "🍽️",
  },
  Konzert: {
    color: "#a855f7",
    bg: "rgba(168, 85, 247, 0.18)",
    border: "rgba(168, 85, 247, 0.45)",
    icon: "🎸",
  },
  Veranstaltung: {
    color: "#0ea5e9",
    bg: "rgba(14, 165, 233, 0.18)",
    border: "rgba(14, 165, 233, 0.45)",
    icon: "🎪",
  },
  Mittelalter: {
    color: "#d97706",
    bg: "rgba(217, 119, 6, 0.20)",
    border: "rgba(217, 119, 6, 0.50)",
    icon: "⚔️",
  },
  Geburtstag: {
    color: "#ec4899",
    bg: "rgba(236, 72, 153, 0.18)",
    border: "rgba(236, 72, 153, 0.45)",
    icon: "🎂",
  },
  Dart: {
    color: "#eab308",
    bg: "rgba(234, 179, 8, 0.18)",
    border: "rgba(234, 179, 8, 0.45)",
    icon: "🎯",
  },
  Billard: {
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.18)",
    border: "rgba(16, 185, 129, 0.45)",
    icon: "🎱",
  },
  "Urlaub / Abwesend": {
    color: "#ef4444",
    bg: "rgba(239, 68, 68, 0.22)",
    border: "rgba(239, 68, 68, 0.65)",
    icon: "🏖️",
  },
  Sonstiges: {
    color: "#94a3b8",
    bg: "rgba(148, 163, 184, 0.18)",
    border: "rgba(148, 163, 184, 0.45)",
    icon: "📌",
  },
};

function getCategoryColor(cat) {
  return (
    CATEGORY_COLORS[cat] || {
      color: "#10b981",
      bg: "rgba(16, 185, 129, 0.18)",
      border: "rgba(16, 185, 129, 0.45)",
      icon: "📌",
    }
  );
}

const CHILDREN_NAMES = ["Nic", "Tristan", "Simon", "Emily", "Alexander"];
const ADULT_NAMES = [
  "Daniel",
  "Daniela",
  "Peter",
  "Simone",
  "Tanja",
  "Thorsten",
];

function isChild(name) {
  return CHILDREN_NAMES.includes(name);
}

let allAuthors = [...DEFAULT_AUTHORS];
let allCategories = [...DEFAULT_CATEGORIES];
let allEvents = [];
let selectedCategory = "Alle";
let selectedTimeframe = "30d";
let selectedType = "Essen";
let formParticipants = {};
let editingEventId = null;
let currentDetailData = null;
let isInitialLoad = true;
let initialEventsLoaded = false;
let knownEventDocIds = new Set();

let calCurrentYear = new Date().getFullYear();
let calCurrentMonth = new Date().getMonth();
let selectedCalendarDate = null;

const MONTH_NAMES_SHORT = [
  "JAN",
  "FEB",
  "MÄR",
  "APR",
  "MAI",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OKT",
  "NOV",
  "DEZ",
];
const WEEKDAY_NAMES_SHORT = ["SO", "MO", "DI", "MI", "DO", "FR", "SA"];
const MONTH_NAMES_LONG = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
const WEEKDAY_NAMES_LONG = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

// ==========================================
// 3. Benachrichtigungen (Push & Local)
// ==========================================
window.requestNotificationPermission = async function () {
  if (!("Notification" in window)) {
    window.showAppModal(
      "Nicht unterstützt",
      "Dieser Browser unterstützt leider keine Benachrichtigungen.",
    );
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      window.showAppModal(
        "Aktiviert! 🔔",
        "Du erhältst nun Benachrichtigungen, wenn Termine eingetragen oder geändert werden.",
      );
      updateNotificationButton();
      sendLocalNotification(
        "Klapsentouren 🔔",
        "Benachrichtigungen sind erfolgreich aktiviert!",
      );
    } else if (permission === "denied") {
      window.showAppModal(
        "Deaktiviert",
        "Benachrichtigungen wurden blockiert. Du kannst sie in den Browser-Einstellungen freigeben.",
      );
      updateNotificationButton();
    }
  } catch (e) {
    console.error("Fehler bei Benachrichtigungs-Berechtigung:", e);
  }
};

function updateNotificationButton() {
  const btn = document.getElementById("btn-toggle-notifications");
  if (!btn) return;
  if ("Notification" in window && Notification.permission === "granted") {
    btn.textContent = "🔔";
    btn.title = "Benachrichtigungen aktiv";
    btn.style.opacity = "1";
  } else {
    btn.textContent = "🔕";
    btn.title = "Benachrichtigungen aktivieren";
    btn.style.opacity = "0.6";
  }
}

async function sendLocalNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted")
    return;

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        reg.showNotification(title, {
          body: body,
          icon: "logo.png",
          badge: "icons/icon-192.png",
          vibrate: [200, 100, 200],
          data: { url: "./index.html" },
        });
        return;
      }
    }
    new Notification(title, {
      body: body,
      icon: "logo.png",
    });
  } catch (e) {
    console.warn("Konnte Benachrichtigung nicht senden:", e);
  }
}

// ==========================================
// 3.1 Automatische Terminerinnerungen (2h vorher / Vorabend 20 Uhr)
// ==========================================
function checkUpcomingReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted")
    return;

  let sentReminders = {};
  try {
    sentReminders = JSON.parse(
      localStorage.getItem("klapsen_sent_reminders") || "{}",
    );
  } catch (e) {
    sentReminders = {};
  }

  const now = new Date();

  allEvents.forEach((ev) => {
    if (!ev.Datum || !ev.Titel) return;

    const isAllDay = !!ev.isAllDay || !ev.Uhrzeit;
    const parts = ev.Datum.split("-");
    if (parts.length !== 3) return;

    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);

    if (isAllDay) {
      // Ganztägiger Termin: Vorabend ab 20:00 Uhr erinnern
      const eveReminderTime = new Date(year, month, day - 1, 20, 0, 0);
      const eventDayEnd = new Date(year, month, day, 23, 59, 59);

      const reminderKey = `reminder_allday_${ev.id || ev.Titel}_${ev.Datum}`;

      if (
        now >= eveReminderTime &&
        now <= eventDayEnd &&
        !sentReminders[reminderKey]
      ) {
        const isEve =
          now.getFullYear() === year &&
          now.getMonth() === month &&
          now.getDate() === day - 1;
        const titleText = isEve
          ? `☀️ Erinnerung für morgen: ${ev.Titel}`
          : `☀️ Heute ganztägig: ${ev.Titel}`;
        const bodyText = `${isEve ? "Morgen" : "Heute"} steht '${ev.Titel}' an!${ev.Ort ? " (📍 " + ev.Ort + ")" : ""}`;

        sendLocalNotification(titleText, bodyText);
        sentReminders[reminderKey] = Date.now();
      }
    } else {
      // Termin mit fester Uhrzeit: 2 Stunden vorher erinnern
      const timeParts = (ev.Uhrzeit || "00:00").split(":");
      const hours = parseInt(timeParts[0]) || 0;
      const minutes = parseInt(timeParts[1]) || 0;

      const eventStartTime = new Date(year, month, day, hours, minutes, 0);
      const reminderTime = new Date(
        eventStartTime.getTime() - 2 * 60 * 60 * 1000,
      ); // 2 Std vorher

      const reminderKey = `reminder_timed_${ev.id || ev.Titel}_${ev.Datum}_${ev.Uhrzeit}`;

      if (
        now >= reminderTime &&
        now < eventStartTime &&
        !sentReminders[reminderKey]
      ) {
        const titleText = `⏰ In 2 Stunden: ${ev.Titel}`;
        const bodyText = `Um ${ev.Uhrzeit} Uhr: '${ev.Titel}'${ev.Ort ? " (📍 " + ev.Ort + ")" : ""}`;

        sendLocalNotification(titleText, bodyText);
        sentReminders[reminderKey] = Date.now();
      }
    }
  });

  try {
    localStorage.setItem(
      "klapsen_sent_reminders",
      JSON.stringify(sentReminders),
    );
  } catch (e) {}
}

// Regelmäßige Prüfung alle 60 Sekunden
setInterval(checkUpcomingReminders, 60000);

// ==========================================
// 4. Autoren & Kategorien (Echtzeit aus Firebase)
// ==========================================
function initAuthorsListener() {
  const docRef = doc(db, "data_termine", "Ersteller");

  // Einmalig die neuen Personen in Firebase sicherstellen
  setDoc(docRef, { names: DEFAULT_AUTHORS }).catch((e) => {
    console.warn("Konnte Ersteller in Firebase nicht schreiben:", e);
  });

  onSnapshot(
    docRef,
    (docSnap) => {
      const select = document.getElementById("event-author");
      const currentVal = select.value;

      if (docSnap.exists() && Array.isArray(docSnap.data().names)) {
        allAuthors = docSnap.data().names;
      } else {
        allAuthors = [...DEFAULT_AUTHORS];
      }

      select.innerHTML =
        '<option value="" disabled selected>Wähle Ersteller...</option>';
      allAuthors.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      });

      if (currentVal && allAuthors.includes(currentVal)) {
        select.value = currentVal;
      }

      const lokalSelect =
        document.getElementById("lokal-author") ||
        document.getElementById("einkehr-author");
      if (lokalSelect) {
        const lokalVal = lokalSelect.value;
        lokalSelect.innerHTML =
          '<option value="" disabled selected>Wähle Ersteller...</option>';
        allAuthors.forEach((name) => {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          lokalSelect.appendChild(opt);
        });
        if (lokalVal && allAuthors.includes(lokalVal)) {
          lokalSelect.value = lokalVal;
        }
      }

      renderFormParticipants();
      if (typeof renderLokalParticipants === "function") {
        renderLokalParticipants();
      }
    },
    (e) => {
      console.warn("Ersteller Listener Fehler:", e);
    },
  );
}

function renderFormParticipants() {
  const container = document.getElementById("form-participants-container");
  if (!container) return;
  container.innerHTML = "";

  allAuthors.forEach((name) => {
    const isSelected = formParticipants[name] === "yes";
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `form-participant-chip ${isSelected ? "selected" : ""}`;
    chip.innerHTML = `
            <img src="avatars/${name}.webp" onerror="this.onerror=null; this.src='logo.png';" class="form-participant-avatar" alt="${name}">
            <span class="form-participant-name">${name}</span>
            ${isSelected ? '<span class="form-participant-check">✓</span>' : ""}
        `;
    chip.onclick = () => {
      if (formParticipants[name] === "yes") {
        delete formParticipants[name];
      } else {
        formParticipants[name] = "yes";
      }
      renderFormParticipants();
    };
    container.appendChild(chip);
  });
}
window.renderFormParticipants = renderFormParticipants;

window.selectAllParticipants = function (selectAll = true) {
  if (selectAll) {
    allAuthors.forEach((n) => {
      formParticipants[n] = "yes";
    });
  } else {
    formParticipants = {};
    const currentAuthor = document.getElementById("event-author")?.value;
    if (currentAuthor) formParticipants[currentAuthor] = "yes";
  }
  renderFormParticipants();
};

window.selectAdultsParticipants = function () {
  formParticipants = {};
  allAuthors
    .filter((n) => !isChild(n))
    .forEach((n) => {
      formParticipants[n] = "yes";
    });
  const currentAuthor = document.getElementById("event-author")?.value;
  if (currentAuthor) formParticipants[currentAuthor] = "yes";
  renderFormParticipants();
};

let formGuests = { adults: 0, children: 0 };

window.changeFormGuests = function (type, delta) {
  if (!formGuests[type]) formGuests[type] = 0;
  formGuests[type] = Math.max(0, formGuests[type] + delta);
  renderFormGuests();
};

function renderFormGuests() {
  const adultsEl = document.getElementById("form-guest-adults-count");
  const childrenEl = document.getElementById("form-guest-children-count");
  if (adultsEl) adultsEl.textContent = formGuests.adults || 0;
  if (childrenEl) childrenEl.textContent = formGuests.children || 0;
}
window.renderFormGuests = renderFormGuests;

function initCategoriesListener() {
  const docRef = doc(db, "data_termine", "Art");

  // Einmalig die neuen Kategorien in Firebase sicherstellen
  setDoc(docRef, { typ: DEFAULT_CATEGORIES }).catch((e) => {
    console.warn("Konnte Kategorien in Firebase nicht schreiben:", e);
  });

  onSnapshot(
    docRef,
    (docSnap) => {
      const filterCont = document.getElementById("filter-container");
      const formChipsCont = document.getElementById("event-type-chips");

      if (docSnap.exists() && Array.isArray(docSnap.data().typ)) {
        allCategories = docSnap.data().typ;
      } else {
        allCategories = [...DEFAULT_CATEGORIES];
      }

      // Filter Chips in der Hauptansicht
      filterCont.innerHTML = `<div class="filter-chip ${selectedCategory === "Alle" ? "active" : ""}" onclick="window.selectCategory('Alle', this)">🌐 Alle</div>`;
      formChipsCont.innerHTML = "";

      allCategories.forEach((cat, idx) => {
        const cStyle = getCategoryColor(cat);
        const icon = cStyle.icon || "📌";

        // Filter Chip
        const fChip = document.createElement("div");
        fChip.className = `filter-chip ${selectedCategory === cat ? "active" : ""}`;
        fChip.innerHTML = `<span style="margin-right:5px; font-size:0.9rem;">${icon}</span>${cat}`;
        fChip.onclick = (e) => window.selectCategory(cat, e.currentTarget);
        filterCont.appendChild(fChip);

        // Formular Chip
        const sChip = document.createElement("div");
        sChip.className = `selectable-chip ${selectedType === cat ? "selected" : idx === 0 && !selectedType ? "selected" : ""}`;
        sChip.innerHTML = `<span style="margin-right:6px; font-size:0.95rem;">${icon}</span>${cat}`;
        sChip.dataset.name = cat;
        sChip.onclick = () => {
          selectedType = cat;
          document
            .querySelectorAll("#event-type-chips .selectable-chip")
            .forEach((c) => c.classList.remove("selected"));
          sChip.classList.add("selected");
          updateCategoryDependentFields();
          if (cat === "Geburtstag" && !editingEventId) {
            const allDayCheckbox = document.getElementById("event-all-day");
            if (allDayCheckbox && !allDayCheckbox.checked) {
              allDayCheckbox.checked = true;
              allDayCheckbox.dispatchEvent(new Event("change"));
            }
            const recSelect = document.getElementById("event-recurrence");
            if (recSelect && recSelect.value === "none") {
              recSelect.value = "yearly";
              recSelect.dispatchEvent(new Event("change"));
            }
          }
        };
        formChipsCont.appendChild(sChip);
      });

      if (!allCategories.includes(selectedType)) {
        selectedType = allCategories[0] || "Essen";
      }
      updateCategoryDependentFields();

      filterAndRender();
    },
    (e) => {
      console.warn("Kategorien Listener Fehler:", e);
    },
  );
}

function applyFormChipColors() {
  document
    .querySelectorAll("#event-type-chips .selectable-chip")
    .forEach((c) => {
      const catName = c.dataset.name;
      const catStyle = getCategoryColor(catName);
      const isSel = c.classList.contains("selected");
      if (isSel) {
        c.style.background = catStyle.color;
        c.style.borderColor = catStyle.color;
        c.style.boxShadow = `0 3px 12px ${catStyle.color}90`;
        c.style.color = "#ffffff";
      } else {
        c.style.background = "";
        c.style.borderColor = "";
        c.style.boxShadow = "";
        c.style.color = "";
      }
    });
}
window.applyFormChipColors = applyFormChipColors;

function updateCategoryDependentFields() {
  const birthYearGroup = document.getElementById("birth-year-group");
  const endDateGroup = document.getElementById("end-date-group");
  const timeGroup = document.getElementById("time-group");
  const allDayToggleGroup = document.getElementById("all-day-toggle-group");
  const locationGroup = document.getElementById("location-group");
  const linkGroup = document.getElementById("link-group");
  const dateLabel = document.getElementById("event-date-label");
  const participantsLabel = document.getElementById("form-participants-label");
  const titleInput = document.getElementById("event-title");
  const authorSelect = document.getElementById("event-author");

  if (birthYearGroup) {
    if (selectedType === "Geburtstag") {
      birthYearGroup.style.display = "flex";
    } else {
      birthYearGroup.style.display = "none";
      const birthYearInput = document.getElementById("event-birth-year");
      if (birthYearInput && !editingEventId) birthYearInput.value = "";
    }
  }

  if (selectedType === "Urlaub / Abwesend") {
    // 1. Bis-Datum einblenden & Label anpassen
    if (endDateGroup) endDateGroup.style.display = "flex";
    if (dateLabel) dateLabel.textContent = "Startdatum";
    if (participantsLabel)
      participantsLabel.textContent = "🏖️ Wer ist abwesend? (Personen)";

    // 2. Nicht benötigte Felder (Uhrzeit, Ganztägig, Ort, Link) ausblenden
    if (timeGroup) timeGroup.style.display = "none";
    if (allDayToggleGroup) allDayToggleGroup.style.display = "none";
    if (locationGroup) locationGroup.style.display = "none";
    if (linkGroup) linkGroup.style.display = "none";

    // Automatisch ganztägig markieren
    const allDayCheckbox = document.getElementById("event-all-day");
    if (allDayCheckbox && !allDayCheckbox.checked) {
      allDayCheckbox.checked = true;
    }
    const timeInput = document.getElementById("event-time");
    if (timeInput && !editingEventId) timeInput.value = "";

    // Titel-Vorschlag, falls noch leer
    if (
      titleInput &&
      (!titleInput.value || titleInput.value.startsWith("Urlaub"))
    ) {
      const author = authorSelect?.value || "";
      titleInput.placeholder = "z.B. Sommerurlaub, Städtetrip, Nicht da...";
      if (!editingEventId && author && !titleInput.value) {
        titleInput.value = `Urlaub - ${author}`;
      }
    }
  } else {
    // Standard-Felder wieder einblenden
    if (endDateGroup) endDateGroup.style.display = "none";
    if (timeGroup) timeGroup.style.display = "flex";
    if (allDayToggleGroup) allDayToggleGroup.style.display = "flex";
    if (locationGroup) locationGroup.style.display = "flex";
    if (linkGroup) linkGroup.style.display = "flex";

    if (dateLabel) dateLabel.textContent = "Datum";
    if (participantsLabel)
      participantsLabel.textContent = "👥 Wer ist dabei? (Teilnehmer)";
    if (titleInput)
      titleInput.placeholder = "z.B. Sommerfest & Grillen, Wanderung...";
    const endDateInput = document.getElementById("event-end-date");
    if (endDateInput && !editingEventId) endDateInput.value = "";
  }

  applyFormChipColors();
  checkAbsenceConflicts();
}
window.updateCategoryDependentFields = updateCategoryDependentFields;

function checkAbsenceConflicts() {
  const warningBox = document.getElementById("event-conflict-warning");
  const warningText = document.getElementById("event-conflict-warning-text");
  if (!warningBox || !warningText) return;

  // Wenn man selbst gerade einen Urlaub anlegt, keinen Konflikt-Warner anzeigen
  if (selectedType === "Urlaub / Abwesend") {
    warningBox.style.display = "none";
    return;
  }

  const dateInput = document.getElementById("event-date");
  const chosenDate = dateInput?.value;
  if (!chosenDate) {
    warningBox.style.display = "none";
    return;
  }

  const absentNames = new Set();

  rawEvents.forEach((ev) => {
    if (ev.Kategorie !== "Urlaub / Abwesend") return;
    if (
      editingEventId &&
      (ev.id === editingEventId || ev.baseId === editingEventId)
    )
      return;

    const start = ev.Datum;
    const end = ev.Enddatum && ev.Enddatum >= ev.Datum ? ev.Enddatum : ev.Datum;

    if (chosenDate >= start && chosenDate <= end) {
      const rsvp = ev.Teilnehmer || {};
      const members = Object.keys(rsvp).filter((name) => rsvp[name] === "yes");
      if (members.length > 0) {
        members.forEach((n) => absentNames.add(n));
      } else if (ev.Ersteller) {
        absentNames.add(ev.Ersteller);
      }
    }
  });

  if (absentNames.size > 0) {
    const listStr = Array.from(absentNames).join(", ");
    const verb = absentNames.size === 1 ? "ist" : "sind";
    warningText.innerHTML = `<strong>Achtung:</strong> ${listStr} ${verb} an diesem Tag im Urlaub / abwesend!`;
    warningBox.style.display = "flex";
  } else {
    warningBox.style.display = "none";
  }
}
window.checkAbsenceConflicts = checkAbsenceConflicts;

// ==========================================
// 5. Firestore Realtime Listener & Serientermine
// ==========================================
let rawEvents = [];

function expandEventInstances(rawEventsList) {
  const expanded = [];
  rawEventsList.forEach((rawDoc) => {
    // 1. Zeitraum-Termin (z. B. Urlaub über mehrere Tage)
    if (rawDoc.Enddatum && rawDoc.Enddatum > rawDoc.Datum) {
      const rangeDates = [];
      const [sy, sm, sd] = rawDoc.Datum.split("-").map(Number);
      const [ey, em, ed] = rawDoc.Enddatum.split("-").map(Number);
      const cur = new Date(sy, sm - 1, sd, 12, 0, 0);
      const end = new Date(ey, em - 1, ed, 12, 0, 0);

      let safety = 0;
      while (cur <= end && safety < 90) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, "0");
        const d = String(cur.getDate()).padStart(2, "0");
        rangeDates.push(`${y}-${m}-${d}`);
        cur.setDate(cur.getDate() + 1);
        safety++;
      }

      rangeDates.forEach((rDate, idx) => {
        expanded.push({
          ...rawDoc,
          id: idx === 0 ? rawDoc.id : `${rawDoc.id}_range_${idx}`,
          baseId: rawDoc.id,
          Datum: rDate,
          rangeIndex: idx,
          isRangeOccurrence: idx > 0,
          rangeTotalDays: rangeDates.length,
        });
      });
      return;
    }

    // 2. Einmaliger Termin ohne Wiederholung
    if (!rawDoc.Wiederholung || rawDoc.Wiederholung === "none") {
      expanded.push({
        ...rawDoc,
        baseId: rawDoc.id,
      });
      return;
    }

    // 3. Serientermin
    const recurrence = rawDoc.Wiederholung;
    const duration = rawDoc.WiederholungDauer || "forever";
    const recurringDates = calculateRecurrenceDates(
      rawDoc.Datum,
      recurrence,
      duration,
    );

    recurringDates.forEach((recDate, idx) => {
      expanded.push({
        ...rawDoc,
        id: idx === 0 ? rawDoc.id : `${rawDoc.id}_occ_${idx}`,
        baseId: rawDoc.id,
        Datum: recDate,
        occurrenceIndex: idx,
        isRecurringOccurrence: idx > 0,
      });
    });
  });
  return expanded;
}

function initEventsListener() {
  const colRef = collection(db, "data_termine");
  onSnapshot(
    colRef,
    (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        if (docSnap.id === "Ersteller" || docSnap.id === "Art") return;
        const data = docSnap.data();
        const title = data.Titel || data.titel;
        if (!title) return;

        let datum = (data.Datum || data.datum || "").trim();
        if (datum.includes("-")) {
          const p = datum.split("-");
          if (p.length === 3) {
            datum = `${p[0]}-${String(p[1]).padStart(2, "0")}-${String(p[2]).padStart(2, "0")}`;
          }
        }

        list.push({
          id: docSnap.id,
          baseId: docSnap.id,
          ...data,
          Titel: title,
          Datum: datum,
          Kategorie: data.Kategorie || data.Art || "Sonstiges",
          Ersteller: data.Ersteller || data.ersteller || "Unbekannt",
        });
      });

      // Benachrichtigung bei echten Live-Änderungen (kein Fluten beim Start oder Cache-Wechsel)
      if (!initialEventsLoaded) {
        snapshot.forEach((docSnap) => knownEventDocIds.add(docSnap.id));
        if (!snapshot.metadata.fromCache) {
          initialEventsLoaded = true;
        }
      } else {
        if (
          !snapshot.metadata.hasPendingWrites &&
          !snapshot.metadata.fromCache
        ) {
          snapshot.docChanges().forEach((change) => {
            const item = change.doc.data();
            if (
              change.doc.id === "Ersteller" ||
              change.doc.id === "Art" ||
              !item.Titel
            )
              return;

            const createdMs =
              item.createdAt && item.createdAt.toMillis
                ? item.createdAt.toMillis()
                : Date.now();
            const isRecent = Date.now() - createdMs < 3 * 60 * 1000;

            if (
              change.type === "added" &&
              !knownEventDocIds.has(change.doc.id)
            ) {
              knownEventDocIds.add(change.doc.id);
              if (isRecent) {
                sendLocalNotification(
                  `Neuer Termin! 📅`,
                  `${item.Ersteller || "Jemand"} hat '${item.Titel}' (${item.Datum}) eingetragen.`,
                );
              }
            } else if (
              change.type === "modified" &&
              item.lastAction === "update"
            ) {
              if (isRecent) {
                sendLocalNotification(
                  `Termin aktualisiert 🔄`,
                  `'${item.Titel}' wurde aktualisiert.`,
                );
              }
            } else if (change.type === "removed") {
              knownEventDocIds.delete(change.doc.id);
            }
          });
        }
      }

      isInitialLoad = false;
      rawEvents = list;
      allEvents = expandEventInstances(rawEvents);

      renderCalendarWidget();
      filterAndRender();
      updateTasksBadge();
      checkUpcomingReminders();

      if (currentDetailData) {
        const refreshed = allEvents.find(
          (e) =>
            e.id === currentDetailData.id ||
            e.baseId === currentDetailData.baseId,
        );
        if (refreshed) {
          currentDetailData = refreshed;
          showEventDetails(refreshed);
        }
      }

      window.firebaseDataReceived = true;
      if (typeof window.attemptHideSplash === "function")
        window.attemptHideSplash();
    },
    (error) => {
      console.error("Fehler beim Laden der Termine:", error);
      window.firebaseDataReceived = true;
      if (typeof window.attemptHideSplash === "function")
        window.attemptHideSplash();
    },
  );
}

// ==========================================
// 6. Datums- & Countdown-Helfer
// ==========================================
function getCountdownInfo(dateStr) {
  if (!dateStr) return { badgeText: "", badgeClass: "past", daysDiff: -999 };

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const parts = dateStr.split("-");
  if (parts.length !== 3)
    return { badgeText: "", badgeClass: "past", daysDiff: -999 };

  const eventDate = new Date(
    parseInt(parts[0]),
    parseInt(parts[1]) - 1,
    parseInt(parts[2]),
  );
  eventDate.setHours(0, 0, 0, 0);

  const diffTime = eventDate.getTime() - now.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { badgeText: "HEUTE", badgeClass: "today", daysDiff: 0 };
  } else if (diffDays === 1) {
    return { badgeText: "MORGEN", badgeClass: "tomorrow", daysDiff: 1 };
  } else if (diffDays > 1 && diffDays <= 7) {
    return {
      badgeText: `In ${diffDays} Tagen`,
      badgeClass: "upcoming",
      daysDiff: diffDays,
    };
  } else if (diffDays > 7 && diffDays <= 30) {
    const weeks = Math.round(diffDays / 7);
    return {
      badgeText: `In ${weeks} Woche${weeks > 1 ? "n" : ""}`,
      badgeClass: "upcoming",
      daysDiff: diffDays,
    };
  } else if (diffDays > 30) {
    return {
      badgeText: `In ${diffDays} Tagen`,
      badgeClass: "upcoming",
      daysDiff: diffDays,
    };
  } else {
    return { badgeText: "Vergangen", badgeClass: "past", daysDiff: diffDays };
  }
}

function formatDateObj(dateStr) {
  if (!dateStr || typeof dateStr !== "string" || !dateStr.includes("-")) {
    return {
      day: "--",
      monthShort: "---",
      weekdayShort: "---",
      formattedLong: "--",
    };
  }
  const parts = dateStr.split("-");
  const year = parseInt(parts[0]) || 2026;
  const month = (parseInt(parts[1]) || 1) - 1;
  const day = parseInt(parts[2]) || 1;
  const dateObj = new Date(year, month, day);

  return {
    day: String(day).padStart(2, "0"),
    monthShort: MONTH_NAMES_SHORT[dateObj.getMonth()] || "",
    weekdayShort: WEEKDAY_NAMES_SHORT[dateObj.getDay()] || "",
    formattedLong: `${WEEKDAY_NAMES_LONG[dateObj.getDay()] || ""}, ${day}. ${MONTH_NAMES_LONG[dateObj.getMonth()] || ""} ${year}`,
  };
}

// ==========================================
// 7. Termine Rendern & Filtern
// ==========================================
function renderEvents(events) {
  const container = document.getElementById("event-list-container");
  container.innerHTML = "";

  if (events.length === 0) {
    if (selectedCalendarDate) {
      const formatted = formatDateObj(selectedCalendarDate).formattedLong;
      container.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); margin-top: 25px; padding: 24px 16px; background: rgba(255, 255, 255, 0.03); border-radius: 20px; border: 1px dashed rgba(255, 255, 255, 0.12);">
                <div style="font-size: 2.6rem; margin-bottom: 8px; opacity: 0.85;">🗓️</div>
                <h3 style="color: white; margin: 0 0 4px 0; font-size: 1.1rem;">Keine Termine am ${formatted}</h3>
                <p style="font-size: 0.85rem; margin: 0 0 16px 0; color: #94a3b8;">Möchtest du für diesen Tag etwas mit der Gruppe planen?</p>
                <button type="button" class="btn-day-add-event" style="max-width: 280px; margin: 0 auto;" onclick="window.openNewEventModal('${selectedCalendarDate}')">
                  ➕ Termin für diesen Tag erstellen
                </button>
            </div>
        `;
    } else {
      container.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); margin-top: 45px; padding: 20px;">
                <div style="font-size: 2.8rem; margin-bottom: 12px; opacity: 0.7;">📅</div>
                <h3 style="color: white; margin: 0 0 6px 0;">Keine Termine gefunden</h3>
                <p style="font-size: 0.85rem; margin: 0 0 16px 0;">Plane einen neuen Termin für die Gruppe!</p>
                <button type="button" class="btn-day-add-event" style="max-width: 260px; margin: 0 auto;" onclick="window.openNewEventModal()">
                  ➕ Neuen Termin anlegen
                </button>
            </div>
        `;
    }
    return;
  }

  events.forEach((item) => {
    const card = document.createElement("div");
    const countdown = getCountdownInfo(item.Datum);
    const isPast = countdown.daysDiff < 0;
    card.className = `event-card ${isPast ? "past-event" : ""}`;
    card.onclick = () => showEventDetails(item);

    const dateParts = formatDateObj(item.Datum);
    const isAllDay = item.isAllDay || !item.Uhrzeit;
    const timeStr = isAllDay
      ? " • ☀️ Ganztägig"
      : item.Uhrzeit
        ? ` • ⏰ ${item.Uhrzeit} Uhr`
        : "";
    const locationStr = item.Ort
      ? `<span class="event-location">📍 ${item.Ort}</span>`
      : "";

    const rsvp = item.Teilnehmer || {};
    const yesMembers = Object.keys(rsvp).filter((name) => rsvp[name] === "yes");
    const guests = item.Gäste || { adults: 0, children: 0 };
    const gAdults = parseInt(guests.adults) || 0;
    const gChildren = parseInt(guests.children) || 0;

    const adultYesCount =
      yesMembers.filter((n) => !isChild(n)).length + gAdults;
    const childYesCount =
      yesMembers.filter((n) => isChild(n)).length + gChildren;
    const totalParticipants = adultYesCount + childYesCount;

    let participantStackHtml = "";
    if (totalParticipants > 0) {
      const maxPreview = 3;
      const avatarsHtml = yesMembers
        .slice(0, maxPreview)
        .map(
          (name) => `
                <img src="avatars/${name}.webp" onerror="this.onerror=null; this.src='logo.png';" class="participant-mini" alt="${name}">
            `,
        )
        .join("");

      let countLabel = `${totalParticipants} dabei`;
      if (item.Kategorie === "Urlaub / Abwesend") {
        countLabel = `${totalParticipants} abwesend`;
      } else if (adultYesCount > 0 && childYesCount > 0) {
        countLabel = `${totalParticipants} dabei (${adultYesCount}E • ${childYesCount}K)`;
      } else if (adultYesCount > 0) {
        countLabel = `${totalParticipants} Erw.`;
      } else if (childYesCount > 0) {
        countLabel = `${totalParticipants} Kinder`;
      }

      participantStackHtml = `
                <div class="participant-stack">
                    ${avatarsHtml}
                    <span class="participant-count-badge">${countLabel}</span>
                </div>
            `;
    }

    let birthdayBadgeHtml = "";
    if (item.Kategorie === "Geburtstag" && item.Geburtsjahr) {
      const evYear = parseInt(
        item.Datum ? item.Datum.split("-")[0] : new Date().getFullYear(),
      );
      const bYear = parseInt(item.Geburtsjahr);
      if (evYear && bYear && evYear >= bYear) {
        const age = evYear - bYear;
        const isRound =
          age % 10 === 0 ||
          age === 18 ||
          age === 25 ||
          age === 75 ||
          age === 85 ||
          age === 95;
        birthdayBadgeHtml = `<span class="birthday-age-pill ${isRound ? "round-jubilee" : ""}" title="${age}. Geburtstag (Geb. ${bYear})">🎂 ${age}. Geb.</span>`;
      }
    }

    const catStyle = getCategoryColor(item.Kategorie);
    const catIcon = catStyle.icon ? `${catStyle.icon} ` : "";
    const dateRangeBadgeHtml =
      item.Kategorie === "Urlaub / Abwesend" &&
      item.Enddatum &&
      item.Enddatum > item.Datum
        ? `<span class="event-tag" style="color: ${catStyle.color}; background: ${catStyle.bg}; border: 1px solid ${catStyle.border}; font-weight: 700;">🏖️ Bis ${formatDateObj(item.Enddatum).day}.${formatDateObj(item.Enddatum).monthShort}</span>`
        : "";

    card.innerHTML = `
            <div class="event-date-box">
                <span class="event-date-weekday">${dateParts.weekdayShort}</span>
                <span class="event-date-day">${dateParts.day}</span>
                <span class="event-date-month">${dateParts.monthShort}</span>
            </div>
            <div class="event-info">
                <div class="event-title-row">
                    <h3 class="event-title">${item.Titel}</h3>
                    ${countdown.badgeText ? `<span class="countdown-badge ${countdown.badgeClass}">${countdown.badgeText}</span>` : ""}
                </div>
                <div class="event-meta">
                    <span class="event-tag" style="color: ${catStyle.color}; background: ${catStyle.bg}; border: 1px solid ${catStyle.border}; font-weight: 700;">${catIcon}${item.Kategorie || "Essen"}</span>
                    ${dateRangeBadgeHtml}
                    ${birthdayBadgeHtml}
                    ${item.Wiederholung && item.Wiederholung !== "none" ? '<span class="event-recurrence-icon" title="Serientermin">🔁</span>' : ""}
                    ${locationStr}
                    <span>${timeStr}</span>
                </div>
            </div>
            <div class="event-card-right">
                <img src="avatars/${item.Ersteller}.webp" onerror="this.onerror=null; this.src='logo.png';" class="author-avatar-img" alt="${item.Ersteller}">
                ${participantStackHtml}
            </div>
        `;
    container.appendChild(card);
  });

  if (selectedCalendarDate) {
    const formatted = formatDateObj(selectedCalendarDate).formattedLong;
    const addMoreBtn = document.createElement("button");
    addMoreBtn.type = "button";
    addMoreBtn.className = "btn-day-add-event";
    addMoreBtn.innerHTML = `<span>➕</span> <span>Weiteren Termin am ${formatted} anlegen</span>`;
    addMoreBtn.onclick = () => window.openNewEventModal(selectedCalendarDate);
    container.appendChild(addMoreBtn);
  }
}

function getISOWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

function renderCalendarWidget() {
  const titleEl = document.getElementById("calendar-month-year");
  const gridEl = document.getElementById("calendar-days-grid");
  if (!titleEl || !gridEl) return;

  titleEl.textContent = `${MONTH_NAMES_LONG[calCurrentMonth] || ""} ${calCurrentYear}`;

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  gridEl.innerHTML = "";

  // Alle Tage der Monatsansicht vorbereiten
  const firstDay = new Date(calCurrentYear, calCurrentMonth, 1);
  const startDayOfWeek = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(
    calCurrentYear,
    calCurrentMonth + 1,
    0,
  ).getDate();
  const daysInPrevMonth = new Date(
    calCurrentYear,
    calCurrentMonth,
    0,
  ).getDate();

  const allGridDays = [];

  // Tage des vorherigen Monats
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    allGridDays.push({
      dateObj: new Date(calCurrentYear, calCurrentMonth - 1, d),
      dayNum: d,
      isCurrentMonth: false,
    });
  }

  // Tage des aktuellen Monats
  for (let d = 1; d <= daysInMonth; d++) {
    allGridDays.push({
      dateObj: new Date(calCurrentYear, calCurrentMonth, d),
      dayNum: d,
      isCurrentMonth: true,
    });
  }

  // Tage des nächsten Monats
  const nextPadding =
    allGridDays.length % 7 === 0 ? 0 : 7 - (allGridDays.length % 7);
  for (let d = 1; d <= nextPadding; d++) {
    allGridDays.push({
      dateObj: new Date(calCurrentYear, calCurrentMonth + 1, d),
      dayNum: d,
      isCurrentMonth: false,
    });
  }

  // Wochenweise rendern (KW-Spalte links + 7 Wochentage)
  for (let w = 0; w < allGridDays.length; w += 7) {
    const mondayDay = allGridDays[w];
    const kwNum = getISOWeekNumber(mondayDay.dateObj);

    // KW-Zelle
    const kwCell = document.createElement("div");
    kwCell.className = "calendar-kw-cell";
    kwCell.title = `Kalenderwoche ${kwNum}`;
    kwCell.textContent = kwNum;
    gridEl.appendChild(kwCell);

    // 7 Wochentags-Zellen
    for (let dIdx = 0; dIdx < 7; dIdx++) {
      const dayInfo = allGridDays[w + dIdx];
      const dateStr = `${dayInfo.dateObj.getFullYear()}-${String(dayInfo.dateObj.getMonth() + 1).padStart(2, "0")}-${String(dayInfo.dayNum).padStart(2, "0")}`;

      const cell = document.createElement("div");

      if (!dayInfo.isCurrentMonth) {
        cell.className = "calendar-day-cell other-month";
        cell.innerHTML = `<span>${dayInfo.dayNum}</span>`;
      } else {
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === selectedCalendarDate;
        const eventsOnDay = allEvents.filter(
          (ev) => ev && ev.Datum === dateStr,
        );
        const hasEvents = eventsOnDay.length > 0;

        let classes = ["calendar-day-cell"];
        if (isToday) classes.push("today");
        if (isSelected) classes.push("selected");
        if (hasEvents) classes.push("has-events");

        cell.className = classes.join(" ");
        cell.innerHTML = `<span class="cal-day-num">${dayInfo.dayNum}</span>`;
        cell.onclick = () => window.selectCalendarDay(dateStr);

        if (hasEvents) {
          const dayCats = [
            ...new Set(eventsOnDay.map((ev) => ev.Kategorie || "Sonstiges")),
          ];
          const primaryCatColor = getCategoryColor(dayCats[0]);

          if (!isSelected) {
            if (dayCats.length === 1) {
              cell.style.background = primaryCatColor.bg;
            } else {
              const step = 100 / dayCats.length;
              const gradientStops = dayCats
                .map((cat, idx) => {
                  const bg = getCategoryColor(cat).bg;
                  const start =
                    idx === 0 ? "0%" : `${(idx * step + 1).toFixed(1)}%`;
                  const end =
                    idx === dayCats.length - 1
                      ? "100%"
                      : `${((idx + 1) * step - 1).toFixed(1)}%`;
                  return `${bg} ${start}, ${bg} ${end}`;
                })
                .join(", ");
              cell.style.background = `linear-gradient(135deg, ${gradientStops})`;
            }
          }

          const iconsRow = document.createElement("div");
          iconsRow.className = "calendar-day-icons";

          const uniqueIcons = [];
          eventsOnDay.forEach((ev) => {
            const catStyle = getCategoryColor(ev.Kategorie);
            const icon = catStyle.icon || "📌";
            if (!uniqueIcons.includes(icon)) uniqueIcons.push(icon);
          });

          uniqueIcons.slice(0, 2).forEach((icon) => {
            const iconSpan = document.createElement("span");
            iconSpan.className = "cal-day-icon";
            iconSpan.textContent = icon;
            iconsRow.appendChild(iconSpan);
          });

          if (uniqueIcons.length > 2) {
            const moreSpan = document.createElement("span");
            moreSpan.className = "cal-day-more";
            moreSpan.textContent = `+${uniqueIcons.length - 2}`;
            iconsRow.appendChild(moreSpan);
          }

          cell.appendChild(iconsRow);
        }
      }

      gridEl.appendChild(cell);
    }
  }
}
window.renderCalendarWidget = renderCalendarWidget;

window.navCalendarMonth = function (delta) {
  calCurrentMonth += delta;
  if (calCurrentMonth > 11) {
    calCurrentMonth = 0;
    calCurrentYear += 1;
  } else if (calCurrentMonth < 0) {
    calCurrentMonth = 11;
    calCurrentYear -= 1;
  }
  renderCalendarWidget();
};

window.navCalendarToday = function () {
  const today = new Date();
  calCurrentYear = today.getFullYear();
  calCurrentMonth = today.getMonth();
  selectedCalendarDate = null;
  renderCalendarWidget();
  filterAndRender();
};

window.clearDateFilter = function () {
  selectedCalendarDate = null;
  renderCalendarWidget();
  filterAndRender();
};

window.selectCalendarDay = function (dateStr) {
  if (selectedCalendarDate === dateStr) {
    selectedCalendarDate = null;
  } else {
    selectedCalendarDate = dateStr;
  }
  renderCalendarWidget();
  filterAndRender();
};

window.setTimeframeFilter = function (timeframeKey, el) {
  selectedTimeframe = timeframeKey;
  document
    .querySelectorAll("#timeframe-container .timeframe-chip")
    .forEach((c) => c.classList.remove("active"));
  if (el) el.classList.add("active");
  selectedCalendarDate = null;
  renderCalendarWidget();
  filterAndRender();
};

function filterAndRender() {
  const searchEl = document.getElementById("event-search");
  const sortEl = document.getElementById("event-sort");
  const sectionTitleEl = document.getElementById("events-section-title");
  const clearBtn = document.getElementById("btn-clear-date-filter");

  const query = (searchEl ? searchEl.value : "").toLowerCase().trim();
  const sortType = sortEl ? sortEl.value : "upcoming";

  const now = new Date();
  const currentYear = now.getFullYear();
  const nowStr = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Bounds Berechnungen für Zeiträume
  const future30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const future30Str = `${future30.getFullYear()}-${String(future30.getMonth() + 1).padStart(2, "0")}-${String(future30.getDate()).padStart(2, "0")}`;

  const future60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const future60Str = `${future60.getFullYear()}-${String(future60.getMonth() + 1).padStart(2, "0")}-${String(future60.getDate()).padStart(2, "0")}`;

  const endOfYearStr = `${currentYear}-12-31`;
  const nextYear = currentYear + 1;
  const startNextYearStr = `${nextYear}-01-01`;
  const endNextYearStr = `${nextYear}-12-31`;

  let filtered = [];

  if (selectedCalendarDate) {
    // Bestimmter Tag im Kalender ausgewählt
    filtered = allEvents.filter(
      (ev) => ev && ev.Datum === selectedCalendarDate,
    );
    const formatted = formatDateObj(selectedCalendarDate).formattedLong;
    if (sectionTitleEl) sectionTitleEl.textContent = `Termine am ${formatted}`;
    if (clearBtn) {
      clearBtn.style.display = "inline-block";
      clearBtn.textContent = "✕ Filter zurücksetzen";
    }
  } else {
    // Zeitraum-Filterung (oder Vollsuche bei Query/Sortierung)
    filtered = allEvents.filter((ev) => {
      if (!ev || !ev.Datum) return false;
      if (query || (sortType !== "upcoming" && selectedTimeframe === "all"))
        return true;

      if (selectedTimeframe === "30d") {
        return ev.Datum >= nowStr && ev.Datum <= future30Str;
      } else if (selectedTimeframe === "60d") {
        return ev.Datum >= nowStr && ev.Datum <= future60Str;
      } else if (selectedTimeframe === "this_year") {
        return ev.Datum >= nowStr && ev.Datum <= endOfYearStr;
      } else if (selectedTimeframe === "next_year") {
        return ev.Datum >= startNextYearStr && ev.Datum <= endNextYearStr;
      } else {
        // 'all'
        return ev.Datum >= nowStr;
      }
    });

    if (sectionTitleEl) {
      const timeframeLabels = {
        "30d": "nächste 30 Tage",
        "60d": "nächste 60 Tage",
        this_year: `dieses Jahr ${currentYear}`,
        next_year: `nächstes Jahr ${nextYear}`,
        all: "alle anstehenden",
      };
      const tfText = timeframeLabels[selectedTimeframe] || "anstehend";
      sectionTitleEl.textContent = query
        ? `Suchergebnisse (${filtered.length})`
        : `Anstehend (${tfText} • ${filtered.length})`;
    }
    if (clearBtn) clearBtn.style.display = "none";
  }

  // Filter nach Kategorie & Query
  filtered = filtered.filter((ev) => {
    if (!ev) return false;
    const matchesCategory =
      selectedCategory === "Alle" || ev.Kategorie === selectedCategory;
    const matchesQuery =
      !query ||
      (ev.Titel && ev.Titel.toLowerCase().includes(query)) ||
      (ev.Ort && ev.Ort.toLowerCase().includes(query)) ||
      (ev.Ersteller && ev.Ersteller.toLowerCase().includes(query)) ||
      (ev.Beschreibung && ev.Beschreibung.toLowerCase().includes(query));
    return matchesCategory && matchesQuery;
  });

  // Sortierung
  filtered.sort((a, b) => {
    const dateA = a.Datum || "9999-99-99";
    const dateB = b.Datum || "9999-99-99";
    const timeA = a.Uhrzeit || "00:00";
    const timeB = b.Uhrzeit || "00:00";
    const fullA = `${dateA}T${timeA}`;
    const fullB = `${dateB}T${timeB}`;

    if (sortType === "upcoming") {
      return fullA.localeCompare(fullB);
    } else if (sortType === "newest") {
      const tA =
        a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      const tB =
        b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return tB - tA;
    } else if (sortType === "alpha") {
      return (a.Titel || "").localeCompare(b.Titel || "", "de");
    }
    return 0;
  });

  renderEvents(filtered);
}
window.filterAndRender = filterAndRender;

window.selectCategory = function (name, el) {
  selectedCategory = name;
  document
    .querySelectorAll("#filter-container .filter-chip")
    .forEach((c) => c.classList.remove("active"));
  if (el) el.classList.add("active");
  filterAndRender();
};

// ==========================================
// 8. Event Detail Modal & RSVP
// ==========================================
function showEventDetails(data) {
  currentDetailData = data;
  const overlay = document.getElementById("event-detail-overlay");
  const countdown = getCountdownInfo(data.Datum);

  document.getElementById("detail-title").textContent = data.Titel;

  const catTag = document.getElementById("detail-category-tag");
  const catColor = getCategoryColor(data.Kategorie);
  catTag.textContent = `${catColor.icon ? catColor.icon + " " : ""}${data.Kategorie || "Sonstiges"}`;
  catTag.style.color = catColor.color;
  catTag.style.background = catColor.bg;
  catTag.style.borderColor = catColor.border;
  catTag.style.fontWeight = "700";

  const ageTag = document.getElementById("detail-age-tag");
  if (ageTag) {
    if (data.Kategorie === "Geburtstag" && data.Geburtsjahr) {
      const evYear = parseInt(
        data.Datum ? data.Datum.split("-")[0] : new Date().getFullYear(),
      );
      const bYear = parseInt(data.Geburtsjahr);
      if (evYear && bYear && evYear >= bYear) {
        const age = evYear - bYear;
        const isRound =
          age % 10 === 0 ||
          age === 18 ||
          age === 25 ||
          age === 75 ||
          age === 85 ||
          age === 95;
        ageTag.textContent = isRound
          ? `🎉 ${age}. Geburtstag (Runder Jubeltag!)`
          : `🎂 ${age}. Geburtstag (Geb. ${bYear})`;
        ageTag.className = `age-badge ${isRound ? "round-jubilee" : ""}`;
        ageTag.style.display = "inline-flex";
      } else {
        ageTag.style.display = "none";
      }
    } else {
      ageTag.style.display = "none";
    }
  }

  const recTag = document.getElementById("detail-recurrence-tag");
  if (recTag) {
    const recLabels = {
      weekly: "🔁 Wöchentlich",
      biweekly: "🔁 Alle 2 Wochen",
      monthly: "🔁 Monatlich",
      every2months: "🔁 Alle 2 Monate",
      every3months: "🔁 Alle 3 Monate",
      yearly: "🔁 Jährlich",
    };
    if (data.Wiederholung && recLabels[data.Wiederholung]) {
      recTag.textContent = recLabels[data.Wiederholung];
      recTag.style.display = "inline-flex";
    } else {
      recTag.style.display = "none";
    }
  }

  const dateRangeTag = document.getElementById("detail-daterange-tag");
  if (dateRangeTag) {
    if (
      data.Kategorie === "Urlaub / Abwesend" &&
      data.Enddatum &&
      data.Enddatum > data.Datum
    ) {
      dateRangeTag.textContent = `🏖️ Bis ${formatDateObj(data.Enddatum).day}.${formatDateObj(data.Enddatum).monthShort}`;
      dateRangeTag.style.display = "inline-flex";
      dateRangeTag.style.color = catColor.color;
      dateRangeTag.style.background = catColor.bg;
      dateRangeTag.style.borderColor = catColor.border;
    } else {
      dateRangeTag.style.display = "none";
    }
  }

  const cdContainer = document.getElementById("detail-countdown");
  if (countdown.badgeText) {
    cdContainer.innerHTML = `<span class="countdown-badge ${countdown.badgeClass}" style="font-size: 0.75rem; padding: 4px 10px;">${countdown.badgeText}</span>`;
    cdContainer.style.display = "block";
  } else {
    cdContainer.style.display = "none";
  }

  let dateDisplayStr = formatDateObj(data.Datum).formattedLong;
  if (
    data.Kategorie === "Urlaub / Abwesend" &&
    data.Enddatum &&
    data.Enddatum > data.Datum
  ) {
    dateDisplayStr = `${formatDateObj(data.Datum).day}.${formatDateObj(data.Datum).monthShort} – ${formatDateObj(data.Enddatum).formattedLong}`;
  }

  const isAllDay = data.isAllDay || !data.Uhrzeit;
  document.getElementById("detail-date-str").textContent = dateDisplayStr;
  document.getElementById("detail-time-str").textContent = isAllDay
    ? "☀️ Ganztägig"
    : `${data.Uhrzeit} Uhr`;
  document.getElementById("detail-location-str").textContent =
    data.Ort || "Wird noch bekanntgegeben";
  document.getElementById("detail-author-str").textContent =
    data.Ersteller || "Unbekannt";

  const authorAvatarImg = document.getElementById("detail-author-avatar");
  if (authorAvatarImg) {
    if (data.Ersteller) {
      authorAvatarImg.src = `avatars/${data.Ersteller}.webp`;
      authorAvatarImg.onerror = () => {
        authorAvatarImg.src = "logo.png";
      };
    } else {
      authorAvatarImg.src = "logo.png";
    }
  }

  const linkBtn = document.getElementById("btn-open-link");
  const einkehrBtn = document.getElementById("btn-open-einkehr-rating");
  const actionsCont = document.getElementById("detail-actions-container");
  const targetLink = data.OrtLink || data.Link;

  let hasAction = false;
  if (targetLink && linkBtn) {
    linkBtn.href = targetLink;
    linkBtn.style.display = "flex";
    hasAction = true;
  } else if (linkBtn) {
    linkBtn.style.display = "none";
  }

  const lokalBtn =
    document.getElementById("btn-open-lokal-rating") ||
    document.getElementById("btn-open-einkehr-rating");

  if (lokalBtn) {
    if (data.Ort || data.Titel) {
      lokalBtn.style.display = "flex";
      hasAction = true;
    } else {
      lokalBtn.style.display = "none";
    }
  }

  if (actionsCont) {
    actionsCont.style.display = hasAction ? "flex" : "none";
  }

  renderDetailRSVP(data);
  renderDetailChecklist(data);

  const notesSection = document.getElementById("detail-notes-section");
  const notesEl = document.getElementById("detail-notes");
  if (data.Beschreibung && data.Beschreibung.trim() !== "") {
    notesEl.textContent = data.Beschreibung;
    notesSection.style.display = "block";
  } else {
    notesSection.style.display = "none";
  }

  overlay.style.display = "flex";
}
window.showEventDetails = showEventDetails;

window.rateCurrentEventLocation = function () {
  if (!currentDetailData) return;
  const ev = currentDetailData;
  window.closeEventDetails();
  const lokalTabBtn =
    document.querySelector(".tab-item[onclick*='lokale']") ||
    document.querySelector(".tab-item[onclick*='einkehr']");
  if (lokalTabBtn && typeof window.switchTab === "function") {
    window.switchTab("lokale", lokalTabBtn);
  }
  window.openLokalModal(null, {
    name: ev.Ort || ev.Titel || "",
    ort: ev.Ort || "",
    datum: ev.Datum || "",
    link: ev.OrtLink || ev.Link || "",
    author: ev.Ersteller || "",
    teilnehmer: ev.Teilnehmer || {},
  });
};

let currentGuestsData = { adults: 0, children: 0 };

window.openGuestsModal = function () {
  if (!currentDetailData) return;
  const g = currentDetailData.Gäste || { adults: 0, children: 0 };
  currentGuestsData = {
    adults: parseInt(g.adults) || 0,
    children: parseInt(g.children) || 0,
  };

  document.getElementById("guest-adults-count").textContent =
    currentGuestsData.adults;
  document.getElementById("guest-children-count").textContent =
    currentGuestsData.children;
  document.getElementById("guests-modal-container").style.display = "flex";
};

window.closeGuestsModal = function () {
  document.getElementById("guests-modal-container").style.display = "none";
};

window.changeGuestCount = function (type, delta) {
  if (type === "adults") {
    currentGuestsData.adults = Math.max(0, currentGuestsData.adults + delta);
    document.getElementById("guest-adults-count").textContent =
      currentGuestsData.adults;
  } else if (type === "children") {
    currentGuestsData.children = Math.max(
      0,
      currentGuestsData.children + delta,
    );
    document.getElementById("guest-children-count").textContent =
      currentGuestsData.children;
  }
};

window.saveGuestsModal = async function () {
  if (!currentDetailData) return;
  window.closeGuestsModal();
  window.showLoading(true, "Gäste werden gespeichert...");

  const targetDocId = currentDetailData.baseId || currentDetailData.id;
  try {
    await ensureAuth();
    await setDoc(doc(db, "data_termine", targetDocId), {
      ...currentDetailData,
      id: targetDocId,
      Gäste: currentGuestsData,
      lastAction: "update",
    });
  } catch (err) {
    console.error("Fehler beim Speichern der Gäste:", err);
    window.showAppModal(
      "Fehler",
      "Konnte Gäste nicht speichern: " + err.message,
    );
  } finally {
    window.showLoading(false);
  }
};

function renderDetailRSVP(data) {
  const container = document.getElementById("rsvp-members-container");
  container.innerHTML = "";
  const rsvp = data.Teilnehmer || {};

  const rsvpTitle = document.getElementById("detail-rsvp-title");
  if (rsvpTitle) {
    rsvpTitle.textContent =
      data.Kategorie === "Urlaub / Abwesend"
        ? "🏖️ Wer ist abwesend?"
        : "👥 Wer ist dabei?";
  }

  const guests = data.Gäste || { adults: 0, children: 0 };
  const gAdults = parseInt(guests.adults) || 0;
  const gChildren = parseInt(guests.children) || 0;

  const yesMembers = Object.keys(rsvp).filter((name) => rsvp[name] === "yes");
  const adultYesCount = yesMembers.filter((n) => !isChild(n)).length + gAdults;
  const childYesCount = yesMembers.filter((n) => isChild(n)).length + gChildren;
  const totalYesCount = adultYesCount + childYesCount;

  const totalEl = document.getElementById("rsvp-total-count");
  const adultsEl = document.getElementById("rsvp-adults-count");
  const childrenEl = document.getElementById("rsvp-children-count");

  if (totalEl) totalEl.textContent = totalYesCount;
  if (adultsEl) adultsEl.textContent = adultYesCount;
  if (childrenEl) childrenEl.textContent = childYesCount;

  // Nur tatsächlich teilnehmende Gruppenmitglieder auflisten (Read-Only)
  if (yesMembers.length === 0 && gAdults + gChildren === 0) {
    container.innerHTML = `
            <div style="grid-column: 1 / -1; color: #94a3b8; font-size: 0.82rem; font-style: italic; padding: 4px 0;">
                Noch keine Teilnehmer ausgewählt. (Über ✏️ Bearbeiten anpassen)
            </div>
        `;
    return;
  }

  yesMembers.forEach((name) => {
    const card = document.createElement("div");
    card.className = "rsvp-card status-yes rsvp-card-readonly";

    const child = isChild(name);
    const roleBadge = child
      ? '<span class="rsvp-role-badge child">Kind</span>'
      : '<span class="rsvp-role-badge adult">Erw.</span>';

    card.innerHTML = `
            <img src="avatars/${name}.webp" onerror="this.onerror=null; this.src='logo.png';" class="rsvp-card-avatar" alt="${name}">
            <div class="rsvp-info">
                <span class="rsvp-name">${name}</span>
                ${roleBadge}
            </div>
            <span class="rsvp-badge-icon">✓</span>
        `;
    container.appendChild(card);
  });

  // Gast-Karte für zusätzliche Gäste (Read-Only)
  const totalGuests = gAdults + gChildren;
  if (totalGuests > 0) {
    const guestCard = document.createElement("div");
    guestCard.className = "rsvp-card rsvp-card-guest rsvp-card-readonly";
    guestCard.innerHTML = `
            <div style="font-size: 1.5rem;">🎉</div>
            <div class="rsvp-info">
                <span class="rsvp-name" style="color: #34d399;">Gäste (${totalGuests})</span>
                <span style="font-size: 0.68rem; color: #cbd5e1;">${gAdults} Erw. • ${gChildren} Ki.</span>
            </div>
            <span class="rsvp-badge-icon">✓</span>
        `;
    container.appendChild(guestCard);
  }
}

function renderDetailChecklist(data) {
  const section = document.getElementById("detail-checklist-section");
  const container = document.getElementById("detail-checklist-items");
  const items = data.Mitbringliste || [];

  if (items.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  container.innerHTML = items
    .map(
      (item, idx) => `
        <div class="checklist-item-row ${item.checked ? "checked" : ""}" onclick="window.toggleEventTask(${idx})">
            <div class="checklist-checkbox">✓</div>
            <span class="checklist-name">${item.name || item}</span>
            <span class="checklist-status-label">${item.checked ? "Erledigt" : "Fehlt noch"}</span>
        </div>
    `,
    )
    .join("");
}

window.toggleEventTask = async function (idx) {
  if (!currentDetailData) return;
  const items = [...(currentDetailData.Mitbringliste || [])];
  if (!items[idx]) return;

  items[idx].checked = !items[idx].checked;
  const targetDocId = currentDetailData.baseId || currentDetailData.id;
  try {
    await ensureAuth();
    await setDoc(doc(db, "data_termine", targetDocId), {
      ...currentDetailData,
      id: targetDocId,
      Mitbringliste: items,
      lastAction: "update",
    });
  } catch (err) {
    console.error("Fehler beim Abhaken der Aufgabe:", err);
  }
};

window.closeEventDetails = function () {
  document.getElementById("event-detail-overlay").style.display = "none";
  currentDetailData = null;
};

// ==========================================
// 9. Aufgaben & Anschaffungen ("Was fehlt?") Tab
// ==========================================
let currentAufgabenSubTab = "anschaffungen";
window.currentAufgabenSubTab = currentAufgabenSubTab;

function switchAufgabenSubTab(subTab) {
  currentAufgabenSubTab = subTab;
  window.currentAufgabenSubTab = subTab;

  const btnTasks = document.getElementById("seg-btn-tasks");
  const btnPurchases = document.getElementById("seg-btn-purchases");
  const viewTasks = document.getElementById("subview-tasks");
  const viewPurchases = document.getElementById("subview-purchases");
  const subTitle = document.getElementById("header-sub-title");

  if (subTab === "anschaffungen") {
    if (btnTasks) btnTasks.classList.remove("active");
    if (btnPurchases) btnPurchases.classList.add("active");
    if (viewTasks) viewTasks.style.display = "none";
    if (viewPurchases) {
      viewPurchases.style.display = "block";
      if (typeof window.renderPurchasesView === "function") {
        window.renderPurchasesView();
      }
    }
    if (subTitle) subTitle.textContent = "Offene Anschaffungen & Budget";
  } else {
    if (btnPurchases) btnPurchases.classList.remove("active");
    if (btnTasks) btnTasks.classList.add("active");
    if (viewPurchases) viewPurchases.style.display = "none";
    if (viewTasks) {
      viewTasks.style.display = "block";
      renderAllTasks();
    }
    if (subTitle) subTitle.textContent = "Was fehlt noch für die Termine";
  }
}
window.switchAufgabenSubTab = switchAufgabenSubTab;

function renderAllTasks() {
  const container = document.getElementById("all-tasks-container");
  container.innerHTML = "";

  const now = new Date();
  const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const seenBaseIds = new Set();
  const upcomingEvents = [];
  allEvents
    .filter(
      (e) => e.Datum >= nowStr && e.Mitbringliste && e.Mitbringliste.length > 0,
    )
    .sort((a, b) => a.Datum.localeCompare(b.Datum))
    .forEach((ev) => {
      const bId = ev.baseId || ev.id;
      if (!seenBaseIds.has(bId)) {
        seenBaseIds.add(bId);
        upcomingEvents.push(ev);
      }
    });

  if (upcomingEvents.length === 0) {
    container.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); margin-top: 40px;">
                <div style="font-size: 2.5rem; margin-bottom: 10px;">🎒</div>
                <h3 style="color: white; margin: 0 0 6px 0;">Alles erledigt!</h3>
                <p style="font-size: 0.85rem;">Keine offenen Punkte für anstehende Termine.</p>
            </div>
        `;
    return;
  }

  upcomingEvents.forEach((ev) => {
    const card = document.createElement("div");
    card.className = "event-card";
    card.style.flexDirection = "column";
    card.style.alignItems = "stretch";
    card.style.cursor = "default";

    const itemsHtml = ev.Mitbringliste.map(
      (item, idx) => `
            <div class="checklist-item-row ${item.checked ? "checked" : ""}" onclick="window.toggleGlobalTask('${ev.baseId || ev.id}', ${idx})">
                <div class="checklist-checkbox">✓</div>
                <span class="checklist-name">${item.name || item}</span>
                <span class="checklist-status-label">${item.checked ? "Erledigt" : "Fehlt noch"}</span>
            </div>
        `,
    ).join("");

    card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; margin-bottom: 8px;">
                <h4 style="margin: 0; color: var(--accent-color); font-size: 1rem; font-weight: 800;">${ev.Titel}</h4>
                <span style="font-size: 0.75rem; color: #94a3b8;">📅 ${formatDateObj(ev.Datum).formattedLong}</span>
            </div>
            <div>${itemsHtml}</div>
            <button type="button" class="btn-add-item" onclick="window.editEventById('${ev.baseId || ev.id}', true)" style="margin-top: 8px; padding: 8px 12px; font-size: 0.82rem; width: 100%; justify-content: center;">
                ➕ Weiteren Punkt hinzufügen
            </button>
        `;
    container.appendChild(card);
  });
}
window.renderAllTasks = renderAllTasks;

window.editEventById = function (eventId, autoAddNewItem = false) {
  const data = allEvents.find((e) => e.id === eventId || e.baseId === eventId);
  if (!data) return;
  editingEventId = data.baseId || data.id;

  const overlay = document.getElementById("event-form-overlay");
  if (overlay) overlay.style.display = "flex";
  const titleEl = document.getElementById("event-modal-title");
  if (titleEl) titleEl.textContent = "✏️ Termin bearbeiten";

  document.getElementById("event-author").value = data.Ersteller || "";
  document.getElementById("event-author").dispatchEvent(new Event("change"));
  document.getElementById("event-title").value = data.Titel || "";
  document.getElementById("event-date").value = data.Datum || "";
  const endDateInput = document.getElementById("event-end-date");
  if (endDateInput) endDateInput.value = data.Enddatum || "";
  document.getElementById("event-time").value = data.Uhrzeit || "";

  const isAllDay = !!data.isAllDay || !data.Uhrzeit;
  const allDayCheckbox = document.getElementById("event-all-day");
  if (allDayCheckbox) allDayCheckbox.checked = isAllDay;
  const timeGroup = document.getElementById("time-group");
  if (timeGroup) {
    timeGroup.style.opacity = isAllDay ? "0.35" : "1";
    timeGroup.style.pointerEvents = isAllDay ? "none" : "auto";
  }

  document.getElementById("event-location").value = data.Ort || "";
  document.getElementById("event-link").value = data.OrtLink || data.Link || "";
  document.getElementById("event-description").value = data.Beschreibung || "";

  selectedType = data.Kategorie || allCategories[0];
  document
    .querySelectorAll("#event-type-chips .selectable-chip")
    .forEach((c) => {
      c.classList.toggle("selected", c.dataset.name === selectedType);
    });

  const birthYearInput = document.getElementById("event-birth-year");
  if (birthYearInput) birthYearInput.value = data.Geburtsjahr || "";
  updateCategoryDependentFields();

  formParticipants = { ...(data.Teilnehmer || {}) };
  renderFormParticipants();

  formGuests = {
    adults: data.Gäste?.adults || 0,
    children: data.Gäste?.children || 0,
  };
  renderFormGuests();

  const recSelect = document.getElementById("event-recurrence");
  if (recSelect) {
    recSelect.value = data.Wiederholung || "none";
    const recDuration = document.getElementById("event-recurrence-duration");
    if (recDuration) {
      recDuration.value = data.WiederholungDauer || "forever";
      recDuration.style.display = recSelect.value !== "none" ? "block" : "none";
    }
  }

  const builder = document.getElementById("items-builder-container");
  builder.innerHTML = "";
  if (data.Mitbringliste && data.Mitbringliste.length > 0) {
    data.Mitbringliste.forEach((item) => addItemBuilderRow(item.name || item));
  }
  if (autoAddNewItem) {
    addItemBuilderRow("");
    setTimeout(() => {
      const inputs = document.querySelectorAll(
        "#items-builder-container .item-name-input",
      );
      const lastInput = inputs[inputs.length - 1];
      if (lastInput) {
        lastInput.scrollIntoView({ behavior: "smooth", block: "center" });
        lastInput.focus();
      }
    }, 150);
  }

  document.getElementById("submit-event-btn").textContent =
    "Änderungen speichern";
  document.getElementById("cancel-edit-btn").style.display = "block";
  document.getElementById("header-sub-title").textContent = "Termin bearbeiten";

  window.closeEventDetails();
};

window.toggleGlobalTask = async function (eventId, itemIdx) {
  const ev = allEvents.find((e) => e.id === eventId || e.baseId === eventId);
  if (!ev || !ev.Mitbringliste || !ev.Mitbringliste[itemIdx]) return;

  const items = [...ev.Mitbringliste];
  items[itemIdx].checked = !items[itemIdx].checked;

  const targetDocId = ev.baseId || ev.id;
  try {
    await setDoc(doc(db, "data_termine", targetDocId), {
      ...ev,
      id: targetDocId,
      Mitbringliste: items,
      lastAction: "update",
    });
    renderAllTasks();
    updateTasksBadge();
  } catch (e) {
    console.error("Fehler beim Aktualisieren:", e);
  }
};

let cachedUnfinishedTasksCount = 0;
let cachedOpenPurchasesCount = 0;

function updateCombinedBadges() {
  const totalCount = cachedUnfinishedTasksCount + cachedOpenPurchasesCount;

  // Haupt-Badge in der Tab-Bar ("Was fehlt?")
  const mainBadge = document.getElementById("tasks-badge");
  if (mainBadge) {
    mainBadge.textContent = totalCount;
    if (totalCount > 0) mainBadge.classList.add("visible");
    else mainBadge.classList.remove("visible");
  }

  // Altes purchases-badge (falls irgendwo noch vorhanden)
  const oldPurchasesBadge = document.getElementById("purchases-badge");
  if (oldPurchasesBadge) {
    oldPurchasesBadge.textContent = cachedOpenPurchasesCount;
    if (cachedOpenPurchasesCount > 0)
      oldPurchasesBadge.classList.add("visible");
    else oldPurchasesBadge.classList.remove("visible");
  }

  // Sub-Badges im Segmented Switcher
  const segTasks = document.getElementById("seg-badge-tasks");
  if (segTasks) {
    segTasks.textContent = cachedUnfinishedTasksCount;
    segTasks.style.display =
      cachedUnfinishedTasksCount > 0 ? "inline-flex" : "none";
  }

  const segPurchases = document.getElementById("seg-badge-purchases");
  if (segPurchases) {
    segPurchases.textContent = cachedOpenPurchasesCount;
    segPurchases.style.display =
      cachedOpenPurchasesCount > 0 ? "inline-flex" : "none";
  }
}
window.updateCombinedBadges = updateCombinedBadges;

function updateTasksBadge() {
  const nowStr = new Date().toISOString().split("T")[0];
  let unfinishedCount = 0;
  const seenBaseIds = new Set();
  allEvents
    .filter((e) => e.Datum >= nowStr && e.Mitbringliste)
    .forEach((ev) => {
      const bId = ev.baseId || ev.id;
      if (!seenBaseIds.has(bId)) {
        seenBaseIds.add(bId);
        (ev.Mitbringliste || []).forEach((item) => {
          if (!item.checked) unfinishedCount++;
        });
      }
    });

  cachedUnfinishedTasksCount = unfinishedCount;
  updateCombinedBadges();
}

// ==========================================
// 11. Formular Logik (Neu / Bearbeiten)
// ==========================================
function calculateRecurrenceDates(startDateStr, recurrenceType, durationType) {
  if (!recurrenceType || recurrenceType === "none") {
    return [startDateStr];
  }

  const [startYear, startMonth, startDay] = startDateStr.split("-").map(Number);
  const startDate = new Date(startYear, startMonth - 1, startDay, 12, 0, 0);

  let maxMonths = 36;
  if (durationType === "3m") maxMonths = 3;
  else if (durationType === "6m") maxMonths = 6;
  else if (durationType === "1y") maxMonths = 12;
  else if (durationType === "2y") maxMonths = 24;
  else if (durationType === "forever") maxMonths = 60;

  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + maxMonths);

  const dates = [];
  let cur = new Date(startDate);

  if (recurrenceType === "weekly") {
    while (cur <= endDate) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 7);
    }
  } else if (recurrenceType === "biweekly") {
    while (cur <= endDate) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 14);
    }
  } else if (recurrenceType === "monthly") {
    let step = 0;
    while (step <= maxMonths) {
      const targetMonthIndex = startMonth - 1 + step;
      const tempDate = new Date(startYear, targetMonthIndex, 1, 12, 0, 0);
      const daysInMonth = new Date(
        tempDate.getFullYear(),
        tempDate.getMonth() + 1,
        0,
      ).getDate();
      const targetDate = new Date(
        tempDate.getFullYear(),
        tempDate.getMonth(),
        Math.min(startDay, daysInMonth),
        12,
        0,
        0,
      );
      const y = targetDate.getFullYear();
      const m = String(targetDate.getMonth() + 1).padStart(2, "0");
      const d = String(targetDate.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
      step++;
    }
  } else if (
    recurrenceType === "every2months" ||
    recurrenceType === "every3months"
  ) {
    const stepSize = recurrenceType === "every2months" ? 2 : 3;
    const targetWeekday = startDate.getDay(); // 0 = So, 1 = Mo, ..., 5 = Fr, 6 = Sa
    const nth = Math.floor((startDay - 1) / 7) + 1; // 1., 2., 3., 4. oder 5. Wochentag im Monat

    let step = 0;
    while (step <= maxMonths) {
      const targetMonthIndex = startMonth - 1 + step;
      const firstDay = new Date(startYear, targetMonthIndex, 1, 12, 0, 0);
      const tempYear = firstDay.getFullYear();
      const tempMonth = firstDay.getMonth();
      const firstWeekday = firstDay.getDay();
      const dayOffset = (targetWeekday - firstWeekday + 7) % 7;
      let day = 1 + dayOffset + (nth - 1) * 7;

      const daysInTargetMonth = new Date(tempYear, tempMonth + 1, 0).getDate();
      // Falls ein Monat ausnahmsweise keinen 5. Wochentag hat, auf den letzten (4.) fallen
      if (day > daysInTargetMonth) {
        day -= 7;
      }

      const targetDate = new Date(tempYear, tempMonth, day, 12, 0, 0);
      const y = targetDate.getFullYear();
      const m = String(targetDate.getMonth() + 1).padStart(2, "0");
      const d = String(targetDate.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);

      step += stepSize;
    }
  } else if (recurrenceType === "yearly") {
    const yearsCount = Math.max(1, Math.round(maxMonths / 12));
    for (let step = 0; step <= yearsCount; step++) {
      const targetDate = new Date(
        startYear + step,
        startMonth - 1,
        startDay,
        12,
        0,
        0,
      );
      const y = targetDate.getFullYear();
      const m = String(targetDate.getMonth() + 1).padStart(2, "0");
      const d = String(targetDate.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
    }
  }

  return dates.length > 0 ? dates : [startDateStr];
}

window.addItemBuilderRow = function (name = "") {
  const container = document.getElementById("items-builder-container");
  const row = document.createElement("div");
  row.className = "item-builder-row";

  row.innerHTML = `
        <input type="text" class="form-control item-name-input" placeholder="z.B. Grillkohle, Salat, Kasten Bier, Zelt..." value="${name}" style="flex: 1;" required>
        <button type="button" class="btn-remove-item" onclick="this.closest('.item-builder-row').remove()" title="Entfernen">✕</button>
    `;
  container.appendChild(row);
};

function resetForm() {
  editingEventId = null;
  document.getElementById("event-form").reset();
  document.getElementById("submit-event-btn").textContent = "Termin speichern";
  document.getElementById("cancel-edit-btn").style.display = "none";
  document.getElementById("author-avatar").src = "logo.png";
  document.getElementById("items-builder-container").innerHTML = "";

  const allDayCheckbox = document.getElementById("event-all-day");
  if (allDayCheckbox) allDayCheckbox.checked = false;
  const timeGroup = document.getElementById("time-group");
  if (timeGroup) {
    timeGroup.style.opacity = "1";
    timeGroup.style.pointerEvents = "auto";
  }

  const recSelect = document.getElementById("event-recurrence");
  if (recSelect) recSelect.value = "none";
  const recDuration = document.getElementById("event-recurrence-duration");
  if (recDuration) recDuration.style.display = "none";

  const birthYearInput = document.getElementById("event-birth-year");
  if (birthYearInput) birthYearInput.value = "";

  const endDateInput = document.getElementById("event-end-date");
  if (endDateInput) endDateInput.value = "";

  const conflictWarning = document.getElementById("event-conflict-warning");
  if (conflictWarning) conflictWarning.style.display = "none";

  formParticipants = {};
  const currentAuthor = document.getElementById("event-author")?.value;
  if (currentAuthor) formParticipants[currentAuthor] = "yes";
  renderFormParticipants();

  formGuests = { adults: 0, children: 0 };
  renderFormGuests();

  selectedType = allCategories[0] || "Essen";
  document
    .querySelectorAll("#event-type-chips .selectable-chip")
    .forEach((c, idx) => {
      c.classList.toggle("selected", idx === 0);
    });
  updateCategoryDependentFields();

  const today = new Date().toISOString().split("T")[0];
  document.getElementById("event-date").value = today;
}
window.resetForm = resetForm;

window.editEventFromDetail = function () {
  if (!currentDetailData) return;
  window.editEventById(currentDetailData.baseId || currentDetailData.id);
};

window.openNewEventModal = function (prefilledDate = null) {
  resetForm();
  const dateToUse =
    prefilledDate ||
    selectedCalendarDate ||
    new Date().toISOString().split("T")[0];
  const dateInput = document.getElementById("event-date");
  if (dateInput) {
    dateInput.value = dateToUse;
    dateInput.dispatchEvent(new Event("change"));
  }
  const titleEl = document.getElementById("event-modal-title");
  if (titleEl) titleEl.textContent = "➕ Neuer Termin";
  const submitBtn = document.getElementById("submit-event-btn");
  if (submitBtn) submitBtn.textContent = "Termin speichern";
  const cancelBtn = document.getElementById("cancel-edit-btn");
  if (cancelBtn) cancelBtn.style.display = "block";

  editingEventId = null;
  const overlay = document.getElementById("event-form-overlay");
  if (overlay) overlay.style.display = "flex";
};

window.closeEventModal = function () {
  const overlay = document.getElementById("event-form-overlay");
  if (overlay) overlay.style.display = "none";
  resetForm();
  editingEventId = null;
};

window.cancelEdit = function () {
  window.closeEventModal();
};

window.deleteCurrentEvent = function () {
  if (!currentDetailData) return;
  const ev = currentDetailData;
  const targetDocId = ev.baseId || ev.id;

  document.getElementById("confirm-modal-title").textContent =
    "Termin löschen?";
  document.getElementById("confirm-modal-text").textContent =
    `Möchtest du '${ev.Titel}' wirklich unwiderruflich löschen?`;

  const confirmBtn = document.getElementById("btn-confirm-action");
  confirmBtn.onclick = async () => {
    window.closeConfirmModal();
    window.showLoading(true, "Termin wird gelöscht...");
    try {
      await deleteDoc(doc(db, "data_termine", targetDocId));
      window.closeEventDetails();
      window.showAppModal("Gelöscht", "Der Termin wurde erfolgreich entfernt.");
    } catch (err) {
      console.error("Fehler beim Löschen:", err);
      window.showAppModal(
        "Fehler",
        "Konnte nicht gelöscht werden: " + err.message,
      );
    } finally {
      window.showLoading(false);
    }
  };

  document.getElementById("confirm-modal-container").style.display = "flex";
};

document.getElementById("event-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const author = document.getElementById("event-author").value;
  const title = document.getElementById("event-title").value.trim();
  const date = document.getElementById("event-date").value;
  const endDate = document.getElementById("event-end-date")?.value || "";
  const time = document.getElementById("event-time").value;
  const location = document.getElementById("event-location").value.trim();
  const link = document.getElementById("event-link").value.trim();
  const description = document.getElementById("event-description").value.trim();
  const recurrence =
    document.getElementById("event-recurrence")?.value || "none";
  const recurrenceDuration =
    document.getElementById("event-recurrence-duration")?.value || "forever";
  const birthYearVal = document.getElementById("event-birth-year")?.value;
  const birthYear = birthYearVal ? parseInt(birthYearVal) : null;

  if (!author || !title || !date) {
    window.showAppModal(
      "Angaben fehlen",
      "Bitte fülle Ersteller, Titel und Datum aus!",
    );
    return;
  }

  const itemRows = document.querySelectorAll(
    "#items-builder-container .item-builder-row",
  );
  const items = Array.from(itemRows)
    .map((row) => ({
      name: row.querySelector(".item-name-input").value.trim(),
      checked: false,
    }))
    .filter((i) => i.name !== "");

  window.showLoading(true, "Termin wird gespeichert...");

  let existingRsvp = { ...formParticipants };
  if (author && !existingRsvp[author]) {
    existingRsvp[author] = "yes";
  }

  const isAllDay = document.getElementById("event-all-day").checked || !time;

  const baseEventData = {
    Ersteller: author,
    Titel: title,
    Uhrzeit: isAllDay ? "" : time,
    isAllDay: isAllDay,
    Ort: location || "",
    OrtLink: link || "",
    Kategorie: selectedType || "Essen",
    Geburtsjahr: selectedType === "Geburtstag" && birthYear ? birthYear : null,
    Beschreibung: description || "",
    Mitbringliste: items,
    Wiederholung: recurrence,
    WiederholungDauer: recurrenceDuration,
    createdAt: serverTimestamp(),
    lastAction: editingEventId ? "update" : "new",
  };

  try {
    await ensureAuth();
    const docId =
      editingEventId ||
      `${date}_${title.replace(/[^\w\s-]/gi, "").replace(/\s+/g, "-") || "Termin"}_${Date.now().toString().slice(-4)}`;

    await setDoc(doc(db, "data_termine", docId), {
      ...baseEventData,
      Datum: date,
      Enddatum:
        selectedType === "Urlaub / Abwesend" && endDate && endDate >= date
          ? endDate
          : "",
      Teilnehmer: existingRsvp,
      Gäste: {
        adults: formGuests.adults || 0,
        children: formGuests.children || 0,
      },
    });

    const isVacation = selectedType === "Urlaub / Abwesend";
    const successMsg = editingEventId
      ? isVacation
        ? "Urlaub / Abwesenheit wurde erfolgreich aktualisiert! 🏖️"
        : "Termin wurde erfolgreich aktualisiert!"
      : isVacation
        ? "Urlaub / Abwesenheit wurde erfolgreich im Kalender gespeichert! 🏖️"
        : "Termin wurde erfolgreich im Kalender gespeichert!";
    window.showAppModal("Erfolg", successMsg);

    if (typeof confetti === "function") {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#10b981", "#34d399", "#ffffff", "#f59e0b"],
        disableForReducedMotion: true,
      });
    }

    window.closeEventModal();
    renderCalendarWidget();
    filterAndRender();
  } catch (err) {
    console.error("Fehler beim Speichern:", err);
    window.showAppModal(
      "Fehler",
      "Konnte nicht gespeichert werden: " + err.message,
    );
  } finally {
    window.showLoading(false);
  }
});

document
  .getElementById("event-date")
  ?.addEventListener("change", checkAbsenceConflicts);
document
  .getElementById("event-date")
  ?.addEventListener("input", checkAbsenceConflicts);
document
  .getElementById("event-end-date")
  ?.addEventListener("change", checkAbsenceConflicts);
document
  .getElementById("event-end-date")
  ?.addEventListener("input", checkAbsenceConflicts);

const recSelectEl = document.getElementById("event-recurrence");
const recDurationEl = document.getElementById("event-recurrence-duration");
if (recSelectEl && recDurationEl) {
  recSelectEl.addEventListener("change", () => {
    if (recSelectEl.value !== "none") {
      recDurationEl.style.display = "block";
    } else {
      recDurationEl.style.display = "none";
    }
  });
}

document.getElementById("event-author").addEventListener("change", (e) => {
  const name = e.target.value;
  const img = document.getElementById("author-avatar");
  img.src = `avatars/${name}.webp`;
  img.onerror = () => {
    img.src = "logo.png";
  };
  if (name) {
    formParticipants[name] = "yes";
    renderFormParticipants();
  }
});

const lokalAuthorEl =
  document.getElementById("lokal-author") ||
  document.getElementById("einkehr-author");
if (lokalAuthorEl) {
  lokalAuthorEl.addEventListener("change", (e) => {
    const name = e.target.value;
    const img =
      document.getElementById("lokal-author-avatar") ||
      document.getElementById("einkehr-author-avatar");
    if (img) {
      img.src = `avatars/${name}.webp`;
      img.onerror = () => {
        img.src = "logo.png";
      };
    }
  });
}

const allDayCheckbox = document.getElementById("event-all-day");
const timeGroup = document.getElementById("time-group");
if (allDayCheckbox && timeGroup) {
  allDayCheckbox.addEventListener("change", () => {
    if (allDayCheckbox.checked) {
      timeGroup.style.opacity = "0.35";
      timeGroup.style.pointerEvents = "none";
      document.getElementById("event-time").value = "";
    } else {
      timeGroup.style.opacity = "1";
      timeGroup.style.pointerEvents = "auto";
    }
  });
}

// ==========================================
// 13. Kasse Logik (Gemeinschaftskasse)
// ==========================================
let allKasseBookings = [];
let selectedKasseFilter = "alle";
let editingKasseBookingId = null;
let currentKasseBookingType = "einnahme";

function initKasseListener() {
  const colRef = collection(db, "data_kasse");
  onSnapshot(
    colRef,
    (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.betrag !== undefined) {
          list.push({ id: docSnap.id, ...data });
        }
      });
      allKasseBookings = list;
      renderKasseView();
    },
    (error) => {
      console.error("Fehler beim Laden der Kasse:", error);
    },
  );
}

function formatEuro(amount) {
  const num = parseFloat(amount) || 0;
  return (
    num.toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function renderKasseView() {
  const totalBalanceEl = document.getElementById("kasse-total-balance");
  const totalInEl = document.getElementById("kasse-total-in");
  const totalOutEl = document.getElementById("kasse-total-out");
  const container = document.getElementById("kasse-list-container");
  if (!totalBalanceEl || !container) return;

  let totalIn = 0;
  let totalOut = 0;

  allKasseBookings.forEach((b) => {
    const amount = parseFloat(b.betrag) || 0;
    if (b.typ === "einnahme") {
      totalIn += amount;
    } else if (b.typ === "ausgabe") {
      totalOut += amount;
    }
  });

  const balance = totalIn - totalOut;
  totalBalanceEl.textContent = (balance >= 0 ? "+" : "") + formatEuro(balance);
  totalBalanceEl.className = `kasse-balance-amount ${balance < 0 ? "negative" : ""}`;

  if (totalInEl) totalInEl.textContent = "+" + formatEuro(totalIn);
  if (totalOutEl) totalOutEl.textContent = "-" + formatEuro(totalOut);

  // Filtern
  let filtered = [...allKasseBookings];
  if (selectedKasseFilter === "einnahme") {
    filtered = filtered.filter((b) => b.typ === "einnahme");
  } else if (selectedKasseFilter === "ausgabe") {
    filtered = filtered.filter((b) => b.typ === "ausgabe");
  }

  // Sortieren: Neuestes Datum zuerst
  filtered.sort((a, b) => {
    const dateA = a.datum || "1970-01-01";
    const dateB = b.datum || "1970-01-01";
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    const tA = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
    const tB = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
    return tB - tA;
  });

  container.innerHTML = "";

  if (filtered.length === 0) {
    container.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); margin-top: 35px; padding: 20px;">
                <div style="font-size: 2.5rem; margin-bottom: 8px;">💰</div>
                <h3 style="color: white; margin: 0 0 6px 0;">Keine Buchungen vorhanden</h3>
                <p style="font-size: 0.85rem; margin: 0;">Trage oben über „➕ Neue Buchung“ eine Einnahme oder Ausgabe ein!</p>
            </div>
        `;
    return;
  }

  filtered.forEach((b) => {
    const card = document.createElement("div");
    card.className = "kasse-tx-card";
    const isIncome = b.typ === "einnahme";
    const formattedDate = formatDateObj(b.datum).formattedLong;

    card.innerHTML = `
            <div class="kasse-tx-icon ${isIncome ? "positive" : "negative"}">
                ${isIncome ? "🟢" : "🔴"}
            </div>
            <div class="kasse-tx-info">
                <div class="kasse-tx-title">${b.zweck || "Buchung"}</div>
                <div class="kasse-tx-meta">
                    <span>📅 ${formattedDate}</span>
                    ${b.notiz ? `<span>• 📝 ${b.notiz}</span>` : ""}
                </div>
            </div>
            <div class="kasse-tx-right">
                <span class="kasse-tx-amount ${isIncome ? "positive" : "negative"}">
                    ${isIncome ? "+" : "-"}${formatEuro(b.betrag)}
                </span>
                <div class="kasse-tx-actions">
                    <button class="btn-tx-action" onclick="window.openKasseModalById('${b.id}')" title="Bearbeiten">✏️</button>
                    <button class="btn-tx-action" style="color: #ef4444;" onclick="window.deleteKasseBooking('${b.id}')" title="Löschen">🗑️</button>
                </div>
            </div>
        `;
    container.appendChild(card);
  });

  if (typeof renderPurchasesView === "function") {
    renderPurchasesView();
  }
}
window.renderKasseView = renderKasseView;

window.filterKasse = function (filter, el) {
  selectedKasseFilter = filter;
  document
    .querySelectorAll("#kasse-filter-chips .filter-chip")
    .forEach((c) => c.classList.remove("active"));
  if (el) el.classList.add("active");
  renderKasseView();
};

window.setKasseBookingType = function (type) {
  currentKasseBookingType = type;
  const btnIn = document.getElementById("btn-typ-einnahme");
  const btnOut = document.getElementById("btn-typ-ausgabe");

  if (type === "einnahme") {
    if (btnIn) btnIn.classList.add("active");
    if (btnOut) btnOut.classList.remove("active");
  } else {
    if (btnOut) btnOut.classList.add("active");
    if (btnIn) btnIn.classList.remove("active");
  }
};

window.openKasseModal = function (booking = null) {
  const modal = document.getElementById("kasse-modal-container");
  if (!modal) return;

  if (booking) {
    editingKasseBookingId = booking.id;
    document.getElementById("kasse-modal-title").textContent =
      "✏️ Buchung bearbeiten";
    document.getElementById("kasse-amount").value =
      parseFloat(booking.betrag) || "";
    document.getElementById("kasse-purpose").value = booking.zweck || "";
    document.getElementById("kasse-date").value = booking.datum || "";
    document.getElementById("kasse-notes").value = booking.notiz || "";
    window.setKasseBookingType(booking.typ || "einnahme");
  } else {
    editingKasseBookingId = null;
    document.getElementById("kasse-modal-title").textContent =
      "💰 Neue Buchung";
    document.getElementById("kasse-amount").value = "";
    document.getElementById("kasse-purpose").value = "";
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("kasse-date").value = today;
    document.getElementById("kasse-notes").value = "";
    window.setKasseBookingType("einnahme");
  }

  modal.style.display = "flex";
};

window.openKasseModalById = function (id) {
  const booking = allKasseBookings.find((b) => b.id === id);
  if (booking) window.openKasseModal(booking);
};

window.closeKasseModal = function () {
  const modal = document.getElementById("kasse-modal-container");
  if (modal) modal.style.display = "none";
};

window.saveKasseBooking = async function () {
  const amountVal = parseFloat(document.getElementById("kasse-amount").value);
  const purposeVal = document.getElementById("kasse-purpose").value.trim();
  const dateVal = document.getElementById("kasse-date").value;
  const notesVal = document.getElementById("kasse-notes").value.trim();

  if (isNaN(amountVal) || amountVal <= 0) {
    window.showAppModal(
      "Angabe fehlt",
      "Bitte gib einen gültigen Betrag größer als 0 € ein.",
    );
    return;
  }
  if (!purposeVal) {
    window.showAppModal(
      "Angabe fehlt",
      "Bitte gib einen Zweck für die Buchung an.",
    );
    return;
  }
  if (!dateVal) {
    window.showAppModal("Angabe fehlt", "Bitte gib ein Datum an.");
    return;
  }

  window.closeKasseModal();
  window.showLoading(true, "Buchung wird gespeichert...");

  const bookingData = {
    typ: currentKasseBookingType,
    betrag: Math.round(amountVal * 100) / 100,
    zweck: purposeVal,
    datum: dateVal,
    notiz: notesVal,
    createdAt: serverTimestamp(),
    lastAction: editingKasseBookingId ? "update" : "new",
  };

  try {
    await ensureAuth();
    const docId = editingKasseBookingId || `kasse_${dateVal}_${Date.now()}`;
    await setDoc(doc(db, "data_kasse", docId), bookingData);

    if (
      currentKasseBookingType === "einnahme" &&
      typeof confetti === "function"
    ) {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
        colors: ["#10b981", "#34d399", "#f59e0b"],
        zIndex: 30000,
      });
    }
  } catch (e) {
    console.error("Fehler beim Speichern der Buchung:", e);
    window.showAppModal(
      "Fehler",
      "Konnte Buchung nicht speichern: " + e.message,
    );
  } finally {
    window.showLoading(false);
  }
};

window.deleteKasseBooking = function (id) {
  const booking = allKasseBookings.find((b) => b.id === id);
  if (!booking) return;

  document.getElementById("confirm-modal-title").textContent =
    "Buchung löschen?";
  document.getElementById("confirm-modal-text").textContent =
    `Möchtest du die Buchung '${booking.zweck}' (${formatEuro(booking.betrag)}) wirklich löschen?`;

  const confirmBtn = document.getElementById("btn-confirm-action");
  confirmBtn.onclick = async () => {
    window.closeConfirmModal();
    window.showLoading(true, "Buchung wird gelöscht...");
    try {
      await deleteDoc(doc(db, "data_kasse", id));
    } catch (e) {
      console.error("Fehler beim Löschen:", e);
      window.showAppModal(
        "Fehler",
        "Konnte Buchung nicht löschen: " + e.message,
      );
    } finally {
      window.showLoading(false);
    }
  };

  document.getElementById("confirm-modal-container").style.display = "flex";
};

// ==========================================
// 14. Offene Anschaffungen Logik
// ==========================================
let allPurchases = [];
let selectedPurchaseFilter = "alle";
let editingPurchaseId = null;
let currentPurchasePrio = "hoch";

function initPurchasesListener() {
  const colRef = collection(db, "data_anschaffungen");
  onSnapshot(
    colRef,
    (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.titel) {
          list.push({ id: docSnap.id, ...data });
        }
      });
      allPurchases = list;
      renderPurchasesView();
      updatePurchasesBadge();
    },
    (error) => {
      console.error("Fehler beim Laden der Anschaffungen:", error);
    },
  );
}

function updatePurchasesBadge() {
  cachedOpenPurchasesCount = allPurchases.filter((p) => !p.erledigt).length;
  updateCombinedBadges();
}

function renderPurchasesView() {
  const container = document.getElementById("purchases-list-container");
  if (!container) return;

  // Kassenstand und Budget-Vergleich berechnen
  let totalIn = 0;
  let totalOut = 0;
  allKasseBookings.forEach((b) => {
    const amount = parseFloat(b.betrag) || 0;
    if (b.typ === "einnahme") totalIn += amount;
    else if (b.typ === "ausgabe") totalOut += amount;
  });
  const kassenstand = totalIn - totalOut;

  let totalNeeded = 0;
  allPurchases.forEach((p) => {
    if (!p.erledigt && p.preis) {
      totalNeeded += parseFloat(p.preis) || 0;
    }
  });

  const diff = kassenstand - totalNeeded;
  const diffEl = document.getElementById("purchases-budget-diff");
  const labelEl = document.getElementById("purchases-budget-status-label");
  const subEl = document.getElementById("purchases-budget-status-sub");
  const kasseValEl = document.getElementById("purchases-kassenstand-val");
  const neededValEl = document.getElementById("purchases-total-needed-val");

  if (diffEl) {
    if (kasseValEl)
      kasseValEl.textContent =
        (kassenstand >= 0 ? "+" : "") + formatEuro(kassenstand);
    if (neededValEl) neededValEl.textContent = formatEuro(totalNeeded);

    if (totalNeeded === 0) {
      labelEl.textContent = "Kassen-Deckung";
      diffEl.textContent = "0,00 €";
      diffEl.className = "purchases-budget-status-value covered";
      subEl.textContent = "Keine offenen Wünsche mit Preisangabe 🎉";
    } else if (diff >= 0) {
      labelEl.textContent = "Kassen-Deckung";
      diffEl.textContent = "+" + formatEuro(diff);
      diffEl.className = "purchases-budget-status-value covered";
      subEl.textContent = `Kasse deckt alles ab (${formatEuro(diff)} Puffer übrig) 🥳`;
    } else {
      const missingAmount = Math.abs(diff);
      labelEl.textContent = "Fehlender Kassenbetrag";
      diffEl.textContent = "-" + formatEuro(missingAmount);
      diffEl.className = "purchases-budget-status-value missing";
      subEl.textContent = `Es fehlen noch ${formatEuro(missingAmount)} in der Kasse für alle offenen Anschaffungen.`;
    }
  }

  let filtered = [...allPurchases];
  if (selectedPurchaseFilter === "offen") {
    filtered = filtered.filter((p) => !p.erledigt);
  } else if (selectedPurchaseFilter === "erledigt") {
    filtered = filtered.filter((p) => p.erledigt);
  }

  // Sortierung: Unfertig vor Fertig, dann Prio (hoch > mittel > idee), dann Datum
  const prioOrder = { hoch: 1, mittel: 2, idee: 3 };
  filtered.sort((a, b) => {
    if (!!a.erledigt !== !!b.erledigt) {
      return a.erledigt ? 1 : -1;
    }
    const prioA = prioOrder[a.prio] || 2;
    const prioB = prioOrder[b.prio] || 2;
    if (prioA !== prioB) return prioA - prioB;
    const tA = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
    const tB = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
    return tB - tA;
  });

  container.innerHTML = "";

  if (filtered.length === 0) {
    container.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); margin-top: 35px; padding: 20px;">
                <div style="font-size: 2.5rem; margin-bottom: 8px;">🛒</div>
                <h3 style="color: white; margin: 0 0 6px 0;">Keine Anschaffungen</h3>
                <p style="font-size: 0.85rem; margin: 0;">Trage oben über „➕ Neu“ Ausrüstung oder Wünsche für die Gruppe ein!</p>
            </div>
        `;
    return;
  }

  const prioLabels = {
    hoch: "🔥 Dringend",
    mittel: "⚡ Wichtig",
    idee: "💡 Idee",
  };

  filtered.forEach((p) => {
    const card = document.createElement("div");
    card.className = `purchase-card ${p.erledigt ? "checked" : ""}`;
    const prioClass = p.prio || "hoch";
    const prioText = prioLabels[prioClass] || "Wichtig";

    card.innerHTML = `
            <div class="purchase-checkbox" onclick="window.togglePurchaseStatus('${p.id}')" title="${p.erledigt ? "Als offen markieren" : "Als angeschafft markieren"}">
                ✓
            </div>
            <div class="purchase-info" onclick="window.togglePurchaseStatus('${p.id}')">
                <div class="purchase-title">${p.titel}</div>
                <div class="purchase-meta">
                    <span class="prio-badge ${prioClass}">${prioText}</span>
                    ${p.preis ? `<span class="purchase-price-badge">~${formatEuro(p.preis)}</span>` : ""}
                    ${p.notiz ? `<span>• 📝 ${p.notiz}</span>` : ""}
                </div>
            </div>
            <div class="purchase-right">
                ${p.link ? `<a href="${p.link}" target="_blank" rel="noopener noreferrer" class="btn-purchase-link" title="Weblink öffnen">🔗</a>` : ""}
                <button class="btn-tx-action" onclick="window.openPurchaseModalById('${p.id}')" title="Bearbeiten">✏️</button>
                <button class="btn-tx-action" style="color: #ef4444;" onclick="window.deletePurchase('${p.id}')" title="Löschen">🗑️</button>
            </div>
        `;
    container.appendChild(card);
  });
}
window.renderPurchasesView = renderPurchasesView;

window.filterPurchases = function (filter, el) {
  selectedPurchaseFilter = filter;
  document
    .querySelectorAll("#purchase-filter-chips .filter-chip")
    .forEach((c) => c.classList.remove("active"));
  if (el) el.classList.add("active");
  renderPurchasesView();
};

window.setPurchasePrio = function (prio) {
  currentPurchasePrio = prio;
  ["hoch", "mittel", "idee"].forEach((p) => {
    const btn = document.getElementById(`btn-prio-${p}`);
    if (btn) {
      btn.classList.toggle("active", p === prio);
      if (p === prio) {
        if (p === "hoch") btn.style.background = "rgba(239, 68, 68, 0.25)";
        else if (p === "mittel")
          btn.style.background = "rgba(245, 158, 11, 0.25)";
        else if (p === "idee")
          btn.style.background = "rgba(14, 165, 233, 0.25)";
      } else {
        btn.style.background = "transparent";
      }
    }
  });
};

window.openPurchaseModal = function (item = null) {
  const modal = document.getElementById("purchase-modal-container");
  if (!modal) return;

  if (item) {
    editingPurchaseId = item.id;
    document.getElementById("purchase-modal-title").textContent =
      "✏️ Anschaffung bearbeiten";
    document.getElementById("purchase-title").value = item.titel || "";
    document.getElementById("purchase-price").value = item.preis
      ? parseFloat(item.preis)
      : "";
    document.getElementById("purchase-link").value = item.link || "";
    document.getElementById("purchase-notes").value = item.notiz || "";
    window.setPurchasePrio(item.prio || "hoch");
  } else {
    editingPurchaseId = null;
    document.getElementById("purchase-modal-title").textContent =
      "🛒 Neue Anschaffung";
    document.getElementById("purchase-title").value = "";
    document.getElementById("purchase-price").value = "";
    document.getElementById("purchase-link").value = "";
    document.getElementById("purchase-notes").value = "";
    window.setPurchasePrio("hoch");
  }

  modal.style.display = "flex";
};

window.openPurchaseModalById = function (id) {
  const item = allPurchases.find((p) => p.id === id);
  if (item) window.openPurchaseModal(item);
};

window.closePurchaseModal = function () {
  const modal = document.getElementById("purchase-modal-container");
  if (modal) modal.style.display = "none";
};

window.savePurchase = async function () {
  const titleVal = document.getElementById("purchase-title").value.trim();
  const priceVal = parseFloat(document.getElementById("purchase-price").value);
  const linkVal = document.getElementById("purchase-link").value.trim();
  const notesVal = document.getElementById("purchase-notes").value.trim();

  if (!titleVal) {
    window.showAppModal(
      "Angabe fehlt",
      "Bitte gib einen Gegenstand / Titel an.",
    );
    return;
  }

  window.closePurchaseModal();
  window.showLoading(true, "Anschaffung wird gespeichert...");

  const purchaseData = {
    titel: titleVal,
    preis: isNaN(priceVal) ? null : Math.round(priceVal * 100) / 100,
    prio: currentPurchasePrio,
    link: linkVal,
    notiz: notesVal,
    erledigt: editingPurchaseId
      ? allPurchases.find((p) => p.id === editingPurchaseId)?.erledigt || false
      : false,
    createdAt: serverTimestamp(),
    lastAction: editingPurchaseId ? "update" : "new",
  };

  try {
    await ensureAuth();
    const docId = editingPurchaseId || `anschaffung_${Date.now()}`;
    await setDoc(doc(db, "data_anschaffungen", docId), purchaseData);

    if (!editingPurchaseId && typeof confetti === "function") {
      confetti({
        particleCount: 70,
        spread: 50,
        origin: { y: 0.6 },
        colors: ["#0ea5e9", "#10b981", "#f59e0b"],
        zIndex: 30000,
      });
    }
  } catch (e) {
    console.error("Fehler beim Speichern der Anschaffung:", e);
    window.showAppModal(
      "Fehler",
      "Konnte Anschaffung nicht speichern: " + e.message,
    );
  } finally {
    window.showLoading(false);
  }
};

window.togglePurchaseStatus = async function (id) {
  const item = allPurchases.find((p) => p.id === id);
  if (!item) return;

  try {
    await ensureAuth();
    await setDoc(doc(db, "data_anschaffungen", id), {
      ...item,
      erledigt: !item.erledigt,
      lastAction: "update",
    });
  } catch (e) {
    console.error("Fehler beim Umschalten des Status:", e);
  }
};

window.deletePurchase = function (id) {
  const item = allPurchases.find((p) => p.id === id);
  if (!item) return;

  document.getElementById("confirm-modal-title").textContent =
    "Anschaffung löschen?";
  document.getElementById("confirm-modal-text").textContent =
    `Möchtest du '${item.titel}' wirklich löschen?`;

  const confirmBtn = document.getElementById("btn-confirm-action");
  confirmBtn.onclick = async () => {
    window.closeConfirmModal();
    window.showLoading(true, "Anschaffung wird gelöscht...");
    try {
      await deleteDoc(doc(db, "data_anschaffungen", id));
    } catch (e) {
      console.error("Fehler beim Löschen:", e);
      window.showAppModal(
        "Fehler",
        "Konnte Anschaffung nicht löschen: " + e.message,
      );
    } finally {
      window.showLoading(false);
    }
  };

  document.getElementById("confirm-modal-container").style.display = "flex";
};

// ==========================================
// 15. Restaurant- & Lokal-Guide Logik („Wo wir waren“ & „Geplant“)
// ==========================================
let allLokale = [];
let selectedLokalFilter = "alle";
let editingLokalId = null;
let lokalParticipants = {}; // { [name]: "yes" }

const lokalCatLabels = {
  Deutsch: "🍽️ Deutsche Küche",
  Italienisch: "🍕 Italienisch",
  "Steak & Burger": "🥩 Steak & Burger",
  Griechisch: "🇬🇷 Griechisch",
  Brauhaus: "🍺 Brauhaus / Biergarten",
  Asiatisch: "🥢 Asiatisch",
  Kneipe: "🍻 Kneipe / Bar",
  Café: "☕ Café & Brunch",
  "Fast Food": "🍔 Imbiss & Fast Food",
  Spanisch: "🥘 Spanisch / Tapas",
  Mexikanisch: "🌮 Mexikanisch",
  Eisdiele: "🍦 Eisdiele",
  International: "🌐 International / Sonstiges",
  // Kompatibilität mit alten Einträgen
  Biergarten: "🍺 Brauhaus / Biergarten",
  Restaurant: "🍽️ Restaurant",
  Spiele: "🎯 Dart & Billard",
  Event: "🎪 Fest & Event",
};

function escapeLokalHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function initLokaleListener() {
  const colRef = collection(db, "data_einkehr");
  onSnapshot(
    colRef,
    (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.name) {
          list.push({ id: docSnap.id, ...data });
        }
      });
      allLokale = list;
      updateLokaleStats();
      renderLokaleView();
    },
    (error) => {
      console.error("Fehler beim Laden der Lokal-Einträge:", error);
    },
  );
}

function updateLokaleStats() {
  const visited = allLokale.filter((e) => e.status !== "geplant");
  const planned = allLokale.filter((e) => e.status === "geplant");

  const totalVisited = visited.length;
  const totalPlanned = planned.length;

  let avg = "0.0";
  if (totalVisited > 0) {
    const sum = visited.reduce((acc, curr) => {
      const score = Number(curr.gesamtRating) || Number(curr.rating) || 0;
      return acc + score;
    }, 0);
    avg = (sum / totalVisited).toFixed(1);
  }

  const totalEl =
    document.getElementById("lokal-stat-total") ||
    document.getElementById("einkehr-stat-total");
  const plannedEl = document.getElementById("lokal-stat-planned");
  const avgEl =
    document.getElementById("lokal-stat-avg-rating") ||
    document.getElementById("einkehr-stat-avg-rating");

  if (totalEl) totalEl.textContent = totalVisited;
  if (plannedEl) plannedEl.textContent = totalPlanned;
  if (avgEl) avgEl.textContent = `${avg} ⭐`;
}

function renderStarsString(rating) {
  const r = Math.round(Number(rating) || 0);
  let str = "";
  for (let i = 1; i <= 5; i++) {
    str +=
      i <= r
        ? "⭐"
        : '<span style="filter: grayscale(1) opacity(0.25); display: inline-block;">⭐</span>';
  }
  return str;
}

// ------------------------------------------
// Kriterien Interaktionen
// ------------------------------------------
function calculateOverallLokalScore() {
  const essen =
    parseInt(document.getElementById("lokal-rating-essen")?.value) || 3;
  const service =
    parseInt(document.getElementById("lokal-rating-service")?.value) || 3;
  const sauberkeit =
    parseInt(document.getElementById("lokal-rating-sauberkeit")?.value) || 3;
  const preis =
    parseInt(document.getElementById("lokal-rating-preis")?.value) || 3;

  const avg = ((essen + service + sauberkeit + preis) / 4).toFixed(1);
  const preview = document.getElementById("lokal-overall-preview");
  if (preview) preview.textContent = `${avg} ⭐`;
  return parseFloat(avg);
}

window.setLokalCriterion = function (criterion, val) {
  const hiddenInput = document.getElementById(`lokal-rating-${criterion}`);
  if (hiddenInput) hiddenInput.value = val;

  document
    .querySelectorAll(`.star-btn-crit[data-crit="${criterion}"]`)
    .forEach((btn) => {
      const starVal = parseInt(btn.getAttribute("data-val") || "0");
      btn.classList.toggle("active", starVal <= val);
    });

  const badge = document.getElementById(`score-badge-${criterion}`);
  if (badge) badge.textContent = `${val} / 5`;

  calculateOverallLokalScore();
};

window.setLokalStatus = function (status) {
  const statusInput = document.getElementById("lokal-status");
  if (statusInput) statusInput.value = status;

  const btnBesucht = document.getElementById("status-btn-besucht");
  const btnGeplant = document.getElementById("status-btn-geplant");
  if (btnBesucht) btnBesucht.classList.toggle("active", status === "besucht");
  if (btnGeplant) btnGeplant.classList.toggle("active", status === "geplant");

  const ratingsSection = document.getElementById("lokal-ratings-section");
  if (ratingsSection) {
    ratingsSection.style.display = status === "besucht" ? "block" : "none";
  }

  const pLabel = document.getElementById("lokal-participants-label");
  if (pLabel) {
    pLabel.textContent =
      status === "besucht"
        ? "👥 Wer war alles dabei?"
        : "🙋 Wer möchte alles mit? / Interesse";
  }

  const modalTitle = document.getElementById("lokal-modal-title");
  if (modalTitle) {
    modalTitle.textContent =
      status === "besucht"
        ? editingLokalId
          ? "✏️ Lokal bearbeiten"
          : "🍽️ Restaurant / Lokal bewerten"
        : editingLokalId
          ? "✏️ Geplantes Lokal bearbeiten"
          : "📌 Geplantes Lokal vormerken";
  }

  const submitBtn = document.getElementById("submit-lokal-btn");
  if (submitBtn) {
    submitBtn.textContent =
      status === "besucht"
        ? "Lokal & Bewertung speichern"
        : "📌 Auf Wunschliste speichern";
  }
};

// ------------------------------------------
// Teilnehmer-Auswahl im Modal
// ------------------------------------------
function renderLokalParticipants() {
  const container = document.getElementById("lokal-participants-container");
  if (!container) return;
  container.innerHTML = "";

  allAuthors.forEach((name) => {
    const isSelected = lokalParticipants[name] === "yes";
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `form-participant-chip ${isSelected ? "selected" : ""}`;
    chip.innerHTML = `
      <img src="avatars/${name}.webp" onerror="this.onerror=null; this.src='logo.png';" class="form-participant-avatar" alt="${name}">
      <span class="form-participant-name">${name}</span>
      ${isSelected ? '<span class="form-participant-check">✓</span>' : ""}
    `;
    chip.onclick = () => {
      if (lokalParticipants[name] === "yes") {
        delete lokalParticipants[name];
      } else {
        lokalParticipants[name] = "yes";
      }
      renderLokalParticipants();
    };
    container.appendChild(chip);
  });
}
window.renderLokalParticipants = renderLokalParticipants;

window.selectAllLokalParticipants = function (selectAll = true) {
  if (selectAll) {
    allAuthors.forEach((n) => {
      lokalParticipants[n] = "yes";
    });
  } else {
    lokalParticipants = {};
    const currentAuthor = document.getElementById("lokal-author")?.value;
    if (currentAuthor) lokalParticipants[currentAuthor] = "yes";
  }
  renderLokalParticipants();
};

// ------------------------------------------
// View Rendering & Filter
// ------------------------------------------
function renderLokaleView() {
  const container =
    document.getElementById("lokal-list-container") ||
    document.getElementById("einkehr-list-container");
  if (!container) return;

  const searchInput =
    document.getElementById("lokal-search") ||
    document.getElementById("einkehr-search");
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : "";

  let filtered = [...allLokale];

  // Filter nach Chip
  if (selectedLokalFilter === "besucht") {
    filtered = filtered.filter((e) => e.status !== "geplant");
  } else if (selectedLokalFilter === "geplant") {
    filtered = filtered.filter((e) => e.status === "geplant");
  } else if (selectedLokalFilter !== "alle") {
    filtered = filtered.filter((e) => e.kategorie === selectedLokalFilter);
  }

  // Textsuche
  if (searchTerm) {
    filtered = filtered.filter(
      (e) =>
        (e.name && e.name.toLowerCase().includes(searchTerm)) ||
        (e.ort && e.ort.toLowerCase().includes(searchTerm)) ||
        (e.kategorie && e.kategorie.toLowerCase().includes(searchTerm)) ||
        (e.notizen && e.notizen.toLowerCase().includes(searchTerm)),
    );
  }

  // Sortierung:
  // 1. Besuchte vor Geplanten
  // 2. Besuchte rein nach höchster Gesamtnote, dann alphabetisch
  // 3. Geplante nach Name
  filtered.sort((a, b) => {
    const isPlanA = a.status === "geplant" ? 1 : 0;
    const isPlanB = b.status === "geplant" ? 1 : 0;
    if (isPlanA !== isPlanB) return isPlanA - isPlanB;

    const rateA = Number(a.gesamtRating) || Number(a.rating) || 0;
    const rateB = Number(b.gesamtRating) || Number(b.rating) || 0;
    if (rateA !== rateB) return rateB - rateA;

    return (a.name || "").localeCompare(b.name || "");
  });

  container.innerHTML = "";

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); margin-top: 35px; padding: 20px;">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">🍽️</div>
        <h3 style="color: white; margin: 0 0 6px 0;">Keine Lokale gefunden</h3>
        <p style="font-size: 0.85rem; margin: 0;">Trage oben über „➕ Neues Restaurant / Lokal eintragen“ den ersten Tipp ein!</p>
      </div>
    `;
    return;
  }

  filtered.forEach((item) => {
    const card = document.createElement("div");
    const isGeplant = item.status === "geplant";
    card.className = `lokal-card ${isGeplant ? "geplant" : ""}`;

    const catBadgeText =
      lokalCatLabels[item.kategorie] || item.kategorie || "🍽️ Restaurant";
    const overallScore = item.gesamtRating || item.rating || "4.5";
    const starsHtml = renderStarsString(overallScore);

    let linksHtml = "";
    if (item.webLink) {
      linksHtml += `<a href="${item.webLink}" target="_blank" rel="noopener noreferrer" class="btn-lokal-link">📋 Speisekarte / Website ↗</a>`;
    }

    const authorAvatar = item.author
      ? `avatars/${item.author}.webp`
      : "logo.png";

    // Google Maps Link für Standort
    let locationLinkHtml = "";
    if (item.ort) {
      const mapsQuery = encodeURIComponent(
        (item.name ? item.name + " " : "") + item.ort,
      );
      locationLinkHtml = `
        <a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" rel="noopener noreferrer" class="lokal-location-link" title="In Google Maps öffnen">
          <span>📍</span><span>${escapeLokalHtml(item.ort)}</span>
        </a>
      `;
    }

    // Teilnehmer ermitteln
    const tMap = item.teilnehmer || {};
    const attendedAuthors = allAuthors.filter((name) => tMap[name] === "yes");

    // HTML für Teilnehmer-Chips
    let participantsHtml = "";
    if (attendedAuthors.length > 0) {
      let attendedChips = "";
      attendedAuthors.forEach((name) => {
        attendedChips += `
          <span class="lokal-user-chip" title="${name} ${isGeplant ? "möchte mit" : "war dabei"}">
            <img src="avatars/${name}.webp" onerror="this.onerror=null; this.src='logo.png';" alt="${name}" />
            <span>${name}</span>
          </span>
        `;
      });

      participantsHtml = `
        <div class="lokal-participants-box">
          <div class="lokal-participants-section">
            <span class="lokal-participants-label">${isGeplant ? "🙋 Möchten mit:" : "👥 Dabei waren:"}</span>
            <div class="lokal-avatars-row">
              ${attendedChips}
            </div>
          </div>
        </div>
      `;
    }

    // Kriterien-Pills bei besuchten Lokalen mit dynamischer Farbkodierung
    let criteriaPillsHtml = "";
    if (!isGeplant) {
      const rEssen = item.ratingEssen || item.rating || 5;
      const rService = item.ratingService || item.rating || 5;
      const rSauberkeit = item.ratingSauberkeit || item.rating || 5;
      const rPreis = item.ratingPreis || 4;

      const getScoreClass = (val) => {
        if (val >= 4) return "score-high";
        if (val >= 3) return "score-mid";
        return "score-low";
      };

      criteriaPillsHtml = `
        <div class="lokal-criteria-grid">
          <div class="criterion-pill ${getScoreClass(rEssen)}" title="Essen & Trinken: ${rEssen} von 5">
            <span class="criterion-pill-name">🍽️ Essen</span>
            <span class="criterion-pill-stars">${rEssen} ★</span>
          </div>
          <div class="criterion-pill ${getScoreClass(rService)}" title="Service & Freundlichkeit: ${rService} von 5">
            <span class="criterion-pill-name">😊 Service</span>
            <span class="criterion-pill-stars">${rService} ★</span>
          </div>
          <div class="criterion-pill ${getScoreClass(rSauberkeit)}" title="Sauberkeit & Ambiente: ${rSauberkeit} von 5">
            <span class="criterion-pill-name">✨ Sauberkeit</span>
            <span class="criterion-pill-stars">${rSauberkeit} ★</span>
          </div>
          <div class="criterion-pill ${getScoreClass(rPreis)}" title="Preis-Leistung: ${rPreis} von 5">
            <span class="criterion-pill-name">💶 Preis/Leist.</span>
            <span class="criterion-pill-stars">${rPreis} ★</span>
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="lokal-card-header">
        <div class="lokal-card-title-group">
          <div class="lokal-card-meta-top">
            <span class="badge-lokal-cat">${catBadgeText}</span>
            ${locationLinkHtml}
          </div>
          <h3 class="lokal-card-name">${escapeLokalHtml(item.name || "")}</h3>
        </div>
        <div class="lokal-card-header-right">
          ${
            !isGeplant
              ? `
            <div class="lokal-score-badge" title="Gesamtnote: ${overallScore} von 5 Sternen">
              <span class="lokal-score-val">${overallScore}</span>
              <span class="lokal-score-star">★</span>
            </div>
          `
              : `
            <div class="lokal-planned-badge">
              <span>📌 Wunschliste</span>
            </div>
          `
          }
          <div class="lokal-card-actions">
            <button class="btn-card-action" onclick="window.openLokalModal('${item.id}')" title="Lokal bearbeiten">✏️</button>
            <button class="btn-card-action btn-card-action-del" onclick="window.deleteLokal('${item.id}')" title="Lokal löschen">🗑️</button>
          </div>
        </div>
      </div>

      ${
        !isGeplant
          ? `
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
        <div class="lokal-stars-display" title="${overallScore} von 5 Sternen">
          ${starsHtml}
        </div>
        <span style="font-size: 0.78rem; font-weight: 700; color: #94a3b8;">4 Kriterien im Schnitt</span>
      </div>
      ${criteriaPillsHtml}
      `
          : `
      <div style="display: flex; align-items: center; gap: 6px; color: #93c5fd; font-size: 0.85rem; font-weight: 700;">
        <span>🌟</span><span>Geplante Einkehr / Vormerkung</span>
      </div>
      `
      }

      ${
        item.notizen
          ? `
      <div class="lokal-notes-box">
        <span class="notes-icon">💬</span>
        <div style="flex: 1;">${escapeLokalHtml(item.notizen)}</div>
      </div>
      `
          : ""
      }

      ${participantsHtml}

      <div class="lokal-card-footer">
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="${authorAvatar}" onerror="this.src='logo.png'" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.2);" alt="${escapeLokalHtml(item.author || "Anonym")}" />
          <span>Eingetragen von <strong>${escapeLokalHtml(item.author || "Anonym")}</strong></span>
        </div>
        <div class="lokal-card-links">
          ${linksHtml}
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}
window.renderLokaleView = renderLokaleView;

window.filterLokale = function (filter, el) {
  selectedLokalFilter = filter;
  const chipContainer =
    document.getElementById("lokal-filter-chips") ||
    document.getElementById("einkehr-filter-chips");
  if (chipContainer) {
    chipContainer
      .querySelectorAll(".filter-chip")
      .forEach((c) => c.classList.remove("active"));
  }
  if (el) el.classList.add("active");
  renderLokaleView();
};

window.filterAndRenderLokale = function () {
  renderLokaleView();
};

// ------------------------------------------
// Modal öffnen / schließen / speichern / löschen
// ------------------------------------------
window.openLokalModal = function (id = null, prefill = null) {
  const modal =
    document.getElementById("lokal-modal-container") ||
    document.getElementById("einkehr-modal-container");
  if (!modal) return;

  editingLokalId = id;
  const submitBtn = document.getElementById("submit-lokal-btn");

  if (id) {
    const item = allLokale.find((e) => e.id === id);
    if (!item) return;

    const isGeplant = item.status === "geplant";
    window.setLokalStatus(isGeplant ? "geplant" : "besucht");

    document.getElementById("lokal-id").value = item.id;
    document.getElementById("lokal-name").value = item.name || "";
    document.getElementById("lokal-kategorie").value =
      item.kategorie || "Italienisch";
    document.getElementById("lokal-ort").value = item.ort || "";
    document.getElementById("lokal-web-link").value = item.webLink || "";
    document.getElementById("lokal-notizen").value = item.notizen || "";

    // Kriterien setzen
    window.setLokalCriterion("essen", item.ratingEssen || item.rating || 5);
    window.setLokalCriterion("service", item.ratingService || item.rating || 5);
    window.setLokalCriterion(
      "sauberkeit",
      item.ratingSauberkeit || item.rating || 5,
    );
    window.setLokalCriterion("preis", item.ratingPreis || 4);

    // Ersteller
    const authorSelect = document.getElementById("lokal-author");
    if (authorSelect && item.author) {
      authorSelect.value = item.author;
      const img = document.getElementById("lokal-author-avatar");
      if (img) {
        img.src = `avatars/${item.author}.webp`;
        img.onerror = () => {
          img.src = "logo.png";
        };
      }
    }

    // Teilnehmer
    lokalParticipants = { ...(item.teilnehmer || {}) };
    renderLokalParticipants();

    if (submitBtn) {
      submitBtn.textContent = "Änderungen speichern";
    }
  } else if (prefill) {
    window.setLokalStatus("besucht");

    document.getElementById("lokal-id").value = "";
    document.getElementById("lokal-name").value = prefill.name || "";
    document.getElementById("lokal-kategorie").value = "Italienisch";
    document.getElementById("lokal-ort").value = prefill.ort || "";

    document.getElementById("lokal-web-link").value = prefill.link || "";
    document.getElementById("lokal-notizen").value = "";

    window.setLokalCriterion("essen", 3);
    window.setLokalCriterion("service", 3);
    window.setLokalCriterion("sauberkeit", 3);
    window.setLokalCriterion("preis", 3);

    const authorSelect = document.getElementById("lokal-author");
    if (authorSelect && prefill.author) {
      authorSelect.value = prefill.author;
      const img = document.getElementById("lokal-author-avatar");
      if (img) {
        img.src = `avatars/${prefill.author}.webp`;
        img.onerror = () => {
          img.src = "logo.png";
        };
      }
    }

    lokalParticipants =
      prefill.teilnehmer && Object.keys(prefill.teilnehmer).length > 0
        ? { ...prefill.teilnehmer }
        : prefill.author
          ? { [prefill.author]: "yes" }
          : {};
    renderLokalParticipants();

    if (submitBtn) {
      submitBtn.textContent = "Lokal & Bewertung speichern";
    }
  } else {
    window.setLokalStatus("besucht");

    document.getElementById("lokal-id").value = "";
    document.getElementById("lokal-name").value = "";
    document.getElementById("lokal-kategorie").value = "Italienisch";
    document.getElementById("lokal-ort").value = "";
    document.getElementById("lokal-web-link").value = "";
    document.getElementById("lokal-notizen").value = "";

    window.setLokalCriterion("essen", 3);
    window.setLokalCriterion("service", 3);
    window.setLokalCriterion("sauberkeit", 3);
    window.setLokalCriterion("preis", 3);

    lokalParticipants = {};
    const authorSelect = document.getElementById("lokal-author");
    if (authorSelect && authorSelect.value) {
      lokalParticipants[authorSelect.value] = "yes";
    }
    renderLokalParticipants();

    if (submitBtn) {
      submitBtn.textContent = "Lokal & Bewertung speichern";
    }
  }

  modal.style.display = "flex";
};

window.closeLokalModal = function () {
  const modal =
    document.getElementById("lokal-modal-container") ||
    document.getElementById("einkehr-modal-container");
  if (!modal) return;
  editingLokalId = null;
  modal.style.display = "none";
};

window.saveLokalEntry = async function () {
  const id = document.getElementById("lokal-id").value;
  const status = document.getElementById("lokal-status")?.value || "besucht";
  const author = document.getElementById("lokal-author").value;
  const name = document.getElementById("lokal-name").value.trim();
  const kategorie = document.getElementById("lokal-kategorie").value;
  const ort = document.getElementById("lokal-ort").value.trim();
  const webLink = document.getElementById("lokal-web-link").value.trim();
  const notizen = document.getElementById("lokal-notizen").value.trim();

  if (!name) {
    window.showAppModal("Hinweis", "Bitte gib den Namen des Lokals an.");
    return;
  }
  if (!author) {
    window.showAppModal("Hinweis", "Bitte wähle deinen Namen / Ersteller aus.");
    return;
  }

  const ratingEssen =
    parseInt(document.getElementById("lokal-rating-essen")?.value) || 3;
  const ratingService =
    parseInt(document.getElementById("lokal-rating-service")?.value) || 3;
  const ratingSauberkeit =
    parseInt(document.getElementById("lokal-rating-sauberkeit")?.value) || 3;
  const ratingPreis =
    parseInt(document.getElementById("lokal-rating-preis")?.value) || 3;
  const gesamtRating = (
    (ratingEssen + ratingService + ratingSauberkeit + ratingPreis) /
    4
  ).toFixed(1);

  window.showLoading(true, "Lokal wird gespeichert...");
  const docId = id || "lokal_" + Date.now();
  const lokalData = {
    id: docId,
    status,
    name,
    kategorie,
    ort,
    webLink,
    notizen,
    author,
    teilnehmer: { ...lokalParticipants },
    updatedAt: new Date().toISOString(),
  };

  if (status === "besucht") {
    lokalData.ratingEssen = ratingEssen;
    lokalData.ratingService = ratingService;
    lokalData.ratingSauberkeit = ratingSauberkeit;
    lokalData.ratingPreis = ratingPreis;
    lokalData.gesamtRating = parseFloat(gesamtRating);
    lokalData.rating = Math.round(parseFloat(gesamtRating)); // Backward-compatibility
  }

  if (!id) {
    lokalData.createdAt = new Date().toISOString();
  }

  try {
    await ensureAuth();
    await setDoc(doc(db, "data_einkehr", docId), lokalData, {
      merge: true,
    });
    window.closeLokalModal();
    window.showAppModal(
      "Erfolg",
      status === "geplant"
        ? id
          ? "Geplantes Lokal wurde aktualisiert! 📌"
          : "Lokal wurde auf die Wunschliste gesetzt! 📌"
        : id
          ? "Lokal & Bewertung wurden erfolgreich aktualisiert! 🍽️"
          : "Neues Lokal wurde erfolgreich im Guide gespeichert! 🍽️",
    );
  } catch (err) {
    console.error("Fehler beim Speichern des Lokals:", err);
    window.showAppModal(
      "Fehler",
      "Konnte Lokal nicht speichern: " + err.message,
    );
  } finally {
    window.showLoading(false);
  }
};

window.deleteLokal = function (id) {
  const item = allLokale.find((e) => e.id === id);
  const name = item ? item.name : "dieses Lokal";
  const confirmBtn = document.getElementById("btn-confirm-action");
  document.getElementById("confirm-modal-title").textContent = "Lokal löschen?";
  document.getElementById("confirm-modal-text").textContent =
    `Möchtest du "${name}" wirklich aus dem Guide entfernen?`;
  confirmBtn.textContent = "Löschen";
  confirmBtn.onclick = async () => {
    window.closeConfirmModal();
    window.showLoading(true, "Lokal wird gelöscht...");
    try {
      await deleteDoc(doc(db, "data_einkehr", id));
    } catch (e) {
      console.error("Fehler beim Löschen:", e);
      window.showAppModal("Fehler", "Konnte Lokal nicht löschen: " + e.message);
    } finally {
      window.showLoading(false);
    }
  };
  document.getElementById("confirm-modal-container").style.display = "flex";
};

// Aliase für Abwärtskompatibilität
window.openEinkehrModal = window.openLokalModal;
window.closeEinkehrModal = window.closeLokalModal;
window.saveEinkehrEntry = window.saveLokalEntry;
window.deleteEinkehr = window.deleteLokal;
window.renderEinkehrView = window.renderLokaleView;
window.filterEinkehr = window.filterLokale;
window.filterAndRenderEinkehr = window.filterAndRenderLokale;
window.initEinkehrListener = initLokaleListener;

// ==========================================
// 17. REZEPTE & KULINARIK (Look & Cook)
// ==========================================
let allRecipes = [];
let activeRecipeCategoryFilter = "alle";
let currentDetailRecipe = null;
let currentDetailPortions = 4;
let editingRecipeId = null;
let selectedTypesOrder = [];

const ALL_RECIPE_CATEGORIES = [
  "Fleisch",
  "Grillen",
  "Burger",
  "Steak",
  "Suppe",
  "Salat",
  "Vorspeise",
  "Beilagen",
  "Brot",
  "Dips",
  "Saucen",
  "Dutch",
  "Plancha",
  "Fisch",
  "Snack",
  "Dessert",
  "Backen",
  "Cocktails",
];

const STANDARD_UNITS = [
  "",
  "g",
  "kg",
  "ml",
  "l",
  "Stk",
  "EL",
  "TL",
  "Prise",
  "Bund",
  "Zehe",
  "Glas",
  "Flasche",
  "Würfel",
  "Pck",
  "Becher",
  "Scheiben",
  "Dose kl.",
  "Dose gr.",
];

function getRecipeImage(artArray) {
  const available = [
    "Backen",
    "Beilagen",
    "Brot",
    "Burger",
    "Cocktails",
    "Dessert",
    "Dips",
    "Fisch",
    "Fleisch",
    "Salat",
    "Saucen",
    "Snack",
    "Steak",
    "Suppe",
  ];
  const map = {
    Grillen: "Steak",
    Plancha: "Steak",
    Dutch: "Fleisch",
    Vorspeise: "Salat",
    Nudeln: "Beilagen",
    Pasta: "Beilagen",
  };
  if (!Array.isArray(artArray)) {
    artArray = artArray ? [artArray] : [];
  }
  for (const a of artArray) {
    if (available.includes(a)) return `images/rezepte/${a}.webp`;
    if (map[a]) return `images/rezepte/${map[a]}.webp`;
  }
  return "logo.png";
}

function initRezepteListener() {
  const colRef = collection(db, "data_rezepte");
  onSnapshot(
    colRef,
    (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (docSnap.id === "Art" || docSnap.id === "Ersteller") return;
        if (!data.Titel) return;
        list.push({ id: docSnap.id, ...data });
      });
      allRecipes = list;

      // Gespeicherte Sortierung wiederherstellen
      const savedSort = localStorage.getItem("recipe_sort_order");
      const sortSelect = document.getElementById("recipe-sort");
      if (savedSort && sortSelect) {
        sortSelect.value = savedSort;
      }

      renderRezepteView();
      updateCartBadge();
    },
    (err) => {
      console.error("Fehler beim Laden der Rezepte:", err);
    },
  );
}

function renderRezepteView() {
  const totalEl = document.getElementById("rezepte-stat-total");
  const topCatEl = document.getElementById("rezepte-stat-top-cat");
  const topAuthorEl = document.getElementById("rezepte-stat-top-author");

  if (totalEl) totalEl.textContent = allRecipes.length;

  if (topCatEl || topAuthorEl) {
    const catCounts = {};
    const authorCounts = {};

    allRecipes.forEach((r) => {
      const arts = Array.isArray(r.Art) ? r.Art : r.Art ? [r.Art] : [];
      arts.forEach((cat) => {
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      });
      if (r.Ersteller) {
        authorCounts[r.Ersteller] = (authorCounts[r.Ersteller] || 0) + 1;
      }
    });

    let topCat = "-";
    let maxCat = 0;
    for (const [c, cnt] of Object.entries(catCounts)) {
      if (cnt > maxCat) {
        maxCat = cnt;
        topCat = c;
      }
    }
    if (topCatEl) topCatEl.textContent = topCat;

    let topAuthor = "-";
    let maxAuthor = 0;
    for (const [a, cnt] of Object.entries(authorCounts)) {
      if (cnt > maxAuthor) {
        maxAuthor = cnt;
        topAuthor = a;
      }
    }
    if (topAuthorEl) topAuthorEl.textContent = topAuthor;
  }

  filterAndRenderRezepte();
}

function filterRezepte(category, el) {
  activeRecipeCategoryFilter = category;
  document
    .querySelectorAll("#recipe-filter-chips .filter-chip")
    .forEach((c) => c.classList.remove("active"));
  if (el) el.classList.add("active");
  filterAndRenderRezepte();
}

function onRecipeSortChange() {
  const sortSelect = document.getElementById("recipe-sort");
  if (sortSelect) {
    localStorage.setItem("recipe_sort_order", sortSelect.value);
  }
  filterAndRenderRezepte();
}

function filterAndRenderRezepte() {
  const container = document.getElementById("recipe-list-container");
  if (!container) return;

  const searchInput = document.getElementById("recipe-search");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  let filtered = allRecipes.slice();

  // 1. Filter nach Kategorie
  if (activeRecipeCategoryFilter && activeRecipeCategoryFilter !== "alle") {
    filtered = filtered.filter((r) => {
      const arts = Array.isArray(r.Art) ? r.Art : r.Art ? [r.Art] : [];
      return arts.some(
        (a) => a.toLowerCase() === activeRecipeCategoryFilter.toLowerCase(),
      );
    });
  }

  // 2. Filter nach Suche
  if (query) {
    filtered = filtered.filter((r) => {
      const title = (r.Titel || "").toLowerCase();
      const author = (r.Ersteller || "").toLowerCase();
      const notes = (
        r["Zusätzliche Hinweise"] ||
        r.Hinweise ||
        ""
      ).toLowerCase();
      const ingredients = Array.isArray(r.Zutaten)
        ? r.Zutaten.map((z) => (z.name || "").toLowerCase()).join(" ")
        : "";
      return (
        title.includes(query) ||
        author.includes(query) ||
        notes.includes(query) ||
        ingredients.includes(query)
      );
    });
  }

  // 3. Sortierung anwenden
  const sortOrder = document.getElementById("recipe-sort")?.value || "newest";
  filtered.sort((a, b) => {
    const getMillis = (date) =>
      date && date.toMillis
        ? date.toMillis()
        : date
          ? new Date(date).getTime()
          : 0;

    switch (sortOrder) {
      case "newest":
        return (
          getMillis(b.updatedAt || b.createdAt) -
          getMillis(a.updatedAt || a.createdAt)
        );
      case "oldest":
        return (
          getMillis(a.updatedAt || a.createdAt) -
          getMillis(b.updatedAt || b.createdAt)
        );
      case "alpha":
        return (a.Titel || "").localeCompare(b.Titel || "", "de");
      case "time-asc":
        return (parseInt(a.Zeit, 10) || 999) - (parseInt(b.Zeit, 10) || 999);
      case "servings-asc":
        return (
          (parseInt(a.Personenanzahl, 10) || 999) -
          (parseInt(b.Personenanzahl, 10) || 999)
        );
      default:
        return 0;
    }
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px 16px; color: #94a3b8;">
        <div style="font-size: 3rem; margin-bottom: 10px;">🍳</div>
        <div style="font-size: 1.1rem; font-weight: 800; color: #e2e8f0; margin-bottom: 6px;">Keine Rezepte gefunden</div>
        <div style="font-size: 0.85rem;">Probiere einen anderen Suchbegriff oder trage ein neues Gericht ein.</div>
      </div>
    `;
    return;
  }

  let html = "";
  filtered.forEach((r) => {
    const arts = Array.isArray(r.Art) ? r.Art : r.Art ? [r.Art] : [];
    const imgSrc = getRecipeImage(arts);
    const authorName = r.Ersteller || "Gruppe";
    const authorAvatar = `avatars/${authorName}.webp`;
    const portions = r.Personenanzahl || 4;
    const time = r.Zeit ? `${r.Zeit} Min.` : "30 Min.";
    const isLink = !!r.isLink;

    // Badge für NEU oder AKTUALISIERT (letzte 3 Tage)
    const getMillis = (date) =>
      date && date.toMillis
        ? date.toMillis()
        : date
          ? new Date(date).getTime()
          : 0;
    const dateMillis = getMillis(r.updatedAt || r.createdAt);
    let badgeHtml = "";
    if (dateMillis > 0) {
      const diffInDays = (Date.now() - dateMillis) / (1000 * 60 * 60 * 24);
      if (diffInDays >= 0 && diffInDays <= 3) {
        const isUpdate = r.lastAction === "update" || !!r.updatedAt;
        badgeHtml = `<span class="${isUpdate ? "rezept-badge-update" : "rezept-badge-new"}">${isUpdate ? "UPDATE" : "NEW"}</span>`;
      }
    }

    let tagsHtml = "";
    arts.slice(0, 3).forEach((tag) => {
      tagsHtml += `<span class="rezept-pill-tag">${escapeLokalHtml(tag)}</span>`;
    });
    if (isLink) {
      tagsHtml += `<span class="rezept-link-badge">Website</span>`;
    }

    const timeBadge = isLink
      ? `<span class="rezept-time-badge" style="border-color: rgba(14, 165, 233, 0.4); color: #38bdf8;">🌐 Web-Link</span>`
      : `<span class="rezept-time-badge">⏱️ ${escapeLokalHtml(time)}</span>`;

    const portionBadge = isLink
      ? ""
      : `<span class="rezept-portion-badge">👥 ${escapeLokalHtml(String(portions))} Port.</span>`;

    html += `
      <div class="rezept-card" onclick="window.openRecipeDetail('${r.id}')">
        <div class="rezept-card-bg" style="background-image: url('${imgSrc}');"></div>
        <div class="rezept-card-overlay"></div>
        <div class="rezept-card-top">
          <div class="rezept-tags-group">${tagsHtml}</div>
          ${timeBadge}
        </div>
        <div class="rezept-card-body">
          <h3 class="rezept-card-title">
            ${escapeLokalHtml(r.Titel || "")}${badgeHtml}${isLink ? `<span style="margin-left: 6px; font-size: 0.9rem; opacity: 0.9;">🔗</span>` : ""}
          </h3>
          <div class="rezept-card-meta">
            <div class="rezept-author-box">
              <img
                src="${authorAvatar}"
                onerror="this.onerror=null; this.src='logo.png';"
                class="rezept-author-avatar"
                alt="${escapeLokalHtml(authorName)}"
              />
              <span>${escapeLokalHtml(authorName)}</span>
            </div>
            ${portionBadge}
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Detail Modal
function openRecipeDetail(recipeId) {
  const r = allRecipes.find((x) => x.id === recipeId);
  if (!r) return;

  currentDetailRecipe = r;
  currentDetailPortions = parseInt(r.Personenanzahl, 10) || 4;

  const arts = Array.isArray(r.Art) ? r.Art : r.Art ? [r.Art] : [];
  const imgSrc = getRecipeImage(arts);
  const heroEl = document.getElementById("recipe-detail-hero");
  if (heroEl) {
    heroEl.style.backgroundImage = `url('${imgSrc}')`;
  }

  document.getElementById("recipe-detail-title").textContent =
    r.Titel || "Rezept";

  const authorName = r.Ersteller || "Gruppe";
  document.getElementById("recipe-detail-author-name").textContent = authorName;
  const authorImg = document.getElementById("recipe-detail-author-img");
  if (authorImg) {
    authorImg.src = `avatars/${authorName}.webp`;
    authorImg.onerror = () => {
      authorImg.src = "logo.png";
    };
  }

  const timeEl = document.getElementById("recipe-detail-time");
  const isLink = !!r.isLink;

  const tagsEl = document.getElementById("recipe-detail-tags");
  if (tagsEl) {
    let tagsHtml = arts
      .map(
        (tag) => `<span class="rezept-pill-tag">${escapeLokalHtml(tag)}</span>`,
      )
      .join("");
    if (isLink) {
      tagsHtml += `<span class="rezept-link-badge">Website</span>`;
    }
    tagsEl.innerHTML = tagsHtml;
  }

  const linkContainer = document.getElementById("recipe-detail-link-container");
  const linkBtn = document.getElementById("recipe-detail-link-btn");
  const classicContent = document.getElementById(
    "recipe-detail-classic-content",
  );
  const addCartBtn = document.getElementById("btn-recipe-add-cart");

  if (isLink) {
    if (linkContainer) linkContainer.style.display = "block";
    if (linkBtn) linkBtn.href = r.link || "#";
    if (classicContent) classicContent.style.display = "none";
    if (addCartBtn) addCartBtn.style.display = "none";
    if (timeEl) timeEl.textContent = "🔗 Web-Link";
  } else {
    if (linkContainer) linkContainer.style.display = "none";
    if (classicContent) classicContent.style.display = "block";
    if (addCartBtn) addCartBtn.style.display = "flex";
    if (timeEl) timeEl.textContent = `⏱️ ${r.Zeit || 45} Min.`;

    document.getElementById("recipe-detail-portions").textContent =
      currentDetailPortions;
    renderDetailIngredients();

    const stepsEl = document.getElementById("recipe-detail-steps");
    const rawSteps = Array.isArray(r.Zubereitung)
      ? r.Zubereitung
      : (r.Zubereitung || "").split("\n").filter((s) => s.trim());

    if (stepsEl) {
      if (rawSteps.length === 0) {
        stepsEl.innerHTML = `<div style="color: #94a3b8; font-style: italic;">Keine Zubereitungsschritte hinterlegt.</div>`;
      } else {
        stepsEl.innerHTML = rawSteps
          .map(
            (step, idx) => `
            <div class="recipe-step-item">
              <div class="recipe-step-num">${idx + 1}</div>
              <div class="recipe-step-text">${escapeLokalHtml(step)}</div>
            </div>
          `,
          )
          .join("");
      }
    }
  }

  const notes = r["Zusätzliche Hinweise"] || r.Hinweise || "";
  const notesContainer = document.getElementById(
    "recipe-detail-notes-container",
  );
  const notesEl = document.getElementById("recipe-detail-notes");
  if (notesContainer && notesEl) {
    if (notes.trim()) {
      notesContainer.style.display = "block";
      notesEl.textContent = notes;
    } else {
      notesContainer.style.display = "none";
    }
  }

  const modal = document.getElementById("recipe-detail-modal");
  if (modal) modal.style.display = "flex";
}

function closeRecipeDetail() {
  const modal = document.getElementById("recipe-detail-modal");
  if (modal) modal.style.display = "none";
  currentDetailRecipe = null;
}

function updateRecipeDetailPortions(delta) {
  if (!currentDetailRecipe || currentDetailRecipe.isLink) return;
  const newPortions = Math.max(1, Math.min(50, currentDetailPortions + delta));
  if (newPortions === currentDetailPortions) return;
  currentDetailPortions = newPortions;
  document.getElementById("recipe-detail-portions").textContent =
    currentDetailPortions;
  renderDetailIngredients();
}

function parseIngredientAmount(str) {
  if (!str) return 0;
  const clean = String(str).replace(",", ".").trim();
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

function formatScaledAmount(val) {
  if (val === 0) return "";
  if (Math.abs(val - Math.round(val)) < 0.05) {
    return String(Math.round(val));
  }
  return val.toFixed(1).replace(".", ",");
}

function renderDetailIngredients() {
  const ingListEl = document.getElementById("recipe-detail-ingredients");
  if (!ingListEl || !currentDetailRecipe || currentDetailRecipe.isLink) return;

  const basePortions = parseInt(currentDetailRecipe.Personenanzahl, 10) || 4;
  const rawIngs = Array.isArray(currentDetailRecipe.Zutaten)
    ? currentDetailRecipe.Zutaten
    : [];

  if (rawIngs.length === 0) {
    ingListEl.innerHTML = `<div style="color: #94a3b8; font-style: italic;">Keine Zutaten angegeben.</div>`;
    return;
  }

  ingListEl.innerHTML = rawIngs
    .map((ing) => {
      const origAmountNum = parseIngredientAmount(ing.amount);
      let displayAmount = ing.amount || "";
      if (origAmountNum > 0 && basePortions > 0) {
        const scaled = (origAmountNum / basePortions) * currentDetailPortions;
        displayAmount = formatScaledAmount(scaled);
      }
      const unit = ing.unit || "";
      const name = ing.name || "";
      const amountStr = displayAmount
        ? `${displayAmount} ${unit}`.trim()
        : unit;

      return `
        <div class="recipe-ing-item" onclick="this.classList.toggle('checked')">
          <input type="checkbox" style="pointer-events: none; accent-color: #f43f5e;" />
          <span class="recipe-ing-amount">${escapeLokalHtml(amountStr)}</span>
          <span class="recipe-ing-name">${escapeLokalHtml(name)}</span>
        </div>
      `;
    })
    .join("");
}

function editRecipeFromDetail() {
  if (!currentDetailRecipe) return;
  const id = currentDetailRecipe.id;
  closeRecipeDetail();
  openRecipeModal(id);
}

function deleteRecipeFromDetail() {
  if (!currentDetailRecipe) return;
  const id = currentDetailRecipe.id;
  const title = currentDetailRecipe.Titel || "dieses Rezept";
  closeRecipeDetail();

  const confirmBtn = document.getElementById("btn-confirm-action");
  document.getElementById("confirm-modal-title").textContent =
    "Rezept löschen?";
  document.getElementById("confirm-modal-text").textContent =
    `Möchtest du "${title}" wirklich löschen?`;
  confirmBtn.textContent = "Löschen";
  confirmBtn.onclick = async () => {
    window.closeConfirmModal();
    window.showLoading(true, "Rezept wird gelöscht...");
    try {
      await deleteDoc(doc(db, "data_rezepte", id));
    } catch (e) {
      console.error("Fehler beim Löschen des Rezepts:", e);
      window.showAppModal(
        "Fehler",
        "Konnte Rezept nicht löschen: " + e.message,
      );
    } finally {
      window.showLoading(false);
    }
  };
  document.getElementById("confirm-modal-container").style.display = "flex";
}

// ==========================================
// Einkaufszettel (Shopping Cart) Logik
// ==========================================
function getCart() {
  try {
    return JSON.parse(localStorage.getItem("recipe_cart") || "[]");
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem("recipe_cart", JSON.stringify(cart));
  updateCartBadge();
}

function updateCartBadge() {
  const cart = getCart();
  const badge = document.getElementById("cart-badge");
  if (badge) {
    badge.textContent = cart.length;
    badge.style.display = cart.length > 0 ? "inline-flex" : "none";
  }
}

function openCartModal() {
  renderCart();
  const modal = document.getElementById("cart-modal");
  if (modal) modal.style.display = "flex";
}

function closeCartModal() {
  const modal = document.getElementById("cart-modal");
  if (modal) modal.style.display = "none";
}

function renderCart() {
  updateCartBadge();
  const container = document.getElementById("cart-list-container");
  if (!container) return;

  const cart = getCart();
  if (cart.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 35px 10px; color: #94a3b8;">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">🛒</div>
        <div style="font-weight: 700; color: #cbd5e1; margin-bottom: 4px;">Dein Einkaufszettel ist leer</div>
        <div style="font-size: 0.82rem;">Füge Zutaten direkt aus einem Rezept über „In den Einkaufswagen“ hinzu.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = cart
    .map((item, idx) => {
      const amountStr = item.amount ? String(item.amount) : "";
      const unitStr = item.unit ? String(item.unit) : "";
      const displayAmount = (amountStr + " " + unitStr).trim();
      const isChecked = !!item.checked;

      return `
      <div class="cart-item-row ${isChecked ? "checked" : ""}" onclick="window.toggleCartItem(${idx})">
        <div class="cart-item-left">
          <input type="checkbox" class="cart-item-checkbox" ${isChecked ? "checked" : ""}>
          ${displayAmount ? `<span class="cart-item-amount">${escapeLokalHtml(displayAmount)}</span>` : ""}
          <span class="cart-item-name">${escapeLokalHtml(item.name || "")}</span>
        </div>
        <button type="button" class="btn-remove-cart-item" onclick="event.stopPropagation(); window.removeFromCart(${idx});" title="Entfernen">✕</button>
      </div>
    `;
    })
    .join("");
}

function toggleCartItem(idx) {
  const cart = getCart();
  if (cart[idx]) {
    cart[idx].checked = !cart[idx].checked;
    saveCart(cart);
    renderCart();
  }
}

function removeFromCart(idx) {
  const cart = getCart();
  cart.splice(idx, 1);
  saveCart(cart);
  renderCart();
}

function clearCart() {
  const cart = getCart();
  if (cart.length === 0) return;

  const confirmBtn = document.getElementById("btn-confirm-action");
  document.getElementById("confirm-modal-title").textContent =
    "Einkaufszettel leeren?";
  document.getElementById("confirm-modal-text").textContent =
    "Möchtest du wirklich alle Zutaten vom Einkaufszettel entfernen?";
  confirmBtn.textContent = "Leeren";
  confirmBtn.onclick = () => {
    window.closeConfirmModal();
    saveCart([]);
    renderCart();
  };
  document.getElementById("confirm-modal-container").style.display = "flex";
}

function addToCartFromDetail() {
  if (!currentDetailRecipe || currentDetailRecipe.isLink) return;

  const basePortions = parseInt(currentDetailRecipe.Personenanzahl, 10) || 4;
  const rawIngs = Array.isArray(currentDetailRecipe.Zutaten)
    ? currentDetailRecipe.Zutaten
    : [];

  // Filter: Alles außer reines "Wasser" (wie in Look & Cook)
  const filtered = rawIngs.filter(
    (ing) => ing.name && !ing.name.toLowerCase().includes("wasser"),
  );

  if (filtered.length === 0) {
    window.showAppModal("Einkaufszettel", "Keine relevanten Zutaten gefunden.");
    return;
  }

  const cart = getCart();

  filtered.forEach((ing) => {
    const origAmountNum = parseIngredientAmount(ing.amount);
    let scaledAmountStr = ing.amount || "";
    if (origAmountNum > 0 && basePortions > 0) {
      const scaled = (origAmountNum / basePortions) * currentDetailPortions;
      scaledAmountStr = formatScaledAmount(scaled);
    }

    const nameNorm = (ing.name || "").toLowerCase().trim();
    const unitNorm = (ing.unit || "").toLowerCase().trim();

    const existingIdx = cart.findIndex(
      (item) =>
        !item.checked &&
        (item.name || "").toLowerCase().trim() === nameNorm &&
        (item.unit || "").toLowerCase().trim() === unitNorm,
    );

    if (existingIdx > -1) {
      const v1 = parseIngredientAmount(cart[existingIdx].amount);
      const v2 = parseIngredientAmount(scaledAmountStr);
      if (v1 > 0 && v2 > 0) {
        cart[existingIdx].amount = formatScaledAmount(v1 + v2);
      }
    } else {
      cart.push({
        name: ing.name.trim(),
        unit: ing.unit || "",
        amount: scaledAmountStr,
        checked: false,
      });
    }
  });

  saveCart(cart);
  if (typeof confetti === "function") {
    confetti({ particleCount: 35, spread: 50, origin: { y: 0.8 } });
  }
  window.showAppModal(
    "Einkaufszettel",
    `${filtered.length} Zutaten wurden zusammengefasst auf den Einkaufszettel gelegt!`,
  );
}

// ==========================================
// PDF Generierung & Speicherung (reines jsPDF)
// ==========================================
function getJsPdfConstructor() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if (typeof window.jsPDF === "function") return window.jsPDF;
  return null;
}

async function saveGeneratedPdf(doc, filename, title) {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // 1. Mobile (iOS / Android): Web Share API mit "In Dateien sichern" / iCloud Drive / WhatsApp
  if (isMobile && navigator.canShare) {
    try {
      const pdfBlob = doc.output("blob");
      const file = new File([pdfBlob], filename, { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: title || filename,
        });
        return;
      }
    } catch (e) {
      if (e.name === "AbortError") return; // Nutzer hat Share-Sheet abgebrochen
      console.warn("Mobile Share fehlgeschlagen, nutze doc.save():", e);
    }
  }

  // 2. Desktop (Mac / Windows / Linux) / Fallback:
  // doc.save() lädt die Datei direkt in den Download-Ordner bzw. öffnet den Finder-Speicherdialog
  doc.save(filename);
}

async function exportRecipePdf() {
  if (!currentDetailRecipe) return;
  const r = currentDetailRecipe;

  if (r.isLink) {
    window.showCustomModal(
      "Hinweis",
      "Web-Link Rezepte können nicht als PDF exportiert werden.",
    );
    return;
  }

  const jsPDF = getJsPdfConstructor();
  if (!jsPDF) {
    window.showCustomModal(
      "PDF Fehler",
      "Die PDF-Bibliothek wird noch geladen oder konnte nicht erreicht werden. Bitte lade die Seite einmal neu.",
    );
    return;
  }

  window.showLoading(true, "PDF wird erstellt...");
  await new Promise((resolve) => setTimeout(resolve, 60));

  try {
    const title = r.Titel || "Rezept";
    const cleanTitle = title.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, "_");
    const filename = `Rezept_${cleanTitle}.pdf`;

    const basePortions = parseInt(r.Personenanzahl, 10) || 4;
    const portions = currentDetailPortions || basePortions;
    const author = r.Ersteller || "Gruppe";
    const time = r.Zeit ? `${r.Zeit} Min.` : "45 Min.";
    const arts = Array.isArray(r.Art) ? r.Art : r.Art ? [r.Art] : [];
    const ingredients = Array.isArray(r.Zutaten) ? r.Zutaten : [];
    const rawSteps = Array.isArray(r.Zubereitung)
      ? r.Zubereitung
      : (r.Zubereitung || "").split("\n").filter((s) => s.trim());

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 16;
    const contentWidth = pageWidth - margin * 2; // 178 mm
    let y = margin;

    function checkPageBreak(neededHeight) {
      if (y + neededHeight > pageHeight - margin - 10) {
        doc.addPage();
        y = margin;
        return true;
      }
      return false;
    }

    const todayStr = new Date().toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // --- 1. App Header Meta ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(225, 29, 72); // Accent Rose #e11d48
    doc.text("KLAPSENCAL  •  REZEPTBUCH", margin, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(todayStr, pageWidth - margin, y, { align: "right" });
    y += 7;

    // --- 2. Title ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42); // #0f172a
    const titleLines = doc.splitTextToSize(title, contentWidth);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 7.5 + 2;

    // --- 3. Meta Infobox (Author, Time, Portions, Tags) ---
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 11, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    let metaItems = [
      `Koch: ${author}`,
      `Zeit: ${time}`,
      `Portionen: ${portions}`,
    ];
    if (arts.length > 0) metaItems.push(arts.join(", "));
    doc.text(metaItems.join("   |   "), margin + 4, y + 7);
    y += 18;

    // --- 4. Ingredients Section ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(225, 29, 72);
    doc.text("Zutaten", margin, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`(für ${portions} Portionen berechnet)`, margin + 22, y);
    y += 2.5;

    doc.setDrawColor(225, 29, 72);
    doc.setLineWidth(0.4);
    doc.line(margin, y, margin + contentWidth, y);
    y += 5.5;

    if (ingredients.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text("Keine Zutaten angegeben.", margin, y);
      y += 8;
    } else {
      const formattedIngs = ingredients.map((ing) => {
        const origAmountNum = parseIngredientAmount(ing.amount);
        let displayAmount = ing.amount || "";
        if (origAmountNum > 0 && basePortions > 0) {
          const scaled = (origAmountNum / basePortions) * portions;
          displayAmount = formatScaledAmount(scaled);
        }
        const unit = ing.unit || "";
        const name = ing.name || "";
        const amountStr = displayAmount
          ? `${displayAmount} ${unit}`.trim()
          : unit;
        return { amount: amountStr, name: name };
      });

      // 2-Spalten-Layout
      const colW = (contentWidth - 8) / 2;
      for (let i = 0; i < formattedIngs.length; i += 2) {
        checkPageBreak(6.5);
        const item1 = formattedIngs[i];
        const item2 = formattedIngs[i + 1];

        // Spalte 1
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(190, 18, 60);
        doc.text(item1.amount, margin, y);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 41, 59);
        const name1 = doc.splitTextToSize(item1.name, colW - 28);
        doc.text(name1, margin + 26, y);

        // Spalte 2
        if (item2) {
          const col2X = margin + colW + 8;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(190, 18, 60);
          doc.text(item2.amount, col2X, y);

          doc.setFont("helvetica", "normal");
          doc.setTextColor(30, 41, 59);
          const name2 = doc.splitTextToSize(item2.name, col2X - 28);
          doc.text(name2, col2X + 26, y);
        }
        y += 6;
      }
      y += 8;
    }

    // --- 5. Preparation Steps ---
    checkPageBreak(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(225, 29, 72);
    doc.text("Zubereitung", margin, y);
    y += 2.5;

    doc.setDrawColor(225, 29, 72);
    doc.setLineWidth(0.4);
    doc.line(margin, y, margin + contentWidth, y);
    y += 7;

    if (rawSteps.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text("Keine Zubereitungsschritte angegeben.", margin, y);
      y += 8;
    } else {
      rawSteps.forEach((step, idx) => {
        const stepNum = `${idx + 1}.`;
        const stepLines = doc.splitTextToSize(step, contentWidth - 10);
        const stepH = stepLines.length * 4.8 + 4;
        checkPageBreak(stepH);

        // Nummer
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(225, 29, 72);
        doc.text(stepNum, margin, y);

        // Text
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        doc.text(stepLines, margin + 8, y);

        y += stepH;
      });
    }

    // --- 6. Footer auf allen Seiten ---
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, pageHeight - 12, margin + contentWidth, pageHeight - 12);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text("KlapsenCal • Guten Appetit!", margin, pageHeight - 7);
      doc.text(
        `Seite ${p} von ${totalPages}`,
        pageWidth - margin,
        pageHeight - 7,
        {
          align: "right",
        },
      );
    }

    await saveGeneratedPdf(doc, filename, title);
  } catch (err) {
    console.error("PDF-Erstellung fehlgeschlagen:", err);
    window.showCustomModal(
      "Fehler",
      "PDF konnte nicht erstellt werden: " + err.message,
    );
  } finally {
    window.showLoading(false);
  }
}

async function exportCartPdf() {
  const cart = getCart();
  if (!cart || cart.length === 0) {
    window.showCustomModal("Einkaufszettel", "Dein Einkaufszettel ist leer.");
    return;
  }

  const jsPDF = getJsPdfConstructor();
  if (!jsPDF) {
    window.showCustomModal(
      "PDF Fehler",
      "Die PDF-Bibliothek wird noch geladen. Bitte lade die Seite kurz neu.",
    );
    return;
  }

  window.showLoading(true, "PDF wird erstellt...");
  await new Promise((resolve) => setTimeout(resolve, 60));

  try {
    const todayStr = new Date().toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const filename = `Einkaufszettel_${todayStr.replace(/\./g, "-")}.pdf`;

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    function checkPageBreak(neededHeight) {
      if (y + neededHeight > pageHeight - margin - 10) {
        doc.addPage();
        y = margin;
        return true;
      }
      return false;
    }

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(225, 29, 72);
    doc.text("KLAPSENCAL  •  EINKAUFSZETTEL", margin, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(todayStr, pageWidth - margin, y, { align: "right" });
    y += 7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text("Einkaufszettel", margin, y);
    y += 2.5;

    doc.setDrawColor(225, 29, 72);
    doc.setLineWidth(0.4);
    doc.line(margin, y, margin + contentWidth, y);
    y += 7;

    // Items
    cart.forEach((item) => {
      checkPageBreak(7.5);
      const amountStr = item.amount ? String(item.amount) : "";
      const unitStr = item.unit ? String(item.unit) : "";
      const displayAmount = (amountStr + " " + unitStr).trim();

      // Checkbox
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, y - 3.5, 4.5, 4.5, 1, 1, "S");

      // Amount
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(190, 18, 60);
      doc.text(displayAmount, margin + 8, y);

      // Name
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);
      doc.text(item.name || "", margin + 45, y);

      // Light separator
      doc.setDrawColor(241, 245, 249);
      doc.line(margin, y + 2.5, margin + contentWidth, y + 2.5);

      y += 7;
    });

    // Footers
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, pageHeight - 12, margin + contentWidth, pageHeight - 12);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`KlapsenCal • ${cart.length} Einträge`, margin, pageHeight - 7);
      doc.text(
        `Seite ${p} von ${totalPages}`,
        pageWidth - margin,
        pageHeight - 7,
        {
          align: "right",
        },
      );
    }

    await saveGeneratedPdf(doc, filename, "Einkaufszettel " + todayStr);
  } catch (err) {
    console.error("PDF-Erstellung für Einkaufszettel fehlgeschlagen:", err);
    window.showCustomModal(
      "Fehler",
      "PDF konnte nicht erstellt werden: " + err.message,
    );
  } finally {
    window.showLoading(false);
  }
}

// ==========================================
// Rezept Formular Modal (Create / Edit)
// ==========================================
function toggleRecipeLinkMode(isLink) {
  const linkGroup = document.getElementById("recipe-link-group");
  const classicFields = document.getElementById("recipe-classic-fields");
  const linkInput = document.getElementById("recipe-input-link");

  if (linkGroup) linkGroup.style.display = isLink ? "block" : "none";
  if (classicFields) classicFields.style.display = isLink ? "none" : "block";
  if (linkInput && isLink) {
    linkInput.focus();
  }
}

function renderRecipeTypeChips(selected = []) {
  selectedTypesOrder = Array.isArray(selected)
    ? [...selected]
    : selected
      ? [selected]
      : [];
  const container = document.getElementById("recipe-type-chips-container");
  if (!container) return;

  container.innerHTML = ALL_RECIPE_CATEGORIES.map((cat) => {
    const idx = selectedTypesOrder.indexOf(cat);
    const isSel = idx > -1;
    const badgeHtml = isSel ? `<span class="chip-badge">${idx + 1}</span>` : "";
    return `
      <div class="recipe-tag-choice ${isSel ? "active" : ""}" data-cat="${cat}" onclick="window.toggleRecipeTypeChip('${cat}')">
        <span>${cat}</span>${badgeHtml}
      </div>
    `;
  }).join("");
}

function toggleRecipeTypeChip(cat) {
  const idx = selectedTypesOrder.indexOf(cat);
  if (idx > -1) {
    selectedTypesOrder.splice(idx, 1);
  } else {
    selectedTypesOrder.push(cat);
  }
  renderRecipeTypeChips(selectedTypesOrder);
}

function openRecipeModal(recipeId = null) {
  editingRecipeId = recipeId;
  const modal = document.getElementById("recipe-modal");
  const titleEl = document.getElementById("recipe-modal-title");
  const form = document.getElementById("recipe-form");
  if (!modal || !form) return;

  form.reset();
  document.getElementById("recipe-edit-id").value = recipeId || "";

  const authorSelect = document.getElementById("recipe-input-author");
  if (authorSelect) {
    authorSelect.innerHTML = allAuthors
      .map((a) => `<option value="${a}">${a}</option>`)
      .join("");
  }

  const ingContainer = document.getElementById(
    "recipe-ingredients-rows-container",
  );
  if (ingContainer) ingContainer.innerHTML = "";

  const isLinkCheckbox = document.getElementById("recipe-is-link");

  if (recipeId) {
    const r = allRecipes.find((x) => x.id === recipeId);
    if (r) {
      titleEl.textContent = "✏️ Rezept bearbeiten";
      document.getElementById("recipe-input-title").value = r.Titel || "";
      if (authorSelect && r.Ersteller) authorSelect.value = r.Ersteller;

      const isLink = !!r.isLink;
      if (isLinkCheckbox) isLinkCheckbox.checked = isLink;
      toggleRecipeLinkMode(isLink);

      if (isLink) {
        document.getElementById("recipe-input-link").value = r.link || "";
      } else {
        document.getElementById("recipe-input-time").value = r.Zeit || "45";
        document.getElementById("recipe-input-portions").value =
          r.Personenanzahl || "4";

        const ings = Array.isArray(r.Zutaten) ? r.Zutaten : [];
        if (ings.length > 0) {
          ings.forEach((ing) =>
            addIngredientRow(ing.amount, ing.unit, ing.name),
          );
        } else {
          addIngredientRow();
        }

        const rawSteps = Array.isArray(r.Zubereitung)
          ? r.Zubereitung.join("\n")
          : r.Zubereitung || "";
        document.getElementById("recipe-input-steps").value = rawSteps;
      }

      const arts = Array.isArray(r.Art) ? r.Art : r.Art ? [r.Art] : [];
      renderRecipeTypeChips(arts);

      document.getElementById("recipe-input-notes").value =
        r["Zusätzliche Hinweise"] || r.Hinweise || "";
    }
  } else {
    titleEl.textContent = "📖 Neues Rezept anlegen";
    if (isLinkCheckbox) isLinkCheckbox.checked = false;
    toggleRecipeLinkMode(false);

    document.getElementById("recipe-input-time").value = "45";
    document.getElementById("recipe-input-portions").value = "4";
    renderRecipeTypeChips(["Fleisch"]);
    addIngredientRow();
    addIngredientRow();
    addIngredientRow();
  }

  modal.style.display = "flex";
}

function closeRecipeModal() {
  const modal = document.getElementById("recipe-modal");
  if (modal) modal.style.display = "none";
  editingRecipeId = null;
  selectedTypesOrder = [];
}

function addIngredientRow(amount = "", unit = "", name = "") {
  const container = document.getElementById(
    "recipe-ingredients-rows-container",
  );
  if (!container) return;

  const unitOptions = STANDARD_UNITS.map(
    (u) =>
      `<option value="${u}" ${u.toLowerCase() === (unit || "").toLowerCase() ? "selected" : ""}>${u || "Einheit..."}</option>`,
  ).join("");

  const row = document.createElement("div");
  row.className = "ing-edit-row";
  row.innerHTML = `
    <input type="text" class="form-control ing-amount" placeholder="Menge" value="${escapeLokalHtml(String(amount || ""))}">
    <select class="form-control ing-unit" style="cursor: pointer;">
      ${unitOptions}
    </select>
    <input type="text" class="form-control ing-name" placeholder="Zutat (z. B. Zwiebeln)" value="${escapeLokalHtml(String(name || ""))}" required>
    <button type="button" class="btn-remove-ing-row" onclick="this.parentElement.remove()" title="Zeile löschen">✕</button>
  `;
  container.appendChild(row);
}

async function saveRecipe(event) {
  if (event) event.preventDefault();

  const titleInput = document.getElementById("recipe-input-title");
  const authorSelect = document.getElementById("recipe-input-author");
  const isLinkMode = !!document.getElementById("recipe-is-link")?.checked;
  const linkInput = document.getElementById("recipe-input-link");
  const timeInput = document.getElementById("recipe-input-time");
  const portionsInput = document.getElementById("recipe-input-portions");
  const stepsInput = document.getElementById("recipe-input-steps");
  const notesInput = document.getElementById("recipe-input-notes");

  const title = titleInput ? titleInput.value.trim() : "";
  if (!title) {
    window.showAppModal("Hinweis", "Bitte gib einen Rezept-Titel ein.");
    return;
  }

  if (isLinkMode) {
    const linkVal = linkInput ? linkInput.value.trim() : "";
    if (
      !linkVal ||
      (!linkVal.includes("http://") && !linkVal.includes("https://"))
    ) {
      window.showAppModal(
        "Hinweis",
        "Bitte gib einen gültigen Web-Link ein (beginnend mit https:// oder http://).",
      );
      return;
    }
  }

  const selectedArts =
    selectedTypesOrder.length > 0 ? [...selectedTypesOrder] : ["Fleisch"];

  const recipeData = {
    Titel: title,
    Ersteller: authorSelect ? authorSelect.value : "Gruppe",
    Art: selectedArts,
    isLink: isLinkMode,
    "Zusätzliche Hinweise": notesInput ? notesInput.value.trim() : "",
    lastAction: editingRecipeId ? "update" : "new",
    updatedAt: serverTimestamp(),
  };

  if (isLinkMode) {
    recipeData.link = linkInput.value.trim();
  } else {
    const zutaten = [];
    document.querySelectorAll(".ing-edit-row").forEach((row) => {
      const amount = row.querySelector(".ing-amount")?.value.trim() || "";
      const unit = row.querySelector(".ing-unit")?.value.trim() || "";
      const name = row.querySelector(".ing-name")?.value.trim() || "";
      if (name) {
        zutaten.push({ amount, unit, name });
      }
    });

    const rawStepsText = stepsInput ? stepsInput.value.trim() : "";
    const zubereitung = rawStepsText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    recipeData.Zeit = timeInput ? String(timeInput.value || 45) : "45";
    recipeData.Personenanzahl = portionsInput
      ? String(portionsInput.value || 4)
      : "4";
    recipeData.Zutaten = zutaten;
    recipeData.Zubereitung = zubereitung;
  }

  const sanitizedTitle = title.replace(/[^\w\s-]/gi, "").replace(/\s+/g, "-");
  const docId = editingRecipeId || sanitizedTitle || "Rezept-" + Date.now();

  window.showLoading(true, "Rezept wird gespeichert...");
  try {
    // Falls Titel geändert wurde, altes Dokument löschen
    if (editingRecipeId && editingRecipeId !== docId) {
      await deleteDoc(doc(db, "data_rezepte", editingRecipeId));
    }

    await setDoc(doc(db, "data_rezepte", docId), recipeData, { merge: true });
    closeRecipeModal();
    if (typeof confetti === "function") {
      confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
    }
  } catch (e) {
    console.error("Fehler beim Speichern des Rezepts:", e);
    window.showAppModal(
      "Fehler",
      "Konnte Rezept nicht speichern: " + e.message,
    );
  } finally {
    window.showLoading(false);
  }
}

// Window Exports
window.openRecipeModal = openRecipeModal;
window.closeRecipeModal = closeRecipeModal;
window.addIngredientRow = addIngredientRow;
window.saveRecipe = saveRecipe;
window.openRecipeDetail = openRecipeDetail;
window.closeRecipeDetail = closeRecipeDetail;
window.updateRecipeDetailPortions = updateRecipeDetailPortions;
window.editRecipeFromDetail = editRecipeFromDetail;
window.deleteRecipeFromDetail = deleteRecipeFromDetail;
window.filterRezepte = filterRezepte;
window.filterAndRenderRezepte = filterAndRenderRezepte;
window.renderRezepteView = renderRezepteView;
window.onRecipeSortChange = onRecipeSortChange;
window.toggleRecipeTypeChip = toggleRecipeTypeChip;
window.toggleRecipeLinkMode = toggleRecipeLinkMode;
window.openCartModal = openCartModal;
window.closeCartModal = closeCartModal;
window.toggleCartItem = toggleCartItem;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.addToCartFromDetail = addToCartFromDetail;
window.printRecipe = exportRecipePdf;
window.exportRecipePdf = exportRecipePdf;
window.printCart = exportCartPdf;
window.exportCartPdf = exportCartPdf;

// ==========================================
// 12. Initialisierung beim Laden
// ==========================================
// Sofortiges Rendern der UI
renderCalendarWidget();
filterAndRender();
renderKasseView();
renderPurchasesView();
renderLokaleView();
renderRezepteView();
updateNotificationButton();
renderFormParticipants();
renderLokalParticipants();
renderFormGuests();

// Firebase Auth & Realtime Listeners
initAuthorsListener();
initCategoriesListener();
initEventsListener();
initKasseListener();
initPurchasesListener();
initLokaleListener();
initRezepteListener();

// ==========================================
// 16. Readme & Info Modal Logik
// ==========================================
function parseMarkdownToHtml(md) {
  if (!md) return "";
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /^### (.*$)/gim,
      '<h4 style="color: #34d399; font-size: 0.95rem; font-weight: 800; margin: 14px 0 6px 0;">$1</h4>',
    )
    .replace(
      /^## (.*$)/gim,
      '<h3 style="color: #6ee7b7; font-size: 1.05rem; font-weight: 800; margin: 18px 0 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">$1</h3>',
    )
    .replace(
      /^# (.*$)/gim,
      '<h2 style="color: #ffffff; font-size: 1.15rem; font-weight: 900; margin: 0 0 10px 0;">$1</h2>',
    )
    .replace(/\*\*(.*?)\*\*/gim, '<strong style="color: #ffffff;">$1</strong>')
    .replace(/\*(.*?)\*/gim, '<span style="color: #a7f3d0;">$1</span>')
    .replace(
      /^---$/gim,
      '<hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.08); margin: 12px 0;">',
    )
    .replace(
      /^\* (.*$)/gim,
      '<li style="margin-bottom: 5px; margin-left: 18px;">$1</li>',
    )
    .replace(
      /`([^`]+)`/gim,
      '<code style="background: rgba(255,255,255,0.1); padding: 1px 5px; border-radius: 4px; color: #a7f3d0; font-size: 0.8rem;">$1</code>',
    );

  return html;
}

window.openReadmeModal = async function () {
  const modal = document.getElementById("readme-modal-container");
  const body = document.getElementById("readme-content-body");
  const verEl = document.getElementById("readme-modal-version");
  if (!modal || !body) return;

  modal.style.display = "flex";
  if (verEl) {
    const appVer =
      document.getElementById("app-version")?.textContent || "Version 2.5.0";
    verEl.textContent = appVer;
  }

  try {
    const res = await fetch("README.md?t=" + Date.now());
    if (!res.ok) throw new Error("README.md konnte nicht geladen werden");
    const text = await res.text();
    body.innerHTML = parseMarkdownToHtml(text);
  } catch (e) {
    body.innerHTML = `<div style="color: #f87171; text-align: center; padding: 20px;">Fehler beim Laden der Anleitung: ${e.message}</div>`;
  }
};

window.closeReadmeModal = function () {
  const modal = document.getElementById("readme-modal-container");
  if (modal) modal.style.display = "none";
};

signInAnonymously(auth)
  .then(() => {
    console.log("Klapsentouren: Anonym bei Firebase angemeldet.");
  })
  .catch((error) => {
    console.warn("Anonymer Login Hinweis:", error);
  });
