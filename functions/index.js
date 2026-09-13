const functions = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const webpush = require("web-push");

admin.initializeApp();
const db = admin.firestore();

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
    if (!data || !data.Titel) return null;

    const titel = data.Titel;
    const datum = data.Datum || "";
    const ersteller = data.Ersteller || "Jemand";
    const ort = data.Ort ? ` (📍 ${data.Ort})` : "";

    console.log(`Neuer Termin erstellt: "${titel}" von ${ersteller}`);

    await broadcastPushNotification(
      {
        title: "Neuer Termin! 📅",
        body: `${ersteller} hat '${titel}' (${datum}) eingetragen.${ort}`,
        url: "./index.html",
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
    if (!afterData || !afterData.Titel) return null;

    // Nur senden, wenn sich relevante Inhalte geändert haben
    if (
      beforeData.Titel === afterData.Titel &&
      beforeData.Datum === afterData.Datum &&
      beforeData.Uhrzeit === afterData.Uhrzeit &&
      beforeData.Ort === afterData.Ort
    ) {
      return null;
    }

    const titel = afterData.Titel;
    const ersteller = afterData.Ersteller || "Jemand";

    console.log(`Termin aktualisiert: "${titel}"`);

    await broadcastPushNotification(
      {
        title: "Termin aktualisiert 🔄",
        body: `'${titel}' wurde aktualisiert.`,
        url: "./index.html",
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

    const data = snap.data();
    if (!data || !data.Titel) return null;

    console.log(`Termin gelöscht: "${data.Titel}"`);

    await broadcastPushNotification({
      title: "Termin abgesagt / gelöscht 🗑️",
      body: `'${data.Titel}' am ${data.Datum || ""} wurde entfernt.`,
      url: "./index.html",
      tag: `event-deleted-${docId}`,
    });
    return null;
  });

/**
 * 4. Zeitgesteuerte Terminerinnerungen (alle 15 Minuten)
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
      const ev = docSnap.data();
      if (!ev.Datum || !ev.Titel) continue;

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
          await broadcastPushNotification({
            title: `☀️ Morgen: ${ev.Titel}`,
            body: `Morgen steht '${ev.Titel}' an!${ev.Ort ? " (📍 " + ev.Ort + ")" : ""}`,
            url: "./index.html",
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
          await broadcastPushNotification({
            title: `⏰ In 2 Stunden: ${ev.Titel}`,
            body: `Um ${ev.Uhrzeit} Uhr geht's los: '${ev.Titel}'${ev.Ort ? " (📍 " + ev.Ort + ")" : ""}`,
            url: "./index.html",
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
