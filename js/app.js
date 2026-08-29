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
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn("Persistence: Multiple tabs open");
    } else if (err.code === 'unimplemented') {
        console.warn("Persistence not supported by browser");
    }
});

// ==========================================
// 2. Globale Variablen & State
// ==========================================
const DEFAULT_AUTHORS = ["Daniel", "Daniela", "Peter", "Simone", "Tanja", "Thorsten"];
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

let allAuthors = [...DEFAULT_AUTHORS];
let allCategories = [...DEFAULT_CATEGORIES];
let allEvents = [];
let selectedCategory = 'Alle';
let selectedType = 'Essen';
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
    onSnapshot(docRef, (docSnap) => {
        const select = document.getElementById('event-author');
        const currentVal = select.value;

        if (docSnap.exists() && Array.isArray(docSnap.data().names)) {
            allAuthors = docSnap.data().names;
        } else {
            allAuthors = [...DEFAULT_AUTHORS];
            setDoc(docRef, { names: DEFAULT_AUTHORS }).catch(() => {});
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
    }, (e) => {
        console.warn("Ersteller Listener Fehler:", e);
    });
}

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
            };
            formChipsCont.appendChild(sChip);
        });

        if (!allCategories.includes(selectedType)) {
            selectedType = allCategories[0] || 'Essen';
        }

        filterAndRender();
    }, (e) => {
        console.warn("Kategorien Listener Fehler:", e);
    });
}

// ==========================================
// 5. Firestore Realtime Listener
// ==========================================
function initEventsListener() {
    const colRef = collection(db, "data_termine");
    onSnapshot(colRef, (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => {
            if (docSnap.id === "Ersteller" || docSnap.id === "Art") return;
            const data = docSnap.data();
            if (data.Titel && data.Datum) {
                list.push({ id: docSnap.id, ...data });
            }
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
        allEvents = list;
        renderCalendarWidget();
        filterAndRender();
        updateTasksBadge();
        checkUpcomingReminders();
        
        if (currentDetailData) {
            const refreshed = allEvents.find(e => e.id === currentDetailData.id);
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
    if (!dateStr) return { day: '--', monthShort: '---', weekdayShort: '---', formattedLong: '--' };
    const parts = dateStr.split('-');
    const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return {
        day: String(parts[2]),
        monthShort: MONTH_NAMES_SHORT[dateObj.getMonth()] || '',
        weekdayShort: WEEKDAY_NAMES_SHORT[dateObj.getDay()] || '',
        formattedLong: `${WEEKDAY_NAMES_LONG[dateObj.getDay()]}, ${parseInt(parts[2])}. ${MONTH_NAMES_LONG[dateObj.getMonth()]} ${parts[0]}`
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
        let participantStackHtml = '';
        if (yesMembers.length > 0) {
            const maxPreview = 3;
            const avatarsHtml = yesMembers.slice(0, maxPreview).map(name => `
                <img src="avatars/${name}.webp" onerror="this.src='logo.png'" class="participant-mini" alt="${name}">
            `).join('');
            const remaining = yesMembers.length > maxPreview ? `+${yesMembers.length - maxPreview}` : '';
            participantStackHtml = `
                <div class="participant-stack">
                    ${avatarsHtml}
                    <span class="participant-count-badge">${yesMembers.length} dabei ${remaining}</span>
                </div>
            `;
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

    titleEl.textContent = `${MONTH_NAMES_LONG[calCurrentMonth]} ${calCurrentYear}`;

    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDay = now.getDate();
    const todayStr = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`;

    // Termine zählen pro Datum
    const eventDatesMap = {};
    allEvents.forEach(ev => {
        if (ev.Datum) {
            eventDatesMap[ev.Datum] = (eventDatesMap[ev.Datum] || 0) + 1;
        }
    });

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
        cell.textContent = d;
        gridEl.appendChild(cell);
    }

    // Tage des aktuellen Monats
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${calCurrentYear}-${String(calCurrentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = (dateStr === todayStr);
        const isSelected = (dateStr === selectedCalendarDate);
        const eventsOnDay = allEvents.filter(ev => ev.Datum === dateStr);
        const hasEvents = eventsOnDay.length > 0;

        const cell = document.createElement('div');
        let classes = ['calendar-day-cell'];
        if (isToday) classes.push('today');
        if (isSelected) classes.push('selected');
        if (hasEvents) classes.push('has-events');

        cell.className = classes.join(' ');
        cell.textContent = d;
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
        cell.textContent = d;
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

function filterAndRender() {
    const searchEl = document.getElementById('event-search');
    const sortEl = document.getElementById('event-sort');
    const sectionTitleEl = document.getElementById('events-section-title');
    const clearBtn = document.getElementById('btn-clear-date-filter');

    const query = (searchEl ? searchEl.value : '').toLowerCase().trim();
    const sortType = sortEl ? sortEl.value : 'upcoming';

    const now = new Date();
    const nowStr = now.toISOString().split('T')[0];
    
    // 30 Tage Limit
    const future30 = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
    const future30Str = future30.toISOString().split('T')[0];

    let filtered = [];

    if (selectedCalendarDate) {
        // Bestimmter Tag im Kalender ausgewählt
        filtered = allEvents.filter(ev => ev.Datum === selectedCalendarDate);
        const formatted = formatDateObj(selectedCalendarDate).formattedLong;
        if (sectionTitleEl) sectionTitleEl.textContent = `Termine am ${formatted}`;
        if (clearBtn) clearBtn.style.display = 'inline-block';
    } else {
        // Standard: Anstehend in den nächsten 30 Tagen (oder Vollsuche bei Textsuche)
        filtered = allEvents.filter(ev => {
            if (!ev.Datum) return false;
            if (query) return true;
            return ev.Datum >= nowStr && ev.Datum <= future30Str;
        });

        if (sectionTitleEl) {
            sectionTitleEl.textContent = query 
                ? `Suchergebnisse (${filtered.length})` 
                : `Anstehend (nächste 30 Tage • ${filtered.length})`;
        }
        if (clearBtn) clearBtn.style.display = 'none';
    }

    // Filter nach Kategorie & Query
    filtered = filtered.filter(ev => {
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

function renderDetailRSVP(data) {
    const container = document.getElementById('rsvp-members-container');
    container.innerHTML = '';
    const rsvp = data.Teilnehmer || {};

    allAuthors.forEach((name) => {
        const status = rsvp[name] || 'none';
        const card = document.createElement('div');
        card.className = `rsvp-card status-${status}`;
        
        let statusIcon = '❔';
        if (status === 'yes') statusIcon = '✅';
        else if (status === 'maybe') statusIcon = '❓';
        else if (status === 'no') statusIcon = '❌';

        card.innerHTML = `
            <img src="avatars/${name}.webp" onerror="this.src='logo.png'" class="rsvp-card-avatar" alt="${name}">
            <span class="rsvp-name">${name}</span>
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

            try {
                await setDoc(doc(db, "data_termine", data.id), {
                    ...data,
                    Teilnehmer: updatedRsvp,
                    lastAction: 'update'
                });
            } catch (err) {
                console.error("Fehler beim Aktualisieren des RSVP:", err);
            }
        };

        container.appendChild(card);
    });
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
            <span class="checklist-name">${item.name}</span>
            ${item.assignedTo ? `<span class="checklist-assignee">${item.assignedTo.includes('und') ? '👫' : '👤'} ${item.assignedTo}</span>` : ''}
        </div>
    `).join('');
}

window.toggleEventTask = async function(idx) {
    if (!currentDetailData) return;
    const items = [...(currentDetailData.Mitbringliste || [])];
    if (!items[idx]) return;

    items[idx].checked = !items[idx].checked;
    try {
        await setDoc(doc(db, "data_termine", currentDetailData.id), {
            ...currentDetailData,
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
// 9. Aufgaben / Mitbringsel Tab
// ==========================================
function renderAllTasks() {
    const container = document.getElementById('all-tasks-container');
    container.innerHTML = '';

    const nowStr = new Date().toISOString().split('T')[0];
    const upcomingEvents = allEvents.filter(e => e.Datum >= nowStr && e.Mitbringliste && e.Mitbringliste.length > 0);

    if (upcomingEvents.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); margin-top: 40px;">
                <div style="font-size: 2.5rem; margin-bottom: 10px;">🎒</div>
                <h3 style="color: white; margin: 0 0 6px 0;">Alles erledigt!</h3>
                <p style="font-size: 0.85rem;">Keine offenen Mitbringsel oder Aufgaben für anstehende Termine.</p>
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
            <div class="checklist-item-row ${item.checked ? 'checked' : ''}" onclick="window.toggleGlobalTask('${ev.id}', ${idx})">
                <div class="checklist-checkbox">✓</div>
                <span class="checklist-name">${item.name}</span>
                ${item.assignedTo ? `<span class="checklist-assignee">${item.assignedTo.includes('und') ? '👫' : '👤'} ${item.assignedTo}</span>` : ''}
            </div>
        `).join('');

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; margin-bottom: 8px;">
                <h4 style="margin: 0; color: var(--accent-color); font-size: 1rem; font-weight: 800;">${ev.Titel}</h4>
                <span style="font-size: 0.75rem; color: #94a3b8;">📅 ${formatDateObj(ev.Datum).formattedLong}</span>
            </div>
            <div>${itemsHtml}</div>
        `;
        container.appendChild(card);
    });
}
window.renderAllTasks = renderAllTasks;

window.toggleGlobalTask = async function(eventId, itemIdx) {
    const ev = allEvents.find(e => e.id === eventId);
    if (!ev || !ev.Mitbringliste || !ev.Mitbringliste[itemIdx]) return;

    const items = [...ev.Mitbringliste];
    items[itemIdx].checked = !items[itemIdx].checked;

    try {
        await setDoc(doc(db, "data_termine", eventId), {
            ...ev,
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
    allEvents.filter(e => e.Datum >= nowStr).forEach(ev => {
        (ev.Mitbringliste || []).forEach(item => {
            if (!item.checked) unfinishedCount++;
        });
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
window.addItemBuilderRow = function(name = '', assignedTo = '') {
    const container = document.getElementById('items-builder-container');
    const row = document.createElement('div');
    row.className = 'item-builder-row';

    const couples = [
        "Daniela und Daniel",
        "Simone und Peter",
        "Tanja und Thorsten"
    ];

    const coupleOptions = couples.map(c => `<option value="${c}" ${assignedTo === c ? 'selected' : ''}>👫 ${c}</option>`).join('');
    const singleOptions = allAuthors.map(a => `<option value="${a}" ${assignedTo === a ? 'selected' : ''}>👤 ${a}</option>`).join('');

    row.innerHTML = `
        <input type="text" class="form-control item-name-input" placeholder="z.B. Grillkohle, Salat, Kasten Bier..." value="${name}" style="flex: 2;" required>
        <select class="form-control item-assignee-select" style="flex: 1.3;">
            <option value="">Wer bringt's mit?</option>
            <optgroup label="Paare / Teams">
                ${coupleOptions}
            </optgroup>
            <optgroup label="Einzeln">
                ${singleOptions}
            </optgroup>
        </select>
        <button type="button" class="btn-remove-item" onclick="this.closest('.item-builder-row').remove()">✕</button>
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

    selectedType = allCategories[0] || 'Essen';
    document.querySelectorAll('#event-type-chips .selectable-chip').forEach((c, idx) => {
        c.classList.toggle('selected', idx === 0);
    });

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('event-date').value = today;
}
window.resetForm = resetForm;

window.editEventFromDetail = function() {
    if (!currentDetailData) return;
    const data = currentDetailData;
    editingEventId = data.id;

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

    const builder = document.getElementById('items-builder-container');
    builder.innerHTML = '';
    if (data.Mitbringliste && data.Mitbringliste.length > 0) {
        data.Mitbringliste.forEach(item => addItemBuilderRow(item.name, item.assignedTo));
    }

    document.getElementById('submit-event-btn').textContent = "Änderungen speichern";
    document.getElementById('cancel-edit-btn').style.display = "block";
    document.getElementById('header-sub-title').textContent = "Termin bearbeiten";

    window.closeEventDetails();
};

window.cancelEdit = function() {
    resetForm();
    window.switchTab('termine', document.querySelector('.tab-item[onclick*="termine"]'));
};

window.deleteCurrentEvent = function() {
    if (!currentDetailData) return;
    const ev = currentDetailData;
    
    document.getElementById('confirm-modal-title').textContent = "Termin löschen?";
    document.getElementById('confirm-modal-text').textContent = `Möchtest du '${ev.Titel}' wirklich unwiderruflich löschen?`;
    
    const confirmBtn = document.getElementById('btn-confirm-action');
    confirmBtn.onclick = async () => {
        window.closeConfirmModal();
        window.showLoading(true, "Termin wird gelöscht...");
        try {
            await deleteDoc(doc(db, "data_termine", ev.id));
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

    if (!author || !title || !date) {
        window.showAppModal("Angaben fehlen", "Bitte fülle Ersteller, Titel und Datum aus!");
        return;
    }

    const itemRows = document.querySelectorAll('#items-builder-container .item-builder-row');
    const items = Array.from(itemRows).map(row => ({
        name: row.querySelector('.item-name-input').value.trim(),
        assignedTo: row.querySelector('.item-assignee-select').value,
        checked: false
    })).filter(i => i.name !== "");

    window.showLoading(true, "Termin wird gespeichert...");

    let existingRsvp = {};
    if (editingEventId) {
        const current = allEvents.find(ev => ev.id === editingEventId);
        if (current && current.Teilnehmer) existingRsvp = current.Teilnehmer;
    } else {
        existingRsvp[author] = 'yes';
    }

    const isAllDay = document.getElementById('event-all-day').checked || !time;

    const eventData = {
        Ersteller: author,
        Titel: title,
        Datum: date,
        Uhrzeit: isAllDay ? '' : time,
        isAllDay: isAllDay,
        Ort: location || '',
        OrtLink: link || '',
        Kategorie: selectedType || 'Essen',
        Beschreibung: description || '',
        Mitbringliste: items,
        Teilnehmer: existingRsvp,
        createdAt: serverTimestamp(),
        lastAction: editingEventId ? 'update' : 'new'
    };

    try {
        const sanitizedTitle = title.replace(/[^\w\s-]/gi, '').replace(/\s+/g, '-');
        const docId = editingEventId || `${date}_${sanitizedTitle || 'Termin'}_${Date.now().toString().slice(-4)}`;

        await setDoc(doc(db, "data_termine", docId), eventData);

        window.showAppModal("Erfolg", "Termin wurde erfolgreich im Kalender gespeichert!");

        if (typeof confetti === 'function') {
            confetti({
                particleCount: 120,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#10b981', '#34d399', '#ffffff', '#f59e0b'],
                zIndex: 30000
            });
        }

        resetForm();

        setTimeout(() => {
            window.switchTab('termine', document.querySelector('.tab-item[onclick*="termine"]'));
        }, 1200);

    } catch (error) {
        console.error("Fehler beim Speichern:", error);
        window.showAppModal("Fehler", "Speichern fehlgeschlagen: " + error.message);
    } finally {
        window.showLoading(false);
    }
});

document.getElementById('event-author').addEventListener('change', (e) => {
    const name = e.target.value;
    const img = document.getElementById('author-avatar');
    img.src = `avatars/${name}.webp`;
    img.onerror = () => { img.src = 'logo.png'; };
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
// 12. Initialisierung beim Laden
// ==========================================
signInAnonymously(auth).then(() => {
    console.log("Klapsentouren: Anonym bei Firebase angemeldet.");
    renderCalendarWidget();
    initAuthorsListener();
    initCategoriesListener();
    initEventsListener();
    updateNotificationButton();
}).catch((error) => {
    console.error("Login Fehler:", error);
    window.firebaseDataReceived = true;
    if (typeof window.attemptHideSplash === 'function') window.attemptHideSplash();
    window.showAppModal("Offline-Modus", "Anmeldung bei Firebase nicht möglich. Offline-Daten werden geladen.");
});
