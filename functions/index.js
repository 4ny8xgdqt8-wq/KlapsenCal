const functions = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const webpush = require("web-push");

admin.initializeApp();
const db = admin.firestore();

function getEventFields(data = {}) {
  return {
    titel: data.Titel || data.titel || "",
    datum: data.Datum || data.datum || "",
    enddatum: data.Enddatum || data.enddatum || "",
    datumFlexibel: !!data.DatumFlexibel,
    uhrzeit: data.Uhrzeit || data.uhrzeit || "",
    ort: data.Ort || data.ort || "",
    ersteller: data.Ersteller || data.ersteller || "Jemand",
    kategorie: data.Kategorie || data.Art || "",
  };
}

function formatEventDate(date) {
  const match = String(date || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : date;
}

function getAbsentNames(data) {
  const names = Object.entries(data.Teilnehmer || {})
    .filter(([, status]) => status === "yes")
    .map(([name]) => name);
  return names.length ? names : [getEventFields(data).ersteller];
}

function berlinDateToUtc(year, month, day, hour, minute) {
  const wallTime = Date.UTC(year, month, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    timeZoneName: "longOffset",
  });
  const offsetAt = (timestamp) => {
    const zone = formatter.formatToParts(new Date(timestamp))
      .find((part) => part.type === "timeZoneName").value;
    const match = zone.match(/^GMT([+-])(\d{2}):(\d{2})$/);
    if (!match) throw new Error("Berliner Zeitzone konnte nicht ermittelt werden");
    return (match[1] === "+" ? 1 : -1) *
      (Number(match[2]) * 60 + Number(match[3])) * 60 * 1000;
  };
  const firstGuess = wallTime - offsetAt(wallTime);
  return new Date(wallTime - offsetAt(firstGuess));
}

function describeEvent(fields) {
  const date = formatEventDate(fields.datum);
  const endDate = formatEventDate(fields.enddatum);
  const dateText = fields.datumFlexibel
    ? date && endDate
      ? ` (möglicher Zeitraum: ${date} bis ${endDate})`
      : date
        ? ` (möglicher Zeitraum ab ${date})`
        : ""
    : date
      ? ` am ${date}${endDate && endDate !== date ? `–${endDate}` : ""}`
      : "";
  const timeText = fields.uhrzeit ? ` um ${fields.uhrzeit} Uhr` : "";
  const placeText = fields.ort ? ` in ${fields.ort}` : "";
  return `${dateText}${timeText}${placeText}`;
}

// VAPID-Schlüssel für KlapsenCal Web-Push
const VAPID_PUBLIC_KEY =
  "BBoShmX0jnhjLknD_zoYn5qdmjfzChdDWGaiKnPM3avttbI7WcZRe6N-dT5JxpoQLk0dCwOtXNGKrnIEVnTwNO8";
const VAPID_PRIVATE_KEY = "9Hy0Dr2qj6wJuxY4_bUz2UyuEYuFa3OcTzdBIVwpDx8";

webpush.setVapidDetails(
  "mailto:kontakt@klapsencal.app",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

/**
 * Sendet eine Web-Push-Nachricht an alle in Firestore hinterlegten Geräte
 * und bereinigt abgelaufene/deinstallierte Abonnements automatisch.
 */
async function broadcastPushNotification(payload, excludeAuthor = null) {
  try {
    const subsSnapshot = await db.collection("push_subscriptions").get();
    if (subsSnapshot.empty) {
      console.log("Keine aktiven Push-Abonnements vorhanden.");
      return;
    }

    const payloadString = JSON.stringify(payload);
    const deleteBatch = db.batch();
    let deleteCount = 0;

    const pushPromises = subsSnapshot.docs.map(async (docSnap) => {
      const data = docSnap.data();

      const tag = payload.tag || "";
      const category = tag.startsWith("event-") ? "events"
        : tag.startsWith("eve_") || tag.startsWith("timed_") ? "reminders"
          : tag.startsWith("stauder-") ? "stauder"
            : tag.startsWith("kasse-") ? "kasse"
              : tag.startsWith("anschaffung-") ? "purchases"
                : tag.startsWith("lokal-") ? "locales" : "";
      if (category && data.preferences?.[category] === false) return;

      // Optional: Autor der Aktion nicht selbst benachrichtigen
      if (
        excludeAuthor &&
        data.author &&
        data.author.toLowerCase() === excludeAuthor.toLowerCase()
      ) {
        return;
      }

      const subscription = {
        endpoint: data.endpoint,
        keys: data.keys,
      };

      try {
        await webpush.sendNotification(subscription, payloadString);
      } catch (err) {
        // 404 (Not Found) oder 410 (Gone): Gerät hat Push deinstalliert oder Token ist abgelaufen
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.log(`Bereinige abgelaufenes Abonnement: ${docSnap.id}`);
          deleteBatch.delete(docSnap.ref);
          deleteCount++;
        } else {
          console.warn(`Fehler beim Senden an ${docSnap.id}:`, err.message);
        }
      }
    });

    await Promise.all(pushPromises);

    if (deleteCount > 0) {
      await deleteBatch.commit();
      console.log(`Insgesamt ${deleteCount} veraltete Abonnements gelöscht.`);
    }
  } catch (error) {
    console.error("Fehler beim Broadcast der Push-Nachricht:", error);
  }
}

/**
 * 1. Neuer Termin angelegt -> Push an alle Handys (1st Gen, kein Eventarc nötig)
 */
exports.onEventCreated = functions
  .region("europe-west1")
  .firestore.document("data_termine/{docId}")
  .onCreate(async (snap, context) => {
    const docId = context.params.docId;
    if (docId === "Ersteller" || docId === "Art") return null;

    const data = snap.data();
    const event = getEventFields(data);
    if (!event.titel) return null;

    const { titel, ersteller } = event;
    const isOpenDate = event.datumFlexibel || !event.datum;

    console.log(`Neuer Termin erstellt: "${titel}" von ${ersteller}`);

    // Dynamisches Autoren-Profilbild ermitteln
    const knownAvatars = [
      "Daniel",
      "Daniela",
      "Dani",
      "Peter",
      "Simone",
      "MamaMone",
      "Tanja",
      "Thorsten",
    ];
    const matchedAvatar = knownAvatars.find(
      (a) => a.toLowerCase() === (ersteller || "").trim().toLowerCase(),
    );
    const avatarName = matchedAvatar === "Dani" ? "Daniela" : matchedAvatar === "MamaMone" ? "Simone" : matchedAvatar;
    const icon = avatarName ? `avatars/${avatarName}.webp` : "logo.png";

    const actions = [{ action: "open_event", title: "📅 Kalender" }];
    if (event.ort) {
      actions.push({ action: "open_maps", title: "🗺️ Navigation" });
    }

    await broadcastPushNotification(
      {
        title: event.kategorie === "Urlaub / Abwesend"
          ? `${getAbsentNames(data).join(", ")} nicht da`
          : isOpenDate
            ? `${ersteller} hat etwas vorgemerkt ✨`
            : `${ersteller} plant: ${titel} 📅`,
        body: event.kategorie === "Urlaub / Abwesend"
          ? `Abwesend${describeEvent(event)}.`
          : isOpenDate
            ? `${titel} ist vorgemerkt${describeEvent(event)}.`
            : `${titel}${describeEvent(event)}.`,
        url: "./index.html#termine",
        icon,
        mapsQuery: event.ort,
        actions,
        tag: `event-created-${docId}`,
      },
      ersteller,
    );
    return null;
  });

/**
 * 2. Termin aktualisiert -> Push an alle Handys (1st Gen)
 */
exports.onEventUpdated = functions
  .region("europe-west1")
  .firestore.document("data_termine/{docId}")
  .onUpdate(async (change, context) => {
    const docId = context.params.docId;
    if (docId === "Ersteller" || docId === "Art") return null;

    const beforeData = change.before.data();
    const afterData = change.after.data();
    const beforeEvent = getEventFields(beforeData);
    const afterEvent = getEventFields(afterData);
    if (!afterEvent.titel) return null;

    // Nur senden, wenn sich relevante Inhalte geändert haben
    if (
      beforeEvent.titel === afterEvent.titel &&
      beforeEvent.datum === afterEvent.datum &&
      beforeEvent.enddatum === afterEvent.enddatum &&
      beforeEvent.datumFlexibel === afterEvent.datumFlexibel &&
      beforeEvent.uhrzeit === afterEvent.uhrzeit &&
      beforeEvent.ort === afterEvent.ort &&
      beforeEvent.kategorie === afterEvent.kategorie &&
      (afterEvent.kategorie !== "Urlaub / Abwesend" ||
        JSON.stringify(getAbsentNames(beforeData).sort()) ===
          JSON.stringify(getAbsentNames(afterData).sort()))
    ) {
      return null;
    }

    const { titel, ersteller } = afterEvent;

    console.log(`Termin aktualisiert: "${titel}"`);

    const knownAvatars = [
      "Daniel",
      "Daniela",
      "Dani",
      "Peter",
      "Simone",
      "MamaMone",
      "Tanja",
      "Thorsten",
    ];
    const matchedAvatar = knownAvatars.find(
      (a) => a.toLowerCase() === (ersteller || "").trim().toLowerCase(),
    );
    const avatarName = matchedAvatar === "Dani" ? "Daniela" : matchedAvatar === "MamaMone" ? "Simone" : matchedAvatar;
    const icon = avatarName ? `avatars/${avatarName}.webp` : "logo.png";

    const actions = [{ action: "open_event", title: "📅 Kalender" }];
    if (afterEvent.ort) {
      actions.push({ action: "open_maps", title: "🗺️ Navigation" });
    }

    await broadcastPushNotification(
      {
        title: afterEvent.kategorie === "Urlaub / Abwesend"
          ? `${getAbsentNames(afterData).join(", ")} nicht da – geändert`
          : `Neue Infos: ${titel} 🔄`,
        body: describeEvent(afterEvent)
          ? `Aktualisiert${describeEvent(afterEvent)}.`
          : "Der Eintrag wurde geändert.",
        url: "./index.html#termine",
        icon,
        mapsQuery: afterEvent.ort,
        actions,
        tag: `event-updated-${docId}`,
      },
      ersteller,
    );
    return null;
  });

/**
 * 3. Termin gelöscht -> Push an alle Handys (1st Gen)
 */
exports.onEventDeleted = functions
  .region("europe-west1")
  .firestore.document("data_termine/{docId}")
  .onDelete(async (snap, context) => {
    const docId = context.params.docId;
    if (docId === "Ersteller" || docId === "Art") return null;

    const event = getEventFields(snap.data());
    if (!event.titel) return null;

    console.log(`Termin gelöscht: "${event.titel}"`);

    await broadcastPushNotification({
      title: `${event.titel} wurde entfernt 🗑️`,
      body: `Der Eintrag${describeEvent(event)} steht nicht mehr im Kalender.`,
      url: "./index.html#termine",
      tag: `event-deleted-${docId}`,
    });
    return null;
  });

/**
 * 4. Stauder-Kiste geholt -> Push an alle Handys (Vorschlag 1: Stauder-Alarm)
 */
exports.onStauderKisteCreated = functions
  .region("europe-west1")
  .firestore.document("data_stauder_kisten/{docId}")
  .onCreate(async (snap, context) => {
    const docId = context.params.docId;
    const data = snap.data();
    if (!data) return null;

    const kaeufer = data.kaeufer || "Jemand";
    const anzahl = Number(data.anzahl) || 1;
    const kistenText = anzahl === 1 ? "1 Kiste" : `${anzahl} Kisten`;

    console.log(`Neue Stauder-Kiste erfasst: ${kistenText} von ${kaeufer}`);

    await broadcastPushNotification(
      {
        title: `${kaeufer} sorgt für Nachschub 🍻`,
        body: `${kistenText} Stauder ${anzahl === 1 ? "ist" : "sind"} da!`,
        url: "./index.html#stauder",
        icon: "images/stauder.webp",
        tag: `stauder-kiste-${docId}`,
        actions: [
          { action: "prost", title: "🍻 Prost!" },
          { action: "open_stauder", title: "📦 Kisten-Verlauf" },
        ],
      },
      kaeufer,
    );
    return null;
  });

/**
 * 5. Kassen-Buchung erfasst -> Push an alle Handys (Vorschlag 3: Kassen-Radar)
 */
exports.onKasseBookingCreated = functions
  .region("europe-west1")
  .firestore.document("data_kasse/{docId}")
  .onCreate(async (snap, context) => {
    const docId = context.params.docId;
    const data = snap.data();
    if (!data) return null;

    const typ = data.typ || "einnahme";
    const betrag = Number(data.betrag) || 0;
    const formattedBetrag =
      betrag.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " €";
    const zweck = data.zweck || (typ === "einnahme" ? "Einzahlung" : "Ausgabe");

    console.log(`Neue Kassen-Buchung: ${typ} ${formattedBetrag} (${zweck})`);

    // Gesamt-Kassenstand berechnen
    let totalSaldo = 0;
    try {
      const kasseSnap = await db.collection("data_kasse").get();
      kasseSnap.forEach((docSnap) => {
        const b = docSnap.data();
        const amt = Number(b.betrag) || 0;
        if (b.typ === "einnahme") totalSaldo += amt;
        else if (b.typ === "ausgabe") totalSaldo -= amt;
      });
    } catch (e) {
      console.warn("Fehler beim Abrufen des Kassenstands:", e);
    }

    const saldoText =
      totalSaldo.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " €";

    let title = "Neue Buchung in der Kasse 💰";
    let body = `${formattedBetrag} · ${zweck}\nKassenstand: ${saldoText}`;

    if (typ === "einnahme") {
      title = "Die Kasse wächst 💚";
      body = `${formattedBetrag} eingezahlt · ${zweck}\nKassenstand: ${saldoText}`;
    } else {
      title = "Aus der Kasse bezahlt 💸";
      body = `${formattedBetrag} ausgegeben · ${zweck}\nKassenstand: ${saldoText}`;
    }

    await broadcastPushNotification(
      {
        title,
        body,
        url: "./index.html#kasse",
        tag: `kasse-booking-${docId}`,
        actions: [{ action: "open_kasse", title: "💳 Kasse ansehen" }],
      },
    );
    return null;
  });

/**
 * 6. Neue Anschaffung / Wunschliste -> Push an alle Handys
 */
exports.onAnschaffungCreated = functions
  .region("europe-west1")
  .firestore.document("data_anschaffungen/{docId}")
  .onCreate(async (snap, context) => {
    const docId = context.params.docId;
    const data = snap.data();
    if (!data || !data.titel) return null;

    const titel = data.titel;
    const preis = Number(data.preis);
    const preisText =
      !isNaN(preis) && preis > 0
        ? ` · ungefähr ${preis.toFixed(2).replace(".", ",")} €`
        : "";

    console.log(`Neue Anschaffung: "${titel}"`);

    await broadcastPushNotification({
      title: "Eine neue Idee für die Klapse 💡",
      body: preisText ? `${titel}${preisText}.` : `${titel} steht auf der Wunschliste.`,
      url: "./index.html#anschaffungen",
      tag: `anschaffung-${docId}`,
    });
    return null;
  });

/**
 * 7. Neues Lokal / Restaurant -> Push an alle Handys
 */
exports.onLokalCreated = functions
  .region("europe-west1")
  .firestore.document("data_einkehr/{docId}")
  .onCreate(async (snap, context) => {
    const docId = context.params.docId;
    const data = snap.data();
    if (!data || !data.name) return null;

    const name = data.name;
    const ort = data.ort ? ` in ${data.ort}` : "";
    const author = data.author || "Jemand";
    const isGeplant = data.status === "geplant";

    console.log(`Neues Lokal eingetragen: "${name}" von ${author}`);

    const title = isGeplant
      ? `${author} hat eine Lokal-Idee 💡`
      : `${author} hat ein Lokal entdeckt 🍽️`;
    const body = isGeplant
      ? `${name}${ort} steht auf der Wunschliste.`
      : `${name}${ort} ist jetzt im Guide.`;

    await broadcastPushNotification(
      {
        title,
        body,
        url: "./index.html#lokale",
        tag: `lokal-${docId}`,
      },
      author,
    );
    return null;
  });

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
  else if (durationType === "forever") {
    const today = new Date();
    maxMonths = Math.max(60, (today.getFullYear() - startYear) * 12 + today.getMonth() - (startMonth - 1) + 24);
  }

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

function reminderCandidateDates(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type) => Number(parts.find((item) => item.type === type).value);
  const today = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  return [0, 1].map((days) => new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10));
}

function eventOccursOn(ev, date) {
  if (ev.Enddatum && ev.Enddatum > ev.Datum) {
    const elapsed = (Date.parse(date + "T00:00:00Z") - Date.parse(ev.Datum + "T00:00:00Z")) / 86400000;
    return date >= ev.Datum && date <= ev.Enddatum && elapsed < 90;
  }
  if (!ev.Wiederholung || ev.Wiederholung === "none") return date === ev.Datum;
  return calculateRecurrenceDates(ev.Datum, ev.Wiederholung, ev.WiederholungDauer || "forever").includes(date);
}

function normalizeEventDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : "";
}

/**
 * 8. Zeitgesteuerte Terminerinnerungen (alle 15 Minuten)
 * Erinnert 2 Stunden vor Startzeit bzw. am Vorabend um 20:00 Uhr bei ganztägigen Terminen
 */
exports.checkScheduledReminders = onSchedule(
  "every 15 minutes",
  async (event) => {
    const now = new Date();
    const eventsSnapshot = await db.collection("data_termine").get();
    if (eventsSnapshot.empty) return;

    // Protokoll bereits versendeter Erinnerungen aus Firestore laden
    const reminderLogRef = db.collection("system_reminders").doc("sent_log");
    const reminderDoc = await reminderLogRef.get();
    const sentReminders = reminderDoc.exists
      ? reminderDoc.data().keys || {}
      : {};
    let newSentKeys = false;

    for (const docSnap of eventsSnapshot.docs) {
      if (docSnap.id === "Ersteller" || docSnap.id === "Art") continue;
      const rawEvent = docSnap.data();
      const fields = getEventFields(rawEvent);
      const ev = { ...rawEvent, Titel: fields.titel, Datum: normalizeEventDate(fields.datum),
        Enddatum: normalizeEventDate(fields.enddatum), Uhrzeit: fields.uhrzeit, Ort: fields.ort };
      if (!ev.Datum || !ev.Titel || ev.DatumFlexibel) continue;

      const originalDate = ev.Datum;
      for (const occurrenceDate of reminderCandidateDates(now)) {
        if (!eventOccursOn({ ...ev, Datum: originalDate }, occurrenceDate)) continue;
        ev.Datum = occurrenceDate;
        const parts = ev.Datum.split("-");
        if (parts.length !== 3) continue;

        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        const isAllDay = !!ev.isAllDay || !ev.Uhrzeit;

        if (isAllDay) {
          // Vorabend-Erinnerung ab 20:00 Uhr für den nächsten Tag
          const eveReminderStart = berlinDateToUtc(year, month, day - 1, 20, 0);
          const eveReminderEnd = new Date(eveReminderStart.getTime() + 30 * 60 * 1000);
          const reminderKey = `eve_${docSnap.id}_${ev.Datum}`;

          if (
            now >= eveReminderStart &&
            now <= eveReminderEnd &&
            !sentReminders[reminderKey]
          ) {
            const eveActions = [];
            if (ev.Ort) {
              eveActions.push({ action: "open_maps", title: "🧭 Route planen" });
            }
            eveActions.push({
              action: "open_tasks",
              title: "📋 Aufgaben prüfen",
            });

            await broadcastPushNotification({
              title: `Morgen: ${ev.Titel} ☀️`,
              body: `Morgen steht ${ev.Titel} an.${ev.Ort ? " Ort: " + ev.Ort + "." : ""}`,
              url: "./index.html#termine",
              mapsQuery: ev.Ort || "",
              actions: eveActions,
              tag: reminderKey,
            });
            sentReminders[reminderKey] = now.toISOString();
            newSentKeys = true;
          }
        } else {
          // 2 Stunden vorher erinnern
          const timeParts = (ev.Uhrzeit || "00:00").split(":");
          const hours = parseInt(timeParts[0]) || 0;
          const minutes = parseInt(timeParts[1]) || 0;

          const eventStartTime = berlinDateToUtc(year, month, day, hours, minutes);
          const twoHoursBefore = new Date(
            eventStartTime.getTime() - 2 * 60 * 60 * 1000,
          );
          const reminderWindowEnd = new Date(
            eventStartTime.getTime() - 1 * 60 * 60 * 1000,
          );
          const reminderKey = `timed_${docSnap.id}_${ev.Datum}_${ev.Uhrzeit}`;

          if (
            now >= twoHoursBefore &&
            now <= reminderWindowEnd &&
            !sentReminders[reminderKey]
          ) {
            const timedActions = [];
            if (ev.Ort) {
              timedActions.push({
                action: "open_maps",
                title: "🧭 Route starten",
              });
            }
            timedActions.push({ action: "open_tasks", title: "📋 Was fehlt?" });

            await broadcastPushNotification({
              title: `Bald: ${ev.Titel} ⏰`,
              body: `Um ${ev.Uhrzeit} Uhr geht's los${ev.Ort ? " · " + ev.Ort : ""}.`,
              url: "./index.html#termine",
              mapsQuery: ev.Ort || "",
              actions: timedActions,
              tag: reminderKey,
            });
            sentReminders[reminderKey] = now.toISOString();
            newSentKeys = true;
          }
        }
      }
    }

    if (newSentKeys) {
      await reminderLogRef.set(
        {
          keys: sentReminders,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);
