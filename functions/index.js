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
  };
}

function formatEventDate(date) {
  const match = String(date || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : date;
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
    const actionText = event.datumFlexibel || !event.datum
      ? "hat einen Termin vorgemerkt"
      : "hat einen Termin eingetragen";

    console.log(`Neuer Termin erstellt: "${titel}" von ${ersteller}`);

    // Dynamisches Autoren-Profilbild ermitteln
    const knownAvatars = [
      "Daniel",
      "Daniela",
      "Peter",
      "Simone",
      "Tanja",
      "Thorsten",
    ];
    const matchedAvatar = knownAvatars.find(
      (a) => a.toLowerCase() === (ersteller || "").trim().toLowerCase(),
    );
    const icon = matchedAvatar ? `avatars/${matchedAvatar}.webp` : "logo.png";

    const actions = [{ action: "open_event", title: "📅 Kalender" }];
    if (event.ort) {
      actions.push({ action: "open_maps", title: "🗺️ Navigation" });
    }

    await broadcastPushNotification(
      {
        title: `📅 Neuer Termin: ${titel}`,
        body: `${ersteller} ${actionText}${describeEvent(event)}.`,
        url: "./index.html",
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
      beforeEvent.ort === afterEvent.ort
    ) {
      return null;
    }

    const { titel, ersteller } = afterEvent;

    console.log(`Termin aktualisiert: "${titel}"`);

    const knownAvatars = [
      "Daniel",
      "Daniela",
      "Peter",
      "Simone",
      "Tanja",
      "Thorsten",
    ];
    const matchedAvatar = knownAvatars.find(
      (a) => a.toLowerCase() === (ersteller || "").trim().toLowerCase(),
    );
    const icon = matchedAvatar ? `avatars/${matchedAvatar}.webp` : "logo.png";

    const actions = [{ action: "open_event", title: "📅 Kalender" }];
    if (afterEvent.ort) {
      actions.push({ action: "open_maps", title: "🗺️ Navigation" });
    }

    await broadcastPushNotification(
      {
        title: "Termin aktualisiert 🔄",
        body: `'${titel}' wurde aktualisiert.`,
        url: "./index.html",
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
      title: "Termin abgesagt / gelöscht 🗑️",
      body: `'${event.titel}'${describeEvent(event)} wurde entfernt.`,
      url: "./index.html",
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

    // Monatsstatistik live ermitteln
    let monthCount = 0;
    try {
      const currentMonthKey = new Date().toISOString().slice(0, 7);
      const kistenSnap = await db.collection("data_stauder_kisten").get();
      kistenSnap.forEach((doc) => {
        const d = doc.data();
        if (d.datum && d.datum.startsWith(currentMonthKey)) {
          monthCount += Number(d.anzahl) || 1;
        }
      });
    } catch (e) {
      console.warn("Fehler beim Abrufen der Monatskisten:", e);
    }

    const countInfo =
      monthCount > 0
        ? `\n📦 Monatsstand: ${monthCount} Kiste${monthCount === 1 ? "" : "n"}`
        : "";

    await broadcastPushNotification(
      {
        title: "🍺 Stauder-Alarm: Nachschub ist da!",
        body: `${kaeufer} hat ${kistenText} Stauder geholt! 🍻${countInfo}`,
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

    let title = "💰 Kasse: Neue Buchung";
    let body = `${formattedBetrag} für ${zweck}\nNeuer Kontostand: ${saldoText}`;

    if (typ === "einnahme") {
      title = `💰 Kasse: +${formattedBetrag} eingezahlt!`;
      body = `Zahler: ${zweck}\nNeuer Kontostand: ${saldoText}`;
    } else {
      title = `💸 Kasse: -${formattedBetrag} ausgegeben`;
      body = `Zweck: ${zweck}\nNeuer Kontostand: ${saldoText}`;
    }

    await broadcastPushNotification(
      {
        title,
        body,
        url: "./index.html#kasse",
        tag: `kasse-booking-${docId}`,
        actions: [{ action: "open_kasse", title: "💳 Kasse ansehen" }],
      },
      typ === "einnahme" ? zweck : null,
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
        ? ` (~${preis.toFixed(2).replace(".", ",")} €)`
        : "";

    console.log(`Neue Anschaffung: "${titel}"`);

    await broadcastPushNotification({
      title: "🛒 Neue Anschaffung!",
      body: `'${titel}' wurde auf die Wunschliste gesetzt!${preisText}`,
      url: "./index.html",
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
      ? "📌 Neues Wunsch-Lokal!"
      : "🍽️ Neues Lokal im Guide!";
    const body = `${author} hat '${name}'${ort} ${isGeplant ? "vorgemerkt" : "eingetragen und bewertet"}.`;

    await broadcastPushNotification(
      {
        title,
        body,
        url: "./index.html",
        tag: `lokal-${docId}`,
      },
      author,
    );
    return null;
  });

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
      const ev = { ...rawEvent, Titel: fields.titel, Datum: fields.datum,
        Enddatum: fields.enddatum, Uhrzeit: fields.uhrzeit, Ort: fields.ort };
      if (!ev.Datum || !ev.Titel || ev.DatumFlexibel) continue;

      const parts = ev.Datum.split("-");
      if (parts.length !== 3) continue;

      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const day = parseInt(parts[2]);
      const isAllDay = !!ev.isAllDay || !ev.Uhrzeit;

      if (isAllDay) {
        // Vorabend-Erinnerung ab 20:00 Uhr für den nächsten Tag
        const eveReminderStart = new Date(year, month, day - 1, 19, 45, 0);
        const eveReminderEnd = new Date(year, month, day - 1, 20, 30, 0);
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
            title: `☀️ Morgen: ${ev.Titel}`,
            body: `Morgen steht '${ev.Titel}' an!${ev.Ort ? " (📍 " + ev.Ort + ")" : ""}`,
            url: "./index.html",
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

        const eventStartTime = new Date(year, month, day, hours, minutes, 0);
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
            title: `⏰ In 2 Stunden: ${ev.Titel}`,
            body: `Um ${ev.Uhrzeit} Uhr geht's los: '${ev.Titel}'${ev.Ort ? " (📍 " + ev.Ort + ")" : ""}`,
            url: "./index.html",
            mapsQuery: ev.Ort || "",
            actions: timedActions,
            tag: reminderKey,
          });
          sentReminders[reminderKey] = now.toISOString();
          newSentKeys = true;
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
