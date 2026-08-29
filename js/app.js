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
const DEFAULT_CATEGORIES = ["Wanderung", "Ausflug", "Party / Feier", "Urlaub / Reise", "Sport / Billard", "Essen & Trinken", "Geburtstag", "Sonstiges"];

let allAuthors = [...DEFAULT_AUTHORS];
let allCategories = [...DEFAULT_CATEGORIES];
let allEvents = [];
let selectedCategory = 'Alle';
let selectedType = 'Wanderung';
let editingEventId = null;
let currentDetailData = null;
let isInitialLoad = true;

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
            sendLocalNotification("KlapsenCal 🔔", "Benachrichtigungen sind erfolgreich aktiviert!");
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
// 4. Autoren & Kategorien laden
// ==========================================
async function loadAuthors() {
    const select = document.getElementById('event-author');
    try {
        const docRef = doc(db, "data_termine", "Ersteller");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && Array.isArray(docSnap.data().names)) {
            allAuthors = docSnap.data().names;
        } else {
            setDoc(docRef, { names: DEFAULT_AUTHORS }).catch(() => {});
        }
    } catch (e) {
        console.warn("Ersteller Fallback verwendet:", e);
    }

    select.innerHTML = '<option value="" disabled selected>Wähle Ersteller...</option>';
    allAuthors.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
}

async function loadCategories() {
    const filterCont = document.getElementById('filter-container');
    const formChipsCont = document.getElementById('event-type-chips');

    try {
        const docRef = doc(db, "data_termine", "Art");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && Array.isArray(docSnap.data().typ)) {
            allCategories = docSnap.data().typ;
        } else {
            setDoc(docRef, { typ: DEFAULT_CATEGORIES }).catch(() => {});
        }
    } catch (e) {
        console.warn("Kategorien Fallback verwendet:", e);
    }

    // Filter Chips rendern
    filterCont.innerHTML = '<div class="filter-chip active" onclick="window.selectCategory(\'Alle\', this)">Alle</div>';
    formChipsCont.innerHTML = '';

    allCategories.forEach((cat, idx) => {
        const fChip = document.createElement('div');
        fChip.className = 'filter-chip';
        fChip.textContent = cat;
        fChip.onclick = (e) => window.selectCategory(cat, e.currentTarget);
        filterCont.appendChild(fChip);

        const sChip = document.createElement('div');
        sChip.className = `selectable-chip ${idx === 0 ? 'selected' : ''}`;
        sChip.textContent = cat;
        sChip.dataset.name = cat;
        sChip.onclick = () => {
            selectedType = cat;
            document.querySelectorAll('#event-type-chips .selectable-chip').forEach(c => c.classList.remove('selected'));
            sChip.classList.add('selected');
        };
        formChipsCont.appendChild(sChip);
    });
    selectedType = allCategories[0] || 'Wanderung';
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
        filterAndRender();
        updateTasksBadge();
        
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
        const timeStr = item.Uhrzeit ? ` • ⏰ ${item.Uhrzeit} Uhr` : '';
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
                    <span class="event-tag">${item.Kategorie || 'Vorhaben'}</span>
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

function filterAndRender() {
    const searchEl = document.getElementById('event-search');
    const sortEl = document.getElementById('event-sort');
    const query = (searchEl ? searchEl.value : '').toLowerCase().trim();
    const sortType = sortEl ? sortEl.value : 'upcoming';

    const filtered = allEvents.filter(ev => {
        const matchesCategory = (selectedCategory === 'Alle') || (ev.Kategorie === selectedCategory);
        const matchesQuery = !query || 
            (ev.Titel && ev.Titel.toLowerCase().includes(query)) ||
            (ev.Ort && ev.Ort.toLowerCase().includes(query)) ||
            (ev.Ersteller && ev.Ersteller.toLowerCase().includes(query)) ||
            (ev.Beschreibung && ev.Beschreibung.toLowerCase().includes(query));
        return matchesCategory && matchesQuery;
    });

    filtered.sort((a, b) => {
        const dateA = a.Datum || '9999-99-99';
        const dateB = b.Datum || '9999-99-99';
        const timeA = a.Uhrzeit || '00:00';
        const timeB = b.Uhrzeit || '00:00';
        const fullA = `${dateA}T${timeA}`;
        const fullB = `${dateB}T${timeB}`;

        if (sortType === 'upcoming') {
            const nowStr = new Date().toISOString().split('T')[0];
            const isPastA = a.Datum < nowStr;
            const isPastB = b.Datum < nowStr;
            if (isPastA && !isPastB) return 1;
            if (!isPastA && isPastB) return -1;
            return fullA.localeCompare(fullB);
        } else if (sortType === 'newest') {
            const tA = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : 0;
            const tB = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : 0;
            return tB - tA;
        } else if (sortType === 'oldest') {
            return fullA.localeCompare(fullB);
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
    document.getElementById('detail-category-tag').textContent = data.Kategorie || 'Vorhaben';
    
    const cdContainer = document.getElementById('detail-countdown');
    if (countdown.badgeText) {
        cdContainer.innerHTML = `<span class="countdown-badge ${countdown.badgeClass}" style="font-size: 0.75rem; padding: 4px 10px;">${countdown.badgeText}</span>`;
        cdContainer.style.display = 'block';
    } else {
        cdContainer.style.display = 'none';
    }

    const startFormatted = formatDateObj(data.Datum).formattedLong;
    const endFormatted = data.Enddatum ? ` bis ${formatDateObj(data.Enddatum).formattedLong}` : '';
    document.getElementById('detail-date-str').textContent = `${startFormatted}${endFormatted}`;
    document.getElementById('detail-time-str').textContent = data.Uhrzeit ? `${data.Uhrzeit} Uhr` : 'Ganztägig / flexibel';
    document.getElementById('detail-location-str').textContent = data.Ort || 'Wird noch bekanntgegeben';
    document.getElementById('detail-author-str').textContent = data.Ersteller || 'Unbekannt';

    const mapsBtn = document.getElementById('btn-open-maps');
    const linkBtn = document.getElementById('btn-open-link');
    
    if (data.OrtLink) {
        mapsBtn.href = data.OrtLink;
        mapsBtn.style.display = 'flex';
    } else if (data.Ort) {
        mapsBtn.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.Ort)}`;
        mapsBtn.style.display = 'flex';
    } else {
        mapsBtn.style.display = 'none';
    }

    if (data.Link) {
        linkBtn.href = data.Link;
        linkBtn.style.display = 'flex';
    } else {
        linkBtn.style.display = 'none';
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
            ${item.assignedTo ? `<span class="checklist-assignee">👤 ${item.assignedTo}</span>` : ''}
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
// 9. Kalender Export (.ics)
// ==========================================
window.exportToICS = function() {
    if (!currentDetailData) return;
    const ev = currentDetailData;
    const startDate = (ev.Datum || '').replace(/-/g, '');
    const startTime = (ev.Uhrzeit || '00:00').replace(/:/g, '') + '00';
    const startICS = `${startDate}T${startTime}`;

    let endICS = startICS;
    if (ev.Enddatum) {
        const endDate = ev.Enddatum.replace(/-/g, '');
        endICS = `${endDate}T235959`;
    }

    const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//KlapsenCal//DE',
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `SUMMARY:${ev.Titel || 'Klapsen-Termin'}`,
        `DESCRIPTION:${(ev.Beschreibung || '').replace(/\n/g, '\\n')}`,
        `LOCATION:${ev.Ort || ''}`,
        `DTSTART:${startICS}`,
        `DTEND:${endICS}`,
        `STATUS:CONFIRMED`,
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `${(ev.Titel || 'Termin').replace(/\s+/g, '_')}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.showAppModal("Kalender-Export", "Die .ics Kalenderdatei wurde heruntergeladen!");
};

// ==========================================
// 10. Aufgaben / Mitbringsel Tab
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
                ${item.assignedTo ? `<span class="checklist-assignee">👤 ${item.assignedTo}</span>` : ''}
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

    const authorOptions = allAuthors.map(a => `<option value="${a}" ${assignedTo === a ? 'selected' : ''}>${a}</option>`).join('');

    row.innerHTML = `
        <input type="text" class="form-control item-name-input" placeholder="z.B. Grillkohle, Salat, Kasten Bier..." value="${name}" style="flex: 2;" required>
        <select class="form-control item-assignee-select" style="flex: 1.2;">
            <option value="">Wer bringt's mit?</option>
            ${authorOptions}
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
    
    selectedType = allCategories[0] || 'Wanderung';
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
    document.getElementById('event-end-date').value = data.Enddatum || '';
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
    const endDate = document.getElementById('event-end-date').value;
    const location = document.getElementById('event-location').value.trim();
    const link = document.getElementById('event-link').value.trim();
    const description = document.getElementById('event-description').value.trim();

    if (!author || !title || !date) {
        window.showAppModal("Angaben fehlen", "Bitte fülle Ersteller, Titel und Startdatum aus!");
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

    const eventData = {
        Ersteller: author,
        Titel: title,
        Datum: date,
        Uhrzeit: time || '',
        Enddatum: endDate || '',
        Ort: location || '',
        OrtLink: link || '',
        Kategorie: selectedType || 'Vorhaben',
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

// ==========================================
// 12. Initialisierung beim Laden
// ==========================================
signInAnonymously(auth).then(() => {
    console.log("KlapsenCal: Anonym bei Firebase angemeldet.");
    loadAuthors();
    loadCategories();
    initEventsListener();
    updateNotificationButton();
}).catch((error) => {
    console.error("Login Fehler:", error);
    window.firebaseDataReceived = true;
    if (typeof window.attemptHideSplash === 'function') window.attemptHideSplash();
    window.showAppModal("Offline-Modus", "Anmeldung bei Firebase nicht möglich. Offline-Daten werden geladen.");
});
