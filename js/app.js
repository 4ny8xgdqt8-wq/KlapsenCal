import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence, doc, getDoc, collection, setDoc, deleteDoc, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ==========================================
// 1. Firebase Konfiguration & Initialisierung
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyDjaAvZvKpmJkA1Psb6Ajh8CcIFBxQpM1w",
    authDomain: "klapsencal.firebaseapp.com",
    projectId: "klapsencal",
    storageBucket: "klapsencal.firebasestorage.app",
    messagingSenderId: "709770125091",
    appId: "1:709770125091:web:8ec4a1294b59622d9ff696"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Offline-Persistence aktivieren
try {
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code === 'failed-precondition') {
            console.warn("Persistence: Multiple tabs open");
        } else if (err.code === 'unimplemented') {
            console.warn("Persistence not supported by browser");
        }
    });
} catch (e) {
    console.warn("Persistence Init Error:", e);
}

// ==========================================
// 2. Globale Variablen & State
// ==========================================
const DEFAULT_AUTHORS = ["Daniel", "Daniela", "Peter", "Simone", "Tanja", "Thorsten", "Nic", "Tristan", "Simon", "Emily", "Alexander"];
const DEFAULT_CATEGORIES = ["Essen", "Konzert", "Veranstaltung", "Geburtstag", "Dart", "Billard", "Sonstiges"];

const CATEGORY_COLORS = {
    "Essen": { color: "#f97316", bg: "rgba(249, 115, 22, 0.18)", border: "rgba(249, 115, 22, 0.45)" },
    "Konzert": { color: "#a855f7", bg: "rgba(168, 85, 247, 0.18)", border: "rgba(168, 85, 247, 0.45)" },
    "Veranstaltung": { color: "#0ea5e9", bg: "rgba(14, 165, 233, 0.18)", border: "rgba(14, 165, 233, 0.45)" },
    "Geburtstag": { color: "#ec4899", bg: "rgba(236, 72, 153, 0.18)", border: "rgba(236, 72, 153, 0.45)" },
    "Dart": { color: "#eab308", bg: "rgba(234, 179, 8, 0.18)", border: "rgba(234, 179, 8, 0.45)" },
    "Billard": { color: "#10b981", bg: "rgba(16, 185, 129, 0.18)", border: "rgba(16, 185, 129, 0.45)" },
    "Sonstiges": { color: "#94a3b8", bg: "rgba(148, 163, 184, 0.18)", border: "rgba(148, 163, 184, 0.45)" }
};

function getCategoryColor(cat) {
    return CATEGORY_COLORS[cat] || { color: "#10b981", bg: "rgba(16, 185, 129, 0.18)", border: "rgba(16, 185, 129, 0.45)" };
}

const CHILDREN_NAMES = ["Nic", "Tristan", "Simon", "Emily", "Alexander"];
const ADULT_NAMES = ["Daniel", "Daniela", "Peter", "Simone", "Tanja", "Thorsten"];

function isChild(name) {
    return CHILDREN_NAMES.includes(name);
}

let allAuthors = [...DEFAULT_AUTHORS];
let allCategories = [...DEFAULT_CATEGORIES];
let allEvents = [];
let selectedCategory = 'Alle';
let selectedTimeframe = '30d';
let selectedType = 'Essen';
let formParticipants = {};
let editingEventId = null;
let currentDetailData = null;
let isInitialLoad = true;

let calCurrentYear = new Date().getFullYear();
let calCurrentMonth = new Date().getMonth();
let selectedCalendarDate = null;

const MONTH_NAMES_SHORT = ["JAN", "FEB", "MÄR", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ"];
const WEEKDAY_NAMES_SHORT = ["SO", "MO", "DI", "MI", "DO", "FR", "SA"];
const MONTH_NAMES_LONG = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WEEKDAY_NAMES_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

// ==========================================
// 3. Benachrichtigungen (Push & Local)
// ==========================================
window.requestNotificationPermission = async function() {
    if (!('Notification' in window)) {
        window.showAppModal("Nicht unterstützt", "Dieser Browser unterstützt leider keine Benachrichtigungen.");
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            window.showAppModal("Aktiviert! 🔔", "Du erhältst nun Benachrichtigungen, wenn Termine eingetragen oder geändert werden.");
            updateNotificationButton();
            sendLocalNotification("Klapsentouren 🔔", "Benachrichtigungen sind erfolgreich aktiviert!");
        } else if (permission === 'denied') {
            window.showAppModal("Deaktiviert", "Benachrichtigungen wurden blockiert. Du kannst sie in den Browser-Einstellungen freigeben.");
            updateNotificationButton();
        }
    } catch (e) {
        console.error("Fehler bei Benachrichtigungs-Berechtigung:", e);
    }
};

function updateNotificationButton() {
    const btn = document.getElementById('btn-toggle-notifications');
    if (!btn) return;
    if ('Notification' in window && Notification.permission === 'granted') {
        btn.textContent = '🔔';
        btn.title = 'Benachrichtigungen aktiv';
        btn.style.opacity = '1';
    } else {
        btn.textContent = '🔕';
        btn.title = 'Benachrichtigungen aktivieren';
        btn.style.opacity = '0.6';
    }
}

async function sendLocalNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    try {
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            if (reg && reg.showNotification) {
                reg.showNotification(title, {
                    body: body,
                    icon: 'logo.png',
                    badge: 'icons/icon-192.png',
                    vibrate: [200, 100, 200],
                    data: { url: './index.html' }
                });
                return;
            }
        }
        new Notification(title, {
            body: body,
            icon: 'logo.png'
        });
    } catch (e) {
        console.warn("Konnte Benachrichtigung nicht senden:", e);
    }
}

// ==========================================
// 3.1 Automatische Terminerinnerungen (2h vorher / Vorabend 20 Uhr)
// ==========================================
function checkUpcomingReminders() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    let sentReminders = {};
    try {
        sentReminders = JSON.parse(localStorage.getItem('klapsen_sent_reminders') || '{}');
    } catch (e) {
        sentReminders = {};
    }

    const now = new Date();

    allEvents.forEach((ev) => {
        if (!ev.Datum || !ev.Titel) return;

        const isAllDay = !!ev.isAllDay || !ev.Uhrzeit;
        const parts = ev.Datum.split('-');
        if (parts.length !== 3) return;

        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);

        if (isAllDay) {
            // Ganztägiger Termin: Vorabend ab 20:00 Uhr erinnern
            const eveReminderTime = new Date(year, month, day - 1, 20, 0, 0);
            const eventDayEnd = new Date(year, month, day, 23, 59, 59);

            const reminderKey = `reminder_allday_${ev.id || ev.Titel}_${ev.Datum}`;

            if (now >= eveReminderTime && now <= eventDayEnd && !sentReminders[reminderKey]) {
                const isEve = (now.getFullYear() === year && now.getMonth() === month && now.getDate() === day - 1);
                const titleText = isEve ? `☀️ Erinnerung für morgen: ${ev.Titel}` : `☀️ Heute ganztägig: ${ev.Titel}`;
                const bodyText = `${isEve ? 'Morgen' : 'Heute'} steht '${ev.Titel}' an!${ev.Ort ? ' (📍 ' + ev.Ort + ')' : ''}`;

                sendLocalNotification(titleText, bodyText);
                sentReminders[reminderKey] = Date.now();
            }
        } else {
            // Termin mit fester Uhrzeit: 2 Stunden vorher erinnern
            const timeParts = (ev.Uhrzeit || '00:00').split(':');
            const hours = parseInt(timeParts[0]) || 0;
            const minutes = parseInt(timeParts[1]) || 0;

            const eventStartTime = new Date(year, month, day, hours, minutes, 0);
            const reminderTime = new Date(eventStartTime.getTime() - (2 * 60 * 60 * 1000)); // 2 Std vorher

            const reminderKey = `reminder_timed_${ev.id || ev.Titel}_${ev.Datum}_${ev.Uhrzeit}`;

            if (now >= reminderTime && now < eventStartTime && !sentReminders[reminderKey]) {
                const titleText = `⏰ In 2 Stunden: ${ev.Titel}`;
                const bodyText = `Um ${ev.Uhrzeit} Uhr: '${ev.Titel}'${ev.Ort ? ' (📍 ' + ev.Ort + ')' : ''}`;

                sendLocalNotification(titleText, bodyText);
                sentReminders[reminderKey] = Date.now();
            }
        }
    });

    try {
        localStorage.setItem('klapsen_sent_reminders', JSON.stringify(sentReminders));
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

    onSnapshot(docRef, (docSnap) => {
        const select = document.getElementById('event-author');
        const currentVal = select.value;

        if (docSnap.exists() && Array.isArray(docSnap.data().names)) {
            allAuthors = docSnap.data().names;
        } else {
            allAuthors = [...DEFAULT_AUTHORS];
        }

        select.innerHTML = '<option value="" disabled selected>Wähle Ersteller...</option>';
        allAuthors.forEach((name) => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });

        if (currentVal && allAuthors.includes(currentVal)) {
            select.value = currentVal;
        }

        renderFormParticipants();
    }, (e) => {
        console.warn("Ersteller Listener Fehler:", e);
    });
}

function renderFormParticipants() {
    const container = document.getElementById('form-participants-container');
    if (!container) return;
    container.innerHTML = '';

    allAuthors.forEach(name => {
        const isSelected = formParticipants[name] === 'yes';
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `form-participant-chip ${isSelected ? 'selected' : ''}`;
        chip.innerHTML = `
            <img src="avatars/${name}.webp" onerror="this.src='logo.png'" class="form-participant-avatar" alt="${name}">
            <span class="form-participant-name">${name}</span>
            ${isSelected ? '<span class="form-participant-check">✓</span>' : ''}
        `;
        chip.onclick = () => {
            if (formParticipants[name] === 'yes') {
                delete formParticipants[name];
            } else {
                formParticipants[name] = 'yes';
            }
            renderFormParticipants();
        };
        container.appendChild(chip);
    });

    // Gast-Button direkt in der Teilnehmer-Leiste
    const totalGuests = (parseInt(formGuests.adults) || 0) + (parseInt(formGuests.children) || 0);
    const guestChip = document.createElement('button');
    guestChip.type = 'button';
    guestChip.className = `form-participant-chip form-guest-chip ${totalGuests > 0 ? 'selected' : ''}`;
    guestChip.innerHTML = `
        <span style="font-size: 1rem; line-height: 1;">🎉</span>
        <span class="form-participant-name">${totalGuests > 0 ? `Gäste (${totalGuests})` : '+ Gast'}</span>
        ${totalGuests > 0 ? '<span class="form-participant-check">✓</span>' : ''}
    `;
    guestChip.onclick = () => {
        const guestsSection = document.getElementById('form-guests-section');
        if (totalGuests === 0) {
            formGuests.adults = 1;
            renderFormGuests();
            renderFormParticipants();
        }
        if (guestsSection) {
            guestsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };
    container.appendChild(guestChip);
}
window.renderFormParticipants = renderFormParticipants;

window.selectAllParticipants = function(selectAll = true) {
    if (selectAll) {
        allAuthors.forEach(n => { formParticipants[n] = 'yes'; });
    } else {
        formParticipants = {};
        const currentAuthor = document.getElementById('event-author')?.value;
        if (currentAuthor) formParticipants[currentAuthor] = 'yes';
    }
    renderFormParticipants();
};

window.selectAdultsParticipants = function() {
    formParticipants = {};
    allAuthors.filter(n => !isChild(n)).forEach(n => { formParticipants[n] = 'yes'; });
    const currentAuthor = document.getElementById('event-author')?.value;
    if (currentAuthor) formParticipants[currentAuthor] = 'yes';
    renderFormParticipants();
};

let formGuests = { adults: 0, children: 0 };

window.changeFormGuests = function(type, delta) {
    if (!formGuests[type]) formGuests[type] = 0;
    formGuests[type] = Math.max(0, formGuests[type] + delta);
    renderFormGuests();
    renderFormParticipants();
};

function renderFormGuests() {
    const adultsEl = document.getElementById('form-guest-adults-count');
    const childrenEl = document.getElementById('form-guest-children-count');
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

    onSnapshot(docRef, (docSnap) => {
        const filterCont = document.getElementById('filter-container');
        const formChipsCont = document.getElementById('event-type-chips');

        if (docSnap.exists() && Array.isArray(docSnap.data().typ)) {
            allCategories = docSnap.data().typ;
        } else {
            allCategories = [...DEFAULT_CATEGORIES];
        }

        // Filter Chips in der Hauptansicht
        filterCont.innerHTML = `<div class="filter-chip ${selectedCategory === 'Alle' ? 'active' : ''}" onclick="window.selectCategory('Alle', this)">Alle</div>`;
        formChipsCont.innerHTML = '';

        allCategories.forEach((cat, idx) => {
            const cStyle = getCategoryColor(cat);

            // Filter Chip
            const fChip = document.createElement('div');
            fChip.className = `filter-chip ${selectedCategory === cat ? 'active' : ''}`;
            fChip.innerHTML = `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${cStyle.color}; margin-right:5px; vertical-align:middle;"></span>${cat}`;
            fChip.onclick = (e) => window.selectCategory(cat, e.currentTarget);
            filterCont.appendChild(fChip);

            // Formular Chip
            const sChip = document.createElement('div');
            sChip.className = `selectable-chip ${selectedType === cat ? 'selected' : (idx === 0 && !selectedType ? 'selected' : '')}`;
            sChip.innerHTML = `<span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:${cStyle.color}; margin-right:6px; vertical-align:middle;"></span>${cat}`;
            sChip.dataset.name = cat;
            sChip.onclick = () => {
                selectedType = cat;
                document.querySelectorAll('#event-type-chips .selectable-chip').forEach(c => c.classList.remove('selected'));
                sChip.classList.add('selected');
                updateCategoryDependentFields();
                if (cat === 'Geburtstag' && !editingEventId) {
                    const allDayCheckbox = document.getElementById('event-all-day');
                    if (allDayCheckbox && !allDayCheckbox.checked) {
                        allDayCheckbox.checked = true;
                        allDayCheckbox.dispatchEvent(new Event('change'));
                    }
                    const recSelect = document.getElementById('event-recurrence');
                    if (recSelect && recSelect.value === 'none') {
                        recSelect.value = 'yearly';
                        recSelect.dispatchEvent(new Event('change'));
                    }
                }
            };
            formChipsCont.appendChild(sChip);
        });

        if (!allCategories.includes(selectedType)) {
            selectedType = allCategories[0] || 'Essen';
        }
        updateCategoryDependentFields();

        filterAndRender();
    }, (e) => {
        console.warn("Kategorien Listener Fehler:", e);
    });
}

function updateCategoryDependentFields() {
    const birthYearGroup = document.getElementById('birth-year-group');
    if (!birthYearGroup) return;

    if (selectedType === 'Geburtstag') {
        birthYearGroup.style.display = 'block';
    } else {
        birthYearGroup.style.display = 'none';
        const birthYearInput = document.getElementById('event-birth-year');
        if (birthYearInput && !editingEventId) birthYearInput.value = '';
    }
}
window.updateCategoryDependentFields = updateCategoryDependentFields;

// ==========================================
// 5. Firestore Realtime Listener & Serientermine
// ==========================================
let rawEvents = [];

function expandEventInstances(rawEventsList) {
    const expanded = [];
    rawEventsList.forEach(rawDoc => {
        if (!rawDoc.Wiederholung || rawDoc.Wiederholung === 'none') {
            expanded.push({
                ...rawDoc,
                baseId: rawDoc.id
            });
            return;
        }

        const recurrence = rawDoc.Wiederholung;
        const duration = rawDoc.WiederholungDauer || 'forever';
        const recurringDates = calculateRecurrenceDates(rawDoc.Datum, recurrence, duration);

        recurringDates.forEach((recDate, idx) => {
            expanded.push({
                ...rawDoc,
                id: idx === 0 ? rawDoc.id : `${rawDoc.id}_occ_${idx}`,
                baseId: rawDoc.id,
                Datum: recDate,
                occurrenceIndex: idx,
                isRecurringOccurrence: idx > 0
            });
        });
    });
    return expanded;
}

function initEventsListener() {
    const colRef = collection(db, "data_termine");
    onSnapshot(colRef, (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => {
            if (docSnap.id === "Ersteller" || docSnap.id === "Art") return;
            const data = docSnap.data();
            const title = data.Titel || data.titel;
            if (!title) return;

            let datum = (data.Datum || data.datum || '').trim();
            if (datum.includes('-')) {
                const p = datum.split('-');
                if (p.length === 3) {
                    datum = `${p[0]}-${String(p[1]).padStart(2, '0')}-${String(p[2]).padStart(2, '0')}`;
                }
            }

            list.push({
                id: docSnap.id,
                baseId: docSnap.id,
                ...data,
                Titel: title,
                Datum: datum,
                Kategorie: data.Kategorie || data.Art || 'Sonstiges',
                Ersteller: data.Ersteller || data.ersteller || 'Unbekannt'
            });
        });

        // Benachrichtigung bei neuem oder aktualisiertem Termin (nach initialem Laden)
        if (!isInitialLoad) {
            snapshot.docChanges().forEach((change) => {
                const item = change.doc.data();
                if (change.doc.id === "Ersteller" || change.doc.id === "Art" || !item.Titel) return;

                if (change.type === "added") {
                    sendLocalNotification(
                        `Neuer Termin! 📅`,
                        `${item.Ersteller || 'Jemand'} hat '${item.Titel}' (${item.Datum}) eingetragen.`
                    );
                } else if (change.type === "modified" && item.lastAction === "update") {
                    sendLocalNotification(
                        `Termin aktualisiert 🔄`,
                        `'${item.Titel}' wurde aktualisiert.`
                    );
                }
            });
        }

        isInitialLoad = false;
        rawEvents = list;
        allEvents = expandEventInstances(rawEvents);

        renderCalendarWidget();
        filterAndRender();
        updateTasksBadge();
        checkUpcomingReminders();
        
        if (currentDetailData) {
            const refreshed = allEvents.find(e => e.id === currentDetailData.id || e.baseId === currentDetailData.baseId);
            if (refreshed) {
                currentDetailData = refreshed;
                showEventDetails(refreshed);
            }
        }

        window.firebaseDataReceived = true;
        if (typeof window.attemptHideSplash === 'function') window.attemptHideSplash();
    }, (error) => {
        console.error("Fehler beim Laden der Termine:", error);
        window.firebaseDataReceived = true;
        if (typeof window.attemptHideSplash === 'function') window.attemptHideSplash();
    });
}

// ==========================================
// 6. Datums- & Countdown-Helfer
// ==========================================
function getCountdownInfo(dateStr) {
    if (!dateStr) return { badgeText: '', badgeClass: 'past', daysDiff: -999 };
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const parts = dateStr.split('-');
    if (parts.length !== 3) return { badgeText: '', badgeClass: 'past', daysDiff: -999 };
    
    const eventDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    eventDate.setHours(0, 0, 0, 0);
    
    const diffTime = eventDate.getTime() - now.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return { badgeText: 'HEUTE', badgeClass: 'today', daysDiff: 0 };
    } else if (diffDays === 1) {
        return { badgeText: 'MORGEN', badgeClass: 'tomorrow', daysDiff: 1 };
    } else if (diffDays > 1 && diffDays <= 7) {
        return { badgeText: `In ${diffDays} Tagen`, badgeClass: 'upcoming', daysDiff: diffDays };
    } else if (diffDays > 7 && diffDays <= 30) {
        const weeks = Math.round(diffDays / 7);
        return { badgeText: `In ${weeks} Woche${weeks > 1 ? 'n' : ''}`, badgeClass: 'upcoming', daysDiff: diffDays };
    } else if (diffDays > 30) {
        return { badgeText: `In ${diffDays} Tagen`, badgeClass: 'upcoming', daysDiff: diffDays };
    } else {
        return { badgeText: 'Vergangen', badgeClass: 'past', daysDiff: diffDays };
    }
}

function formatDateObj(dateStr) {
    if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes('-')) {
        return { day: '--', monthShort: '---', weekdayShort: '---', formattedLong: '--' };
    }
    const parts = dateStr.split('-');
    const year = parseInt(parts[0]) || 2026;
    const month = (parseInt(parts[1]) || 1) - 1;
    const day = parseInt(parts[2]) || 1;
    const dateObj = new Date(year, month, day);
    
    return {
        day: String(day).padStart(2, '0'),
        monthShort: MONTH_NAMES_SHORT[dateObj.getMonth()] || '',
        weekdayShort: WEEKDAY_NAMES_SHORT[dateObj.getDay()] || '',
        formattedLong: `${WEEKDAY_NAMES_LONG[dateObj.getDay()] || ''}, ${day}. ${MONTH_NAMES_LONG[dateObj.getMonth()] || ''} ${year}`
    };
}

// ==========================================
// 7. Termine Rendern & Filtern
// ==========================================
function renderEvents(events) {
    const container = document.getElementById('event-list-container');
    container.innerHTML = '';

    if (events.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); margin-top: 45px; padding: 20px;">
                <div style="font-size: 2.8rem; margin-bottom: 12px; opacity: 0.7;">📅</div>
                <h3 style="color: white; margin: 0 0 6px 0;">Keine Termine gefunden</h3>
                <p style="font-size: 0.85rem; margin: 0;">Trage oben über das „+“ einen neuen Termin ein!</p>
            </div>
        `;
        return;
    }

    events.forEach((item) => {
        const card = document.createElement('div');
        const countdown = getCountdownInfo(item.Datum);
        const isPast = countdown.daysDiff < 0;
        card.className = `event-card ${isPast ? 'past-event' : ''}`;
        card.onclick = () => showEventDetails(item);

        const dateParts = formatDateObj(item.Datum);
        const isAllDay = item.isAllDay || !item.Uhrzeit;
        const timeStr = isAllDay ? ' • ☀️ Ganztägig' : (item.Uhrzeit ? ` • ⏰ ${item.Uhrzeit} Uhr` : '');
        const locationStr = item.Ort ? `<span class="event-location">📍 ${item.Ort}</span>` : '';
        
        const rsvp = item.Teilnehmer || {};
        const yesMembers = Object.keys(rsvp).filter(name => rsvp[name] === 'yes');
        const guests = item.Gäste || { adults: 0, children: 0 };
        const gAdults = parseInt(guests.adults) || 0;
        const gChildren = parseInt(guests.children) || 0;

        const adultYesCount = yesMembers.filter(n => !isChild(n)).length + gAdults;
        const childYesCount = yesMembers.filter(n => isChild(n)).length + gChildren;
        const totalParticipants = adultYesCount + childYesCount;

        let participantStackHtml = '';
        if (totalParticipants > 0) {
            const maxPreview = 3;
            const avatarsHtml = yesMembers.slice(0, maxPreview).map(name => `
                <img src="avatars/${name}.webp" onerror="this.src='logo.png'" class="participant-mini" alt="${name}">
            `).join('');
            
            let countLabel = `${totalParticipants} dabei`;
            if (adultYesCount > 0 && childYesCount > 0) {
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

        let birthdayBadgeHtml = '';
        if (item.Kategorie === 'Geburtstag' && item.Geburtsjahr) {
            const evYear = parseInt(item.Datum ? item.Datum.split('-')[0] : new Date().getFullYear());
            const bYear = parseInt(item.Geburtsjahr);
            if (evYear && bYear && evYear >= bYear) {
                const age = evYear - bYear;
                const isRound = (age % 10 === 0 || age === 18 || age === 25 || age === 75 || age === 85 || age === 95);
                birthdayBadgeHtml = `<span class="birthday-age-pill ${isRound ? 'round-jubilee' : ''}" title="${age}. Geburtstag (Geb. ${bYear})">🎂 ${age}. Geb.</span>`;
            }
        }

        card.innerHTML = `
            <div class="event-date-box">
                <span class="event-date-weekday">${dateParts.weekdayShort}</span>
                <span class="event-date-day">${dateParts.day}</span>
                <span class="event-date-month">${dateParts.monthShort}</span>
            </div>
            <div class="event-info">
                <div class="event-title-row">
                    <h3 class="event-title">${item.Titel}</h3>
                    ${countdown.badgeText ? `<span class="countdown-badge ${countdown.badgeClass}">${countdown.badgeText}</span>` : ''}
                </div>
                <div class="event-meta">
                    <span class="event-tag" style="color: ${getCategoryColor(item.Kategorie).color}; background: ${getCategoryColor(item.Kategorie).bg}; border: 1px solid ${getCategoryColor(item.Kategorie).border}; font-weight: 700;">${item.Kategorie || 'Essen'}</span>
                    ${birthdayBadgeHtml}
                    ${item.Wiederholung && item.Wiederholung !== 'none' ? '<span class="event-recurrence-icon" title="Serientermin">🔁</span>' : ''}
                    ${locationStr}
                    <span>${timeStr}</span>
                </div>
            </div>
            <div class="event-card-right">
                <img src="avatars/${item.Ersteller}.webp" onerror="this.src='logo.png'" class="author-avatar-img" alt="${item.Ersteller}">
                ${participantStackHtml}
            </div>
        `;
        container.appendChild(card);
    });
}

// ==========================================
// 7.1 Monats-Kalender Widget Logik
// ==========================================
function renderCalendarWidget() {
    const titleEl = document.getElementById('calendar-month-year');
    const gridEl = document.getElementById('calendar-days-grid');
    if (!titleEl || !gridEl) return;

    titleEl.textContent = `${MONTH_NAMES_LONG[calCurrentMonth] || ''} ${calCurrentYear}`;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    gridEl.innerHTML = '';

    // Erster Tag des Monats (Montag = 0, Sonntag = 6)
    const firstDay = new Date(calCurrentYear, calCurrentMonth, 1);
    const startDayOfWeek = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(calCurrentYear, calCurrentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(calCurrentYear, calCurrentMonth, 0).getDate();

    // Tage des vorherigen Monats (ausgegraut)
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
        const d = daysInPrevMonth - i;
        const cell = document.createElement('div');
        cell.className = 'calendar-day-cell other-month';
        cell.innerHTML = `<span>${d}</span>`;
        gridEl.appendChild(cell);
    }

    // Tage des aktuellen Monats
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${calCurrentYear}-${String(calCurrentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = (dateStr === todayStr);
        const isSelected = (dateStr === selectedCalendarDate);
        const eventsOnDay = allEvents.filter(ev => ev && ev.Datum === dateStr);
        const hasEvents = eventsOnDay.length > 0;

        const cell = document.createElement('div');
        let classes = ['calendar-day-cell'];
        if (isToday) classes.push('today');
        if (isSelected) classes.push('selected');
        if (hasEvents) classes.push('has-events');

        cell.className = classes.join(' ');
        cell.innerHTML = `<span>${d}</span>`;
        cell.onclick = () => window.selectCalendarDay(dateStr);

        if (hasEvents) {
            const dayCats = [...new Set(eventsOnDay.map(ev => ev.Kategorie || 'Sonstiges'))];
            const primaryCatColor = getCategoryColor(dayCats[0]);

            if (!isSelected) {
                cell.style.background = primaryCatColor.bg;
            }

            const dotsRow = document.createElement('div');
            dotsRow.className = 'event-dots-row';

            // Für jedes Event an diesem Tag einen farbigen Punkt anzeigen (bis zu 4)
            eventsOnDay.slice(0, 4).forEach(ev => {
                const catStyle = getCategoryColor(ev.Kategorie);
                const dot = document.createElement('span');
                dot.className = 'event-dot';
                if (isSelected) {
                    dot.style.background = '#064e3b';
                    dot.style.boxShadow = 'none';
                } else {
                    dot.style.background = catStyle.color;
                    dot.style.boxShadow = `0 0 3px ${catStyle.color}`;
                }
                dotsRow.appendChild(dot);
            });

            cell.appendChild(dotsRow);
        }

        gridEl.appendChild(cell);
    }

    // Tage des nächsten Monats auffüllen
    const totalCellsSoFar = startDayOfWeek + daysInMonth;
    const nextPadding = totalCellsSoFar % 7 === 0 ? 0 : 7 - (totalCellsSoFar % 7);
    for (let d = 1; d <= nextPadding; d++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day-cell other-month';
        cell.innerHTML = `<span>${d}</span>`;
        gridEl.appendChild(cell);
    }
}
window.renderCalendarWidget = renderCalendarWidget;

window.navCalendarMonth = function(delta) {
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

window.navCalendarToday = function() {
    const today = new Date();
    calCurrentYear = today.getFullYear();
    calCurrentMonth = today.getMonth();
    selectedCalendarDate = null;
    renderCalendarWidget();
    filterAndRender();
};

window.clearDateFilter = function() {
    selectedCalendarDate = null;
    renderCalendarWidget();
    filterAndRender();
};

window.selectCalendarDay = function(dateStr) {
    if (selectedCalendarDate === dateStr) {
        selectedCalendarDate = null;
    } else {
        selectedCalendarDate = dateStr;
    }
    renderCalendarWidget();
    filterAndRender();
};

window.setTimeframeFilter = function(timeframeKey, el) {
    selectedTimeframe = timeframeKey;
    document.querySelectorAll('#timeframe-container .timeframe-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    selectedCalendarDate = null;
    renderCalendarWidget();
    filterAndRender();
};

function filterAndRender() {
    const searchEl = document.getElementById('event-search');
    const sortEl = document.getElementById('event-sort');
    const sectionTitleEl = document.getElementById('events-section-title');
    const clearBtn = document.getElementById('btn-clear-date-filter');

    const query = (searchEl ? searchEl.value : '').toLowerCase().trim();
    const sortType = sortEl ? sortEl.value : 'upcoming';

    const now = new Date();
    const currentYear = now.getFullYear();
    const nowStr = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // Bounds Berechnungen für Zeiträume
    const future30 = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
    const future30Str = `${future30.getFullYear()}-${String(future30.getMonth() + 1).padStart(2, '0')}-${String(future30.getDate()).padStart(2, '0')}`;

    const future60 = new Date(now.getTime() + (60 * 24 * 60 * 60 * 1000));
    const future60Str = `${future60.getFullYear()}-${String(future60.getMonth() + 1).padStart(2, '0')}-${String(future60.getDate()).padStart(2, '0')}`;

    const endOfYearStr = `${currentYear}-12-31`;
    const nextYear = currentYear + 1;
    const startNextYearStr = `${nextYear}-01-01`;
    const endNextYearStr = `${nextYear}-12-31`;

    let filtered = [];

    if (selectedCalendarDate) {
        // Bestimmter Tag im Kalender ausgewählt
        filtered = allEvents.filter(ev => ev && ev.Datum === selectedCalendarDate);
        const formatted = formatDateObj(selectedCalendarDate).formattedLong;
        if (sectionTitleEl) sectionTitleEl.textContent = `Termine am ${formatted}`;
        if (clearBtn) {
            clearBtn.style.display = 'inline-block';
            clearBtn.textContent = '✕ Filter zurücksetzen';
        }
    } else {
        // Zeitraum-Filterung (oder Vollsuche bei Query/Sortierung)
        filtered = allEvents.filter(ev => {
            if (!ev || !ev.Datum) return false;
            if (query || (sortType !== 'upcoming' && selectedTimeframe === 'all')) return true;

            if (selectedTimeframe === '30d') {
                return ev.Datum >= nowStr && ev.Datum <= future30Str;
            } else if (selectedTimeframe === '60d') {
                return ev.Datum >= nowStr && ev.Datum <= future60Str;
            } else if (selectedTimeframe === 'this_year') {
                return ev.Datum >= nowStr && ev.Datum <= endOfYearStr;
            } else if (selectedTimeframe === 'next_year') {
                return ev.Datum >= startNextYearStr && ev.Datum <= endNextYearStr;
            } else { // 'all'
                return ev.Datum >= nowStr;
            }
        });

        if (sectionTitleEl) {
            const timeframeLabels = {
                '30d': 'nächste 30 Tage',
                '60d': 'nächste 60 Tage',
                'this_year': `dieses Jahr ${currentYear}`,
                'next_year': `nächstes Jahr ${nextYear}`,
                'all': 'alle anstehenden'
            };
            const tfText = timeframeLabels[selectedTimeframe] || 'anstehend';
            sectionTitleEl.textContent = query 
                ? `Suchergebnisse (${filtered.length})` 
                : `Anstehend (${tfText} • ${filtered.length})`;
        }
        if (clearBtn) clearBtn.style.display = 'none';
    }

    // Filter nach Kategorie & Query
    filtered = filtered.filter(ev => {
        if (!ev) return false;
        const matchesCategory = (selectedCategory === 'Alle') || (ev.Kategorie === selectedCategory);
        const matchesQuery = !query || 
            (ev.Titel && ev.Titel.toLowerCase().includes(query)) ||
            (ev.Ort && ev.Ort.toLowerCase().includes(query)) ||
            (ev.Ersteller && ev.Ersteller.toLowerCase().includes(query)) ||
            (ev.Beschreibung && ev.Beschreibung.toLowerCase().includes(query));
        return matchesCategory && matchesQuery;
    });

    // Sortierung
    filtered.sort((a, b) => {
        const dateA = a.Datum || '9999-99-99';
        const dateB = b.Datum || '9999-99-99';
        const timeA = a.Uhrzeit || '00:00';
        const timeB = b.Uhrzeit || '00:00';
        const fullA = `${dateA}T${timeA}`;
        const fullB = `${dateB}T${timeB}`;

        if (sortType === 'upcoming') {
            return fullA.localeCompare(fullB);
        } else if (sortType === 'newest') {
            const tA = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : 0;
            const tB = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : 0;
            return tB - tA;
        } else if (sortType === 'alpha') {
            return (a.Titel || '').localeCompare(b.Titel || '', 'de');
        }
        return 0;
    });

    renderEvents(filtered);
}
window.filterAndRender = filterAndRender;

window.selectCategory = function(name, el) {
    selectedCategory = name;
    document.querySelectorAll('#filter-container .filter-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    filterAndRender();
};

// ==========================================
// 8. Event Detail Modal & RSVP
// ==========================================
function showEventDetails(data) {
    currentDetailData = data;
    const overlay = document.getElementById('event-detail-overlay');
    const countdown = getCountdownInfo(data.Datum);

    document.getElementById('detail-title').textContent = data.Titel;
    
    const catTag = document.getElementById('detail-category-tag');
    const catColor = getCategoryColor(data.Kategorie);
    catTag.textContent = data.Kategorie || 'Sonstiges';
    catTag.style.color = catColor.color;
    catTag.style.background = catColor.bg;
    catTag.style.borderColor = catColor.border;
    catTag.style.fontWeight = '700';

    const ageTag = document.getElementById('detail-age-tag');
    if (ageTag) {
        if (data.Kategorie === 'Geburtstag' && data.Geburtsjahr) {
            const evYear = parseInt(data.Datum ? data.Datum.split('-')[0] : new Date().getFullYear());
            const bYear = parseInt(data.Geburtsjahr);
            if (evYear && bYear && evYear >= bYear) {
                const age = evYear - bYear;
                const isRound = (age % 10 === 0 || age === 18 || age === 25 || age === 75 || age === 85 || age === 95);
                ageTag.textContent = isRound ? `🎉 ${age}. Geburtstag (Runder Jubeltag!)` : `🎂 ${age}. Geburtstag (Geb. ${bYear})`;
                ageTag.className = `age-badge ${isRound ? 'round-jubilee' : ''}`;
                ageTag.style.display = 'inline-flex';
            } else {
                ageTag.style.display = 'none';
            }
        } else {
            ageTag.style.display = 'none';
        }
    }

    const recTag = document.getElementById('detail-recurrence-tag');
    if (recTag) {
        const recLabels = {
            'weekly': '🔁 Wöchentlich',
            'biweekly': '🔁 Alle 2 Wochen',
            'monthly': '🔁 Monatlich',
            'yearly': '🔁 Jährlich'
        };
        if (data.Wiederholung && recLabels[data.Wiederholung]) {
            recTag.textContent = recLabels[data.Wiederholung];
            recTag.style.display = 'inline-flex';
        } else {
            recTag.style.display = 'none';
        }
    }
    
    const cdContainer = document.getElementById('detail-countdown');
    if (countdown.badgeText) {
        cdContainer.innerHTML = `<span class="countdown-badge ${countdown.badgeClass}" style="font-size: 0.75rem; padding: 4px 10px;">${countdown.badgeText}</span>`;
        cdContainer.style.display = 'block';
    } else {
        cdContainer.style.display = 'none';
    }

    const startFormatted = formatDateObj(data.Datum).formattedLong;
    const isAllDay = data.isAllDay || !data.Uhrzeit;
    document.getElementById('detail-date-str').textContent = startFormatted;
    document.getElementById('detail-time-str').textContent = isAllDay ? '☀️ Ganztägig' : `${data.Uhrzeit} Uhr`;
    document.getElementById('detail-location-str').textContent = data.Ort || 'Wird noch bekanntgegeben';
    document.getElementById('detail-author-str').textContent = data.Ersteller || 'Unbekannt';

    const authorAvatarImg = document.getElementById('detail-author-avatar');
    if (authorAvatarImg) {
        if (data.Ersteller) {
            authorAvatarImg.src = `avatars/${data.Ersteller}.webp`;
            authorAvatarImg.onerror = () => { authorAvatarImg.src = 'logo.png'; };
        } else {
            authorAvatarImg.src = 'logo.png';
        }
    }

    const linkBtn = document.getElementById('btn-open-link');
    const actionsCont = document.getElementById('detail-actions-container');
    const targetLink = data.OrtLink || data.Link;
    
    if (targetLink) {
        linkBtn.href = targetLink;
        if (actionsCont) actionsCont.style.display = 'flex';
    } else {
        if (actionsCont) actionsCont.style.display = 'none';
    }

    renderDetailRSVP(data);
    renderDetailChecklist(data);

    const notesSection = document.getElementById('detail-notes-section');
    const notesEl = document.getElementById('detail-notes');
    if (data.Beschreibung && data.Beschreibung.trim() !== "") {
        notesEl.textContent = data.Beschreibung;
        notesSection.style.display = 'block';
    } else {
        notesSection.style.display = 'none';
    }

    overlay.style.display = 'flex';
}
window.showEventDetails = showEventDetails;

let currentGuestsData = { adults: 0, children: 0 };

window.openGuestsModal = function() {
    if (!currentDetailData) return;
    const g = currentDetailData.Gäste || { adults: 0, children: 0 };
    currentGuestsData = { adults: parseInt(g.adults) || 0, children: parseInt(g.children) || 0 };
    
    document.getElementById('guest-adults-count').textContent = currentGuestsData.adults;
    document.getElementById('guest-children-count').textContent = currentGuestsData.children;
    document.getElementById('guests-modal-container').style.display = 'flex';
};

window.closeGuestsModal = function() {
    document.getElementById('guests-modal-container').style.display = 'none';
};

window.changeGuestCount = function(type, delta) {
    if (type === 'adults') {
        currentGuestsData.adults = Math.max(0, currentGuestsData.adults + delta);
        document.getElementById('guest-adults-count').textContent = currentGuestsData.adults;
    } else if (type === 'children') {
        currentGuestsData.children = Math.max(0, currentGuestsData.children + delta);
        document.getElementById('guest-children-count').textContent = currentGuestsData.children;
    }
};

window.saveGuestsModal = async function() {
    if (!currentDetailData) return;
    window.closeGuestsModal();
    window.showLoading(true, "Gäste werden gespeichert...");

    const targetDocId = currentDetailData.baseId || currentDetailData.id;
    try {
        await setDoc(doc(db, "data_termine", targetDocId), {
            ...currentDetailData,
            id: targetDocId,
            Gäste: currentGuestsData,
            lastAction: 'update'
        });
    } catch (err) {
        console.error("Fehler beim Speichern der Gäste:", err);
        window.showAppModal("Fehler", "Konnte Gäste nicht speichern: " + err.message);
    } finally {
        window.showLoading(false);
    }
};

function renderDetailRSVP(data) {
    const container = document.getElementById('rsvp-members-container');
    container.innerHTML = '';
    const rsvp = data.Teilnehmer || {};

    const guests = data.Gäste || { adults: 0, children: 0 };
    const gAdults = parseInt(guests.adults) || 0;
    const gChildren = parseInt(guests.children) || 0;

    const yesMembers = Object.keys(rsvp).filter(name => rsvp[name] === 'yes');
    const adultYesCount = yesMembers.filter(n => !isChild(n)).length + gAdults;
    const childYesCount = yesMembers.filter(n => isChild(n)).length + gChildren;
    const totalYesCount = adultYesCount + childYesCount;

    const totalEl = document.getElementById('rsvp-total-count');
    const adultsEl = document.getElementById('rsvp-adults-count');
    const childrenEl = document.getElementById('rsvp-children-count');

    if (totalEl) totalEl.textContent = totalYesCount;
    if (adultsEl) adultsEl.textContent = adultYesCount;
    if (childrenEl) childrenEl.textContent = childYesCount;

    // 1. Alle 11 Gruppenmitglieder
    allAuthors.forEach((name) => {
        const status = rsvp[name] || 'none';
        const card = document.createElement('div');
        card.className = `rsvp-card status-${status}`;
        
        let statusIcon = '❔';
        if (status === 'yes') statusIcon = '✅';
        else if (status === 'maybe') statusIcon = '❓';
        else if (status === 'no') statusIcon = '❌';

        const child = isChild(name);
        const roleBadge = child ? '<span class="rsvp-role-badge child">Kind</span>' : '<span class="rsvp-role-badge adult">Erw.</span>';

        card.innerHTML = `
            <img src="avatars/${name}.webp" onerror="this.src='logo.png'" class="rsvp-card-avatar" alt="${name}">
            <div class="rsvp-info">
                <span class="rsvp-name">${name}</span>
                ${roleBadge}
            </div>
            <span class="rsvp-badge-icon">${statusIcon}</span>
        `;

        card.onclick = async () => {
            const nextStatus = {
                'none': 'yes',
                'yes': 'maybe',
                'maybe': 'no',
                'no': 'none'
            }[status];

            const updatedRsvp = { ...rsvp, [name]: nextStatus };
            if (nextStatus === 'none') delete updatedRsvp[name];

            const targetDocId = data.baseId || data.id;
            try {
                await setDoc(doc(db, "data_termine", targetDocId), {
                    ...data,
                    id: targetDocId,
                    Teilnehmer: updatedRsvp,
                    lastAction: 'update'
                });
            } catch (err) {
                console.error("Fehler beim Aktualisieren des RSVP:", err);
            }
        };

        container.appendChild(card);
    });

    // 2. Gast-Karte für zusätzliche Gäste
    const totalGuests = (parseInt(guests.adults) || 0) + (parseInt(guests.children) || 0);

    const guestCard = document.createElement('div');
    guestCard.className = 'rsvp-card rsvp-card-guest';
    
    let guestText = 'Gäste (0)';
    if (totalGuests > 0) {
        guestText = `Gäste (${totalGuests})`;
    }

    guestCard.innerHTML = `
        <div style="font-size: 1.6rem;">👥</div>
        <div class="rsvp-info">
            <span class="rsvp-name" style="color: #f59e0b;">${guestText}</span>
            <span style="font-size: 0.65rem; color: #cbd5e1;">${guests.adults || 0} Erw. • ${guests.children || 0} Ki.</span>
        </div>
        <span class="rsvp-badge-icon">✏️</span>
    `;
    guestCard.onclick = () => window.openGuestsModal();
    container.appendChild(guestCard);
}

function renderDetailChecklist(data) {
    const section = document.getElementById('detail-checklist-section');
    const container = document.getElementById('detail-checklist-items');
    const items = data.Mitbringliste || [];

    if (items.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    container.innerHTML = items.map((item, idx) => `
        <div class="checklist-item-row ${item.checked ? 'checked' : ''}" onclick="window.toggleEventTask(${idx})">
            <div class="checklist-checkbox">✓</div>
            <span class="checklist-name">${item.name || item}</span>
            <span class="checklist-status-label">${item.checked ? 'Erledigt' : 'Fehlt noch'}</span>
        </div>
    `).join('');
}

window.toggleEventTask = async function(idx) {
    if (!currentDetailData) return;
    const items = [...(currentDetailData.Mitbringliste || [])];
    if (!items[idx]) return;

    items[idx].checked = !items[idx].checked;
    const targetDocId = currentDetailData.baseId || currentDetailData.id;
    try {
        await setDoc(doc(db, "data_termine", targetDocId), {
            ...currentDetailData,
            id: targetDocId,
            Mitbringliste: items,
            lastAction: 'update'
        });
    } catch (err) {
        console.error("Fehler beim Abhaken der Aufgabe:", err);
    }
};

window.closeEventDetails = function() {
    document.getElementById('event-detail-overlay').style.display = 'none';
    currentDetailData = null;
};

// ==========================================
// 9. Aufgaben / Was fehlt noch? Tab
// ==========================================
function renderAllTasks() {
    const container = document.getElementById('all-tasks-container');
    container.innerHTML = '';

    const now = new Date();
    const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    const seenBaseIds = new Set();
    const upcomingEvents = [];
    allEvents.filter(e => e.Datum >= nowStr && e.Mitbringliste && e.Mitbringliste.length > 0)
        .sort((a, b) => a.Datum.localeCompare(b.Datum))
        .forEach(ev => {
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

    upcomingEvents.forEach(ev => {
        const card = document.createElement('div');
        card.className = 'event-card';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'stretch';
        card.style.cursor = 'default';

        const itemsHtml = ev.Mitbringliste.map((item, idx) => `
            <div class="checklist-item-row ${item.checked ? 'checked' : ''}" onclick="window.toggleGlobalTask('${ev.baseId || ev.id}', ${idx})">
                <div class="checklist-checkbox">✓</div>
                <span class="checklist-name">${item.name || item}</span>
                <span class="checklist-status-label">${item.checked ? 'Erledigt' : 'Fehlt noch'}</span>
            </div>
        `).join('');

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

window.editEventById = function(eventId, autoAddNewItem = false) {
    const data = allEvents.find(e => e.id === eventId || e.baseId === eventId);
    if (!data) return;
    editingEventId = data.baseId || data.id;

    window.switchTab('neu', document.querySelector('.tab-item[onclick*="neu"]'));

    document.getElementById('event-author').value = data.Ersteller || '';
    document.getElementById('event-author').dispatchEvent(new Event('change'));
    document.getElementById('event-title').value = data.Titel || '';
    document.getElementById('event-date').value = data.Datum || '';
    document.getElementById('event-time').value = data.Uhrzeit || '';

    const isAllDay = !!data.isAllDay || !data.Uhrzeit;
    const allDayCheckbox = document.getElementById('event-all-day');
    if (allDayCheckbox) allDayCheckbox.checked = isAllDay;
    const timeGroup = document.getElementById('time-group');
    if (timeGroup) {
        timeGroup.style.opacity = isAllDay ? '0.35' : '1';
        timeGroup.style.pointerEvents = isAllDay ? 'none' : 'auto';
    }

    document.getElementById('event-location').value = data.Ort || '';
    document.getElementById('event-link').value = data.OrtLink || data.Link || '';
    document.getElementById('event-description').value = data.Beschreibung || '';

    selectedType = data.Kategorie || allCategories[0];
    document.querySelectorAll('#event-type-chips .selectable-chip').forEach(c => {
        c.classList.toggle('selected', c.dataset.name === selectedType);
    });

    const birthYearInput = document.getElementById('event-birth-year');
    if (birthYearInput) birthYearInput.value = data.Geburtsjahr || '';
    updateCategoryDependentFields();

    formParticipants = { ...(data.Teilnehmer || {}) };
    renderFormParticipants();

    formGuests = {
        adults: data.Gäste?.adults || 0,
        children: data.Gäste?.children || 0
    };
    renderFormGuests();

    const recSelect = document.getElementById('event-recurrence');
    if (recSelect) {
        recSelect.value = data.Wiederholung || 'none';
        const recDuration = document.getElementById('event-recurrence-duration');
        if (recDuration) {
            recDuration.value = data.WiederholungDauer || 'forever';
            recDuration.style.display = (recSelect.value !== 'none') ? 'block' : 'none';
        }
    }

    const builder = document.getElementById('items-builder-container');
    builder.innerHTML = '';
    if (data.Mitbringliste && data.Mitbringliste.length > 0) {
        data.Mitbringliste.forEach(item => addItemBuilderRow(item.name || item));
    }
    if (autoAddNewItem) {
        addItemBuilderRow('');
        setTimeout(() => {
            const inputs = document.querySelectorAll('#items-builder-container .item-name-input');
            const lastInput = inputs[inputs.length - 1];
            if (lastInput) {
                lastInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                lastInput.focus();
            }
        }, 150);
    }

    document.getElementById('submit-event-btn').textContent = "Änderungen speichern";
    document.getElementById('cancel-edit-btn').style.display = "block";
    document.getElementById('header-sub-title').textContent = "Termin bearbeiten";

    window.closeEventDetails();
};

window.toggleGlobalTask = async function(eventId, itemIdx) {
    const ev = allEvents.find(e => e.id === eventId || e.baseId === eventId);
    if (!ev || !ev.Mitbringliste || !ev.Mitbringliste[itemIdx]) return;

    const items = [...ev.Mitbringliste];
    items[itemIdx].checked = !items[itemIdx].checked;

    const targetDocId = ev.baseId || ev.id;
    try {
        await setDoc(doc(db, "data_termine", targetDocId), {
            ...ev,
            id: targetDocId,
            Mitbringliste: items,
            lastAction: 'update'
        });
        renderAllTasks();
        updateTasksBadge();
    } catch (e) {
        console.error("Fehler beim Aktualisieren:", e);
    }
};

function updateTasksBadge() {
    const nowStr = new Date().toISOString().split('T')[0];
    let unfinishedCount = 0;
    const seenBaseIds = new Set();
    allEvents.filter(e => e.Datum >= nowStr && e.Mitbringliste).forEach(ev => {
        const bId = ev.baseId || ev.id;
        if (!seenBaseIds.has(bId)) {
            seenBaseIds.add(bId);
            (ev.Mitbringliste || []).forEach(item => {
                if (!item.checked) unfinishedCount++;
            });
        }
    });

    const badge = document.getElementById('tasks-badge');
    if (badge) {
        badge.textContent = unfinishedCount;
        if (unfinishedCount > 0) badge.classList.add('visible');
        else badge.classList.remove('visible');
    }
}

// ==========================================
// 11. Formular Logik (Neu / Bearbeiten)
// ==========================================
function calculateRecurrenceDates(startDateStr, recurrenceType, durationType) {
    if (!recurrenceType || recurrenceType === 'none') {
        return [startDateStr];
    }

    const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
    const startDate = new Date(startYear, startMonth - 1, startDay, 12, 0, 0);

    let maxMonths = 36;
    if (durationType === '3m') maxMonths = 3;
    else if (durationType === '6m') maxMonths = 6;
    else if (durationType === '1y') maxMonths = 12;
    else if (durationType === '2y') maxMonths = 24;
    else if (durationType === 'forever') maxMonths = 60;

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + maxMonths);

    const dates = [];
    let cur = new Date(startDate);

    if (recurrenceType === 'weekly') {
        while (cur <= endDate) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            dates.push(`${y}-${m}-${d}`);
            cur.setDate(cur.getDate() + 7);
        }
    } else if (recurrenceType === 'biweekly') {
        while (cur <= endDate) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            dates.push(`${y}-${m}-${d}`);
            cur.setDate(cur.getDate() + 14);
        }
    } else if (recurrenceType === 'monthly') {
        let step = 0;
        while (step <= maxMonths) {
            const targetDate = new Date(startYear, startMonth - 1 + step, startDay, 12, 0, 0);
            if (targetDate <= endDate) {
                const y = targetDate.getFullYear();
                const m = String(targetDate.getMonth() + 1).padStart(2, '0');
                const d = String(targetDate.getDate()).padStart(2, '0');
                dates.push(`${y}-${m}-${d}`);
            }
            step++;
        }
    } else if (recurrenceType === 'yearly') {
        const yearsCount = Math.max(1, Math.round(maxMonths / 12));
        for (let step = 0; step <= yearsCount; step++) {
            const targetDate = new Date(startYear + step, startMonth - 1, startDay, 12, 0, 0);
            const y = targetDate.getFullYear();
            const m = String(targetDate.getMonth() + 1).padStart(2, '0');
            const d = String(targetDate.getDate()).padStart(2, '0');
            dates.push(`${y}-${m}-${d}`);
        }
    }

    return dates.length > 0 ? dates : [startDateStr];
}

window.addItemBuilderRow = function(name = '') {
    const container = document.getElementById('items-builder-container');
    const row = document.createElement('div');
    row.className = 'item-builder-row';

    row.innerHTML = `
        <input type="text" class="form-control item-name-input" placeholder="z.B. Grillkohle, Salat, Kasten Bier, Zelt..." value="${name}" style="flex: 1;" required>
        <button type="button" class="btn-remove-item" onclick="this.closest('.item-builder-row').remove()" title="Entfernen">✕</button>
    `;
    container.appendChild(row);
};

function resetForm() {
    editingEventId = null;
    document.getElementById('event-form').reset();
    document.getElementById('submit-event-btn').textContent = "Termin speichern";
    document.getElementById('cancel-edit-btn').style.display = "none";
    document.getElementById('author-avatar').src = 'logo.png';
    document.getElementById('items-builder-container').innerHTML = '';
    
    const allDayCheckbox = document.getElementById('event-all-day');
    if (allDayCheckbox) allDayCheckbox.checked = false;
    const timeGroup = document.getElementById('time-group');
    if (timeGroup) {
        timeGroup.style.opacity = '1';
        timeGroup.style.pointerEvents = 'auto';
    }

    const recSelect = document.getElementById('event-recurrence');
    if (recSelect) recSelect.value = 'none';
    const recDuration = document.getElementById('event-recurrence-duration');
    if (recDuration) recDuration.style.display = 'none';

    const birthYearInput = document.getElementById('event-birth-year');
    if (birthYearInput) birthYearInput.value = '';

    formParticipants = {};
    const currentAuthor = document.getElementById('event-author')?.value;
    if (currentAuthor) formParticipants[currentAuthor] = 'yes';
    renderFormParticipants();

    formGuests = { adults: 0, children: 0 };
    renderFormGuests();

    selectedType = allCategories[0] || 'Essen';
    document.querySelectorAll('#event-type-chips .selectable-chip').forEach((c, idx) => {
        c.classList.toggle('selected', idx === 0);
    });
    updateCategoryDependentFields();

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('event-date').value = today;
}
window.resetForm = resetForm;

window.editEventFromDetail = function() {
    if (!currentDetailData) return;
    window.editEventById(currentDetailData.baseId || currentDetailData.id);
};

window.cancelEdit = function() {
    resetForm();
    window.switchTab('termine', document.querySelector('.tab-item[onclick*="termine"]'));
};

window.deleteCurrentEvent = function() {
    if (!currentDetailData) return;
    const ev = currentDetailData;
    const targetDocId = ev.baseId || ev.id;
    
    document.getElementById('confirm-modal-title').textContent = "Termin löschen?";
    document.getElementById('confirm-modal-text').textContent = `Möchtest du '${ev.Titel}' wirklich unwiderruflich löschen?`;
    
    const confirmBtn = document.getElementById('btn-confirm-action');
    confirmBtn.onclick = async () => {
        window.closeConfirmModal();
        window.showLoading(true, "Termin wird gelöscht...");
        try {
            await deleteDoc(doc(db, "data_termine", targetDocId));
            window.closeEventDetails();
            window.showAppModal("Gelöscht", "Der Termin wurde erfolgreich entfernt.");
        } catch (err) {
            console.error("Fehler beim Löschen:", err);
            window.showAppModal("Fehler", "Konnte nicht gelöscht werden: " + err.message);
        } finally {
            window.showLoading(false);
        }
    };
    
    document.getElementById('confirm-modal-container').style.display = 'flex';
};

document.getElementById('event-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const author = document.getElementById('event-author').value;
    const title = document.getElementById('event-title').value.trim();
    const date = document.getElementById('event-date').value;
    const time = document.getElementById('event-time').value;
    const location = document.getElementById('event-location').value.trim();
    const link = document.getElementById('event-link').value.trim();
    const description = document.getElementById('event-description').value.trim();
    const recurrence = document.getElementById('event-recurrence')?.value || 'none';
    const recurrenceDuration = document.getElementById('event-recurrence-duration')?.value || 'forever';
    const birthYearVal = document.getElementById('event-birth-year')?.value;
    const birthYear = birthYearVal ? parseInt(birthYearVal) : null;

    if (!author || !title || !date) {
        window.showAppModal("Angaben fehlen", "Bitte fülle Ersteller, Titel und Datum aus!");
        return;
    }

    const itemRows = document.querySelectorAll('#items-builder-container .item-builder-row');
    const items = Array.from(itemRows).map(row => ({
        name: row.querySelector('.item-name-input').value.trim(),
        checked: false
    })).filter(i => i.name !== "");

    window.showLoading(true, "Termin wird gespeichert...");

    let existingRsvp = { ...formParticipants };
    if (author && !existingRsvp[author]) {
        existingRsvp[author] = 'yes';
    }

    const isAllDay = document.getElementById('event-all-day').checked || !time;

    const baseEventData = {
        Ersteller: author,
        Titel: title,
        Uhrzeit: isAllDay ? '' : time,
        isAllDay: isAllDay,
        Ort: location || '',
        OrtLink: link || '',
        Kategorie: selectedType || 'Essen',
        Geburtsjahr: (selectedType === 'Geburtstag' && birthYear) ? birthYear : null,
        Beschreibung: description || '',
        Mitbringliste: items,
        Wiederholung: recurrence,
        WiederholungDauer: recurrenceDuration,
        createdAt: serverTimestamp(),
        lastAction: editingEventId ? 'update' : 'new'
    };

    try {
        const docId = editingEventId || `${date}_${title.replace(/[^\w\s-]/gi, '').replace(/\s+/g, '-') || 'Termin'}_${Date.now().toString().slice(-4)}`;

        await setDoc(doc(db, "data_termine", docId), {
            ...baseEventData,
            Datum: date,
            Teilnehmer: existingRsvp,
            Gäste: { adults: formGuests.adults || 0, children: formGuests.children || 0 }
        });

        const successMsg = editingEventId
            ? "Termin wurde erfolgreich aktualisiert!"
            : "Termin wurde erfolgreich im Kalender gespeichert!";
        window.showAppModal("Erfolg", successMsg);

        if (typeof confetti === 'function') {
            confetti({
                particleCount: 120,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#10b981', '#34d399', '#ffffff', '#f59e0b'],
                disableForReducedMotion: true
            });
        }

        resetForm();
        window.switchTab('termine', document.querySelector('.tab-item[onclick*="termine"]'));
    } catch (err) {
        console.error("Fehler beim Speichern:", err);
        window.showAppModal("Fehler", "Konnte nicht gespeichert werden: " + err.message);
    } finally {
        window.showLoading(false);
    }
});

const recSelectEl = document.getElementById('event-recurrence');
const recDurationEl = document.getElementById('event-recurrence-duration');
if (recSelectEl && recDurationEl) {
    recSelectEl.addEventListener('change', () => {
        if (recSelectEl.value !== 'none') {
            recDurationEl.style.display = 'block';
        } else {
            recDurationEl.style.display = 'none';
        }
    });
}

document.getElementById('event-author').addEventListener('change', (e) => {
    const name = e.target.value;
    const img = document.getElementById('author-avatar');
    img.src = `avatars/${name}.webp`;
    img.onerror = () => { img.src = 'logo.png'; };
    if (name) {
        formParticipants[name] = 'yes';
        renderFormParticipants();
    }
});

const allDayCheckbox = document.getElementById('event-all-day');
const timeGroup = document.getElementById('time-group');
if (allDayCheckbox && timeGroup) {
    allDayCheckbox.addEventListener('change', () => {
        if (allDayCheckbox.checked) {
            timeGroup.style.opacity = '0.35';
            timeGroup.style.pointerEvents = 'none';
            document.getElementById('event-time').value = '';
        } else {
            timeGroup.style.opacity = '1';
            timeGroup.style.pointerEvents = 'auto';
        }
    });
}

// ==========================================
// 13. Kasse Logik (Gemeinschaftskasse)
// ==========================================
let allKasseBookings = [];
let selectedKasseFilter = 'alle';
let editingKasseBookingId = null;
let currentKasseBookingType = 'einnahme';

function initKasseListener() {
    const colRef = collection(db, "data_kasse");
    onSnapshot(colRef, (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.betrag !== undefined) {
                list.push({ id: docSnap.id, ...data });
            }
        });
        allKasseBookings = list;
        renderKasseView();
    }, (error) => {
        console.error("Fehler beim Laden der Kasse:", error);
    });
}

function formatEuro(amount) {
    const num = parseFloat(amount) || 0;
    return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function renderKasseView() {
    const totalBalanceEl = document.getElementById('kasse-total-balance');
    const totalInEl = document.getElementById('kasse-total-in');
    const totalOutEl = document.getElementById('kasse-total-out');
    const container = document.getElementById('kasse-list-container');
    if (!totalBalanceEl || !container) return;

    let totalIn = 0;
    let totalOut = 0;

    allKasseBookings.forEach(b => {
        const amount = parseFloat(b.betrag) || 0;
        if (b.typ === 'einnahme') {
            totalIn += amount;
        } else if (b.typ === 'ausgabe') {
            totalOut += amount;
        }
    });

    const balance = totalIn - totalOut;
    totalBalanceEl.textContent = (balance >= 0 ? '+' : '') + formatEuro(balance);
    totalBalanceEl.className = `kasse-balance-amount ${balance < 0 ? 'negative' : ''}`;

    if (totalInEl) totalInEl.textContent = '+' + formatEuro(totalIn);
    if (totalOutEl) totalOutEl.textContent = '-' + formatEuro(totalOut);

    // Filtern
    let filtered = [...allKasseBookings];
    if (selectedKasseFilter === 'einnahme') {
        filtered = filtered.filter(b => b.typ === 'einnahme');
    } else if (selectedKasseFilter === 'ausgabe') {
        filtered = filtered.filter(b => b.typ === 'ausgabe');
    }

    // Sortieren: Neuestes Datum zuerst
    filtered.sort((a, b) => {
        const dateA = a.datum || '1970-01-01';
        const dateB = b.datum || '1970-01-01';
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        const tA = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : 0;
        const tB = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : 0;
        return tB - tA;
    });

    container.innerHTML = '';

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

    filtered.forEach(b => {
        const card = document.createElement('div');
        card.className = 'kasse-tx-card';
        const isIncome = (b.typ === 'einnahme');
        const formattedDate = formatDateObj(b.datum).formattedLong;

        card.innerHTML = `
            <div class="kasse-tx-icon ${isIncome ? 'positive' : 'negative'}">
                ${isIncome ? '🟢' : '🔴'}
            </div>
            <div class="kasse-tx-info">
                <div class="kasse-tx-title">${b.zweck || 'Buchung'}</div>
                <div class="kasse-tx-meta">
                    <span>📅 ${formattedDate}</span>
                    ${b.notiz ? `<span>• 📝 ${b.notiz}</span>` : ''}
                </div>
            </div>
            <div class="kasse-tx-right">
                <span class="kasse-tx-amount ${isIncome ? 'positive' : 'negative'}">
                    ${isIncome ? '+' : '-'}${formatEuro(b.betrag)}
                </span>
                <div class="kasse-tx-actions">
                    <button class="btn-tx-action" onclick="window.openKasseModalById('${b.id}')" title="Bearbeiten">✏️</button>
                    <button class="btn-tx-action" style="color: #ef4444;" onclick="window.deleteKasseBooking('${b.id}')" title="Löschen">🗑️</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    if (typeof renderPurchasesView === 'function') {
        renderPurchasesView();
    }
}
window.renderKasseView = renderKasseView;

window.filterKasse = function(filter, el) {
    selectedKasseFilter = filter;
    document.querySelectorAll('#kasse-filter-chips .filter-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    renderKasseView();
};

window.setKasseBookingType = function(type) {
    currentKasseBookingType = type;
    const btnIn = document.getElementById('btn-typ-einnahme');
    const btnOut = document.getElementById('btn-typ-ausgabe');

    if (type === 'einnahme') {
        if (btnIn) btnIn.classList.add('active');
        if (btnOut) btnOut.classList.remove('active');
    } else {
        if (btnOut) btnOut.classList.add('active');
        if (btnIn) btnIn.classList.remove('active');
    }
};

window.openKasseModal = function(booking = null) {
    const modal = document.getElementById('kasse-modal-container');
    if (!modal) return;

    if (booking) {
        editingKasseBookingId = booking.id;
        document.getElementById('kasse-modal-title').textContent = "✏️ Buchung bearbeiten";
        document.getElementById('kasse-amount').value = parseFloat(booking.betrag) || '';
        document.getElementById('kasse-purpose').value = booking.zweck || '';
        document.getElementById('kasse-date').value = booking.datum || '';
        document.getElementById('kasse-notes').value = booking.notiz || '';
        window.setKasseBookingType(booking.typ || 'einnahme');
    } else {
        editingKasseBookingId = null;
        document.getElementById('kasse-modal-title').textContent = "💰 Neue Buchung";
        document.getElementById('kasse-amount').value = '';
        document.getElementById('kasse-purpose').value = '';
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('kasse-date').value = today;
        document.getElementById('kasse-notes').value = '';
        window.setKasseBookingType('einnahme');
    }

    modal.style.display = 'flex';
};

window.openKasseModalById = function(id) {
    const booking = allKasseBookings.find(b => b.id === id);
    if (booking) window.openKasseModal(booking);
};

window.closeKasseModal = function() {
    const modal = document.getElementById('kasse-modal-container');
    if (modal) modal.style.display = 'none';
};

window.saveKasseBooking = async function() {
    const amountVal = parseFloat(document.getElementById('kasse-amount').value);
    const purposeVal = document.getElementById('kasse-purpose').value.trim();
    const dateVal = document.getElementById('kasse-date').value;
    const notesVal = document.getElementById('kasse-notes').value.trim();

    if (isNaN(amountVal) || amountVal <= 0) {
        window.showAppModal("Angabe fehlt", "Bitte gib einen gültigen Betrag größer als 0 € ein.");
        return;
    }
    if (!purposeVal) {
        window.showAppModal("Angabe fehlt", "Bitte gib einen Zweck für die Buchung an.");
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
        lastAction: editingKasseBookingId ? 'update' : 'new'
    };

    try {
        const docId = editingKasseBookingId || `kasse_${dateVal}_${Date.now()}`;
        await setDoc(doc(db, "data_kasse", docId), bookingData);

        if (currentKasseBookingType === 'einnahme' && typeof confetti === 'function') {
            confetti({
                particleCount: 80,
                spread: 60,
                origin: { y: 0.6 },
                colors: ['#10b981', '#34d399', '#f59e0b'],
                zIndex: 30000
            });
        }
    } catch (e) {
        console.error("Fehler beim Speichern der Buchung:", e);
        window.showAppModal("Fehler", "Konnte Buchung nicht speichern: " + e.message);
    } finally {
        window.showLoading(false);
    }
};

window.deleteKasseBooking = function(id) {
    const booking = allKasseBookings.find(b => b.id === id);
    if (!booking) return;

    document.getElementById('confirm-modal-title').textContent = "Buchung löschen?";
    document.getElementById('confirm-modal-text').textContent = `Möchtest du die Buchung '${booking.zweck}' (${formatEuro(booking.betrag)}) wirklich löschen?`;

    const confirmBtn = document.getElementById('btn-confirm-action');
    confirmBtn.onclick = async () => {
        window.closeConfirmModal();
        window.showLoading(true, "Buchung wird gelöscht...");
        try {
            await deleteDoc(doc(db, "data_kasse", id));
        } catch (e) {
            console.error("Fehler beim Löschen:", e);
            window.showAppModal("Fehler", "Konnte Buchung nicht löschen: " + e.message);
        } finally {
            window.showLoading(false);
        }
    };

    document.getElementById('confirm-modal-container').style.display = 'flex';
};

// ==========================================
// 14. Offene Anschaffungen Logik
// ==========================================
let allPurchases = [];
let selectedPurchaseFilter = 'alle';
let editingPurchaseId = null;
let currentPurchasePrio = 'hoch';

function initPurchasesListener() {
    const colRef = collection(db, "data_anschaffungen");
    onSnapshot(colRef, (snapshot) => {
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
    }, (error) => {
        console.error("Fehler beim Laden der Anschaffungen:", error);
    });
}

function updatePurchasesBadge() {
    const openCount = allPurchases.filter(p => !p.erledigt).length;
    const badge = document.getElementById('purchases-badge');
    if (badge) {
        badge.textContent = openCount;
        if (openCount > 0) badge.classList.add('visible');
        else badge.classList.remove('visible');
    }
}

function renderPurchasesView() {
    const container = document.getElementById('purchases-list-container');
    if (!container) return;

    // Kassenstand und Budget-Vergleich berechnen
    let totalIn = 0;
    let totalOut = 0;
    allKasseBookings.forEach(b => {
        const amount = parseFloat(b.betrag) || 0;
        if (b.typ === 'einnahme') totalIn += amount;
        else if (b.typ === 'ausgabe') totalOut += amount;
    });
    const kassenstand = totalIn - totalOut;

    let totalNeeded = 0;
    allPurchases.forEach(p => {
        if (!p.erledigt && p.preis) {
            totalNeeded += (parseFloat(p.preis) || 0);
        }
    });

    const diff = kassenstand - totalNeeded;
    const diffEl = document.getElementById('purchases-budget-diff');
    const labelEl = document.getElementById('purchases-budget-status-label');
    const subEl = document.getElementById('purchases-budget-status-sub');
    const kasseValEl = document.getElementById('purchases-kassenstand-val');
    const neededValEl = document.getElementById('purchases-total-needed-val');

    if (diffEl) {
        if (kasseValEl) kasseValEl.textContent = (kassenstand >= 0 ? '+' : '') + formatEuro(kassenstand);
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
    if (selectedPurchaseFilter === 'offen') {
        filtered = filtered.filter(p => !p.erledigt);
    } else if (selectedPurchaseFilter === 'erledigt') {
        filtered = filtered.filter(p => p.erledigt);
    }

    // Sortierung: Unfertig vor Fertig, dann Prio (hoch > mittel > idee), dann Datum
    const prioOrder = { 'hoch': 1, 'mittel': 2, 'idee': 3 };
    filtered.sort((a, b) => {
        if (!!a.erledigt !== !!b.erledigt) {
            return a.erledigt ? 1 : -1;
        }
        const prioA = prioOrder[a.prio] || 2;
        const prioB = prioOrder[b.prio] || 2;
        if (prioA !== prioB) return prioA - prioB;
        const tA = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : 0;
        const tB = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : 0;
        return tB - tA;
    });

    container.innerHTML = '';

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
        'hoch': '🔥 Dringend',
        'mittel': '⚡ Wichtig',
        'idee': '💡 Idee'
    };

    filtered.forEach(p => {
        const card = document.createElement('div');
        card.className = `purchase-card ${p.erledigt ? 'checked' : ''}`;
        const prioClass = p.prio || 'hoch';
        const prioText = prioLabels[prioClass] || 'Wichtig';

        card.innerHTML = `
            <div class="purchase-checkbox" onclick="window.togglePurchaseStatus('${p.id}')" title="${p.erledigt ? 'Als offen markieren' : 'Als angeschafft markieren'}">
                ✓
            </div>
            <div class="purchase-info" onclick="window.togglePurchaseStatus('${p.id}')">
                <div class="purchase-title">${p.titel}</div>
                <div class="purchase-meta">
                    <span class="prio-badge ${prioClass}">${prioText}</span>
                    ${p.preis ? `<span class="purchase-price-badge">~${formatEuro(p.preis)}</span>` : ''}
                    ${p.notiz ? `<span>• 📝 ${p.notiz}</span>` : ''}
                </div>
            </div>
            <div class="purchase-right">
                ${p.link ? `<a href="${p.link}" target="_blank" rel="noopener noreferrer" class="btn-purchase-link" title="Weblink öffnen">🔗</a>` : ''}
                <button class="btn-tx-action" onclick="window.openPurchaseModalById('${p.id}')" title="Bearbeiten">✏️</button>
                <button class="btn-tx-action" style="color: #ef4444;" onclick="window.deletePurchase('${p.id}')" title="Löschen">🗑️</button>
            </div>
        `;
        container.appendChild(card);
    });
}
window.renderPurchasesView = renderPurchasesView;

window.filterPurchases = function(filter, el) {
    selectedPurchaseFilter = filter;
    document.querySelectorAll('#purchase-filter-chips .filter-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    renderPurchasesView();
};

window.setPurchasePrio = function(prio) {
    currentPurchasePrio = prio;
    ['hoch', 'mittel', 'idee'].forEach(p => {
        const btn = document.getElementById(`btn-prio-${p}`);
        if (btn) {
            btn.classList.toggle('active', p === prio);
            if (p === prio) {
                if (p === 'hoch') btn.style.background = 'rgba(239, 68, 68, 0.25)';
                else if (p === 'mittel') btn.style.background = 'rgba(245, 158, 11, 0.25)';
                else if (p === 'idee') btn.style.background = 'rgba(14, 165, 233, 0.25)';
            } else {
                btn.style.background = 'transparent';
            }
        }
    });
};

window.openPurchaseModal = function(item = null) {
    const modal = document.getElementById('purchase-modal-container');
    if (!modal) return;

    if (item) {
        editingPurchaseId = item.id;
        document.getElementById('purchase-modal-title').textContent = "✏️ Anschaffung bearbeiten";
        document.getElementById('purchase-title').value = item.titel || '';
        document.getElementById('purchase-price').value = item.preis ? parseFloat(item.preis) : '';
        document.getElementById('purchase-link').value = item.link || '';
        document.getElementById('purchase-notes').value = item.notiz || '';
        window.setPurchasePrio(item.prio || 'hoch');
    } else {
        editingPurchaseId = null;
        document.getElementById('purchase-modal-title').textContent = "🛒 Neue Anschaffung";
        document.getElementById('purchase-title').value = '';
        document.getElementById('purchase-price').value = '';
        document.getElementById('purchase-link').value = '';
        document.getElementById('purchase-notes').value = '';
        window.setPurchasePrio('hoch');
    }

    modal.style.display = 'flex';
};

window.openPurchaseModalById = function(id) {
    const item = allPurchases.find(p => p.id === id);
    if (item) window.openPurchaseModal(item);
};

window.closePurchaseModal = function() {
    const modal = document.getElementById('purchase-modal-container');
    if (modal) modal.style.display = 'none';
};

window.savePurchase = async function() {
    const titleVal = document.getElementById('purchase-title').value.trim();
    const priceVal = parseFloat(document.getElementById('purchase-price').value);
    const linkVal = document.getElementById('purchase-link').value.trim();
    const notesVal = document.getElementById('purchase-notes').value.trim();

    if (!titleVal) {
        window.showAppModal("Angabe fehlt", "Bitte gib einen Gegenstand / Titel an.");
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
        erledigt: editingPurchaseId ? (allPurchases.find(p => p.id === editingPurchaseId)?.erledigt || false) : false,
        createdAt: serverTimestamp(),
        lastAction: editingPurchaseId ? 'update' : 'new'
    };

    try {
        const docId = editingPurchaseId || `anschaffung_${Date.now()}`;
        await setDoc(doc(db, "data_anschaffungen", docId), purchaseData);

        if (!editingPurchaseId && typeof confetti === 'function') {
            confetti({
                particleCount: 70,
                spread: 50,
                origin: { y: 0.6 },
                colors: ['#0ea5e9', '#10b981', '#f59e0b'],
                zIndex: 30000
            });
        }
    } catch (e) {
        console.error("Fehler beim Speichern der Anschaffung:", e);
        window.showAppModal("Fehler", "Konnte Anschaffung nicht speichern: " + e.message);
    } finally {
        window.showLoading(false);
    }
};

window.togglePurchaseStatus = async function(id) {
    const item = allPurchases.find(p => p.id === id);
    if (!item) return;

    try {
        await setDoc(doc(db, "data_anschaffungen", id), {
            ...item,
            erledigt: !item.erledigt,
            lastAction: 'update'
        });
    } catch (e) {
        console.error("Fehler beim Umschalten des Status:", e);
    }
};

window.deletePurchase = function(id) {
    const item = allPurchases.find(p => p.id === id);
    if (!item) return;

    document.getElementById('confirm-modal-title').textContent = "Anschaffung löschen?";
    document.getElementById('confirm-modal-text').textContent = `Möchtest du '${item.titel}' wirklich löschen?`;

    const confirmBtn = document.getElementById('btn-confirm-action');
    confirmBtn.onclick = async () => {
        window.closeConfirmModal();
        window.showLoading(true, "Anschaffung wird gelöscht...");
        try {
            await deleteDoc(doc(db, "data_anschaffungen", id));
        } catch (e) {
            console.error("Fehler beim Löschen:", e);
            window.showAppModal("Fehler", "Konnte Anschaffung nicht löschen: " + e.message);
        } finally {
            window.showLoading(false);
        }
    };

    document.getElementById('confirm-modal-container').style.display = 'flex';
};

// ==========================================
// 12. Initialisierung beim Laden
// ==========================================
// Sofortiges Rendern der UI
renderCalendarWidget();
filterAndRender();
renderKasseView();
renderPurchasesView();
updateNotificationButton();
renderFormParticipants();
renderFormGuests();

// Firebase Auth & Realtime Listeners
initAuthorsListener();
initCategoriesListener();
initEventsListener();
initKasseListener();
initPurchasesListener();

// ==========================================
// 16. Readme & Info Modal Logik
// ==========================================
function parseMarkdownToHtml(md) {
    if (!md) return '';
    let html = md
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/^### (.*$)/gim, '<h4 style="color: #34d399; font-size: 0.95rem; font-weight: 800; margin: 14px 0 6px 0;">$1</h4>')
        .replace(/^## (.*$)/gim, '<h3 style="color: #6ee7b7; font-size: 1.05rem; font-weight: 800; margin: 18px 0 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">$1</h3>')
        .replace(/^# (.*$)/gim, '<h2 style="color: #ffffff; font-size: 1.15rem; font-weight: 900; margin: 0 0 10px 0;">$1</h2>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong style="color: #ffffff;">$1</strong>')
        .replace(/\*(.*?)\*/gim, '<span style="color: #a7f3d0;">$1</span>')
        .replace(/^---$/gim, '<hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.08); margin: 12px 0;">')
        .replace(/^\* (.*$)/gim, '<li style="margin-bottom: 5px; margin-left: 18px;">$1</li>')
        .replace(/`([^`]+)`/gim, '<code style="background: rgba(255,255,255,0.1); padding: 1px 5px; border-radius: 4px; color: #a7f3d0; font-size: 0.8rem;">$1</code>');

    return html;
}

window.openReadmeModal = async function() {
    const modal = document.getElementById('readme-modal-container');
    const body = document.getElementById('readme-content-body');
    const verEl = document.getElementById('readme-modal-version');
    if (!modal || !body) return;

    modal.style.display = 'flex';
    if (verEl) {
        const appVer = document.getElementById('app-version')?.textContent || 'Version 2.5.0';
        verEl.textContent = appVer;
    }

    try {
        const res = await fetch('README.md?t=' + Date.now());
        if (!res.ok) throw new Error('README.md konnte nicht geladen werden');
        const text = await res.text();
        body.innerHTML = parseMarkdownToHtml(text);
    } catch (e) {
        body.innerHTML = `<div style="color: #f87171; text-align: center; padding: 20px;">Fehler beim Laden der Anleitung: ${e.message}</div>`;
    }
};

window.closeReadmeModal = function() {
    const modal = document.getElementById('readme-modal-container');
    if (modal) modal.style.display = 'none';
};


signInAnonymously(auth).then(() => {
    console.log("Klapsentouren: Anonym bei Firebase angemeldet.");
}).catch((error) => {
    console.warn("Anonymer Login Hinweis:", error);
});
