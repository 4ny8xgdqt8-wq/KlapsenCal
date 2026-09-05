## 🚀 Aktueller Walkthrough & Feature-Übersicht

### 1. ⏳ Zeitraum-Filter (Schnelle zeitliche Übersicht)

- **Direktfilter-Buttons**: Schnelles Umschalten des Zeithorizonts auf Tab 1:
  - **`30 Tage`** _(Standardaktiv)_: Zeigt die nächsten 30 Tage.
  - **`60 Tage`**: Erweiterte Vorausschau auf die nächsten 2 Monate.
  - **`Dieses Jahr`**: Alle verbleibenden Termine des aktuellen Kalenderjahres.
  - **`Nächstes Jahr`**: Vorschau auf alle Termine des kommenden Jahres.
  - **`Alle`**: Vollständige Liste aller Termine.

---

### 2. 🎂 Geburtstag mit Geburtsjahr & automatischer Altersberechnung

- **Dynamisches Eingabefeld**: Sobald im Formular die Kategorie **„Geburtstag“** ausgewählt wird, erscheint direkt das breite Eingabefeld **„🎂 Geburtsjahr (für Altersanzeige)“**.
- **Smarte Voreinstellungen**: Bei Auswahl von _Geburtstag_ wird automatisch auf **☀️ Ganztägig** und **🔁 Jährlich** voreingestellt.
- **Dynamische Altersberechnung**:
  - Auf jeder Terminkarte wird das Alter passend zum jeweiligen Veranstaltungsjahr angezeigt (z. B. `🎂 36. Geb.`).
  - **Runde Geburtstage** (z. B. 18, 20, 30, 40, 50, 60, 70, ...) erhalten automatisch ein golden leuchtendes Jubiläums-Badge (`🎉 40. Geburtstag (Runder Jubeltag!)`).
  - Im Detail-Modal wird das Alter samt Geburtsjahr übersichtlich ausgewiesen.

---

### 3. 👥 Teilnehmer direkt beim Erstellen auswählen

- **Interaktive Teilnehmer-Chips**: Beim Anlegen oder Bearbeiten eines Termins können die teilnehmenden Personen direkt per Klick ausgewählt/abgewählt werden.
- **Schnellauswahl-Aktionen**:
  - `Alle`: Wählt alle Gruppenmitglieder mit einem Klick aus.
  - `Nur Erw.`: Wählt alle Erwachsenen aus.
  - `Keine`: Setzt die Auswahl zurück (der Ersteller bleibt ausgewählt).
- **Automatischer Ersteller-Sync**: Wählt man den Ersteller aus, wird dieser automatisch als Teilnehmer vorgemerkt.

---

### 4. 🔁 Sich wiederholende Termine (Schlanke 1-Dokument-Speicherung)

- **Saubere Firestore-Architektur**: Jeder Serientermin wird als **genau 1 Dokument** in der Datenbank gespeichert – keine Datenredundanz und kein Datenbank-Müll.
- **Dynamische Kalender-Expansion**: Die Folgetermine werden im Browser zur Laufzeit für Kalender-Widget, Terminliste und Aufgaben berechnet.
- **Flexible Intervalle**:
  - ❌ _Einmaliger Termin_
  - 🔁 _Wöchentlich_ (z. B. wöchentlicher Sport / Treffen)
  - 🔁 _Alle 2 Wochen_ (z. B. zweiwöchentlicher Dart-/Spieleabend)
  - 🔁 _Monatlich_ (z. B. monatlicher Stammtisch am selben Tag)
  - 🔁 _Alle 2 Monate_
  - 🔁 _Alle 3 Monate_ (Quartal)
  - 🔁 _Jährlich_ (z. B. Geburtstage, Jahrestage)
- **Kompaktes Design**: Intervall und Dauer stehen direkt nebeneinander in einer Reihe.
- **Einstellbare Seriendauer**: _♾️ Immer (fortlaufend)_, _1 Jahr_, _2 Jahre_, _6 Monate_, _3 Monate_.
- **Zentrales Bearbeiten & Löschen**: Änderungen oder Löschen des Serientermins passen sofort alle zukünftigen Kalendertage an.

---

### 5. 📋 „Was fehlt noch für die Termine“ (Mitbringliste & Aufgaben)

- Zentraler Tab mit allen offenen Besorgungen und Mitbringseln aller anstehenden Termine.
- **➕ Schnell-Hinzufügen**: Mit einem Klick auf _„➕ Weiteren Punkt hinzufügen“_ springt die App direkt in den Bearbeitungsmodus und fokussiert sofort das neue Textfeld.
- Einfache Checkboxen zum schnellen Abhaken (`Fehlt noch` / `Erledigt ✓`).
- Dynamischer Badge-Zähler in der Tab-Leiste.

---

### 6. 🛒 Offene Anschaffungen (Wishlist & Budget-Deckung)

- Wunschliste für gemeinsame Anschaffungen der Gruppe (z. B. Pavillon, Grillzubehör, Soundbox).
- **Live-Budgetrechner**: Vergleicht in Echtzeit den aktuellen Kassenstand aus der Gemeinschaftskasse mit den Gesamtkosten der offenen Anschaffungen und zeigt das exakte **Fehlbudget (Defizit in Rot)** oder das **Guthaben (Grün)** an.
- Prioritäten: 🔥 _Dringend_, ⚡ _Wichtig_, 💡 _Idee_.
- Direkte Shop-Verlinkungen (🔗) und Abhaken bei Kauf.

---

### 7. 💰 Gemeinschaftskasse

- Übersicht über Gesamtsaldo, Gesamteinzahlungen und Gesamtausgaben.
- Schnelles Buchen von Einnahmen und Ausgaben mit Zweck, Betrag, Datum und Notiz.
- Buchungshistorie mit Filter (Alle, Einnahmen, Ausgaben) sowie Bearbeiten & Löschen.

---

### 8. 🎨 Premium UI/UX & PWA

- **Brandneues Logo**: „Klapse hat Wandertag“ Stick-Badge mit freundlichem Wander-Häuschen.
- **Dynamisches Wasserzeichen**: Dezentes Logo im Hintergrund auf allen Tabs, dynamisch an jede Bildschirmbreite angepasst.
- **Frosted-Glass-Design**: iOS-inspirierte Glas-Effekte mit dezenten Lichtkanten und Smaragd-Glow.
- **Vollwertige PWA**: Offline-fähig, installierbar auf Homescreen (iOS & Android) mit hochauflösenden Icons.

---

### 9. 🏖️ Urlaubs- & Abwesenheitsplaner mit Terminkonflikt-Warnung

- **Neue Kategorie „🏖️ Urlaub / Abwesend“ in leuchtendem Signalrot**: Abwesenheiten und Urlaubszeiten heben sich unverkennbar in kräftigem Knallrot von allen normalen Terminen ab.
- **Optimiertes Formular**: Bei Auswahl von _Urlaub / Abwesend_ werden irrelevante Felder (Uhrzeit, Ganztägig-Checkbox, Ort und Link) automatisch ausgeblendet und der Auswahl-Button leuchtet in Signalrot.
- **Symmetrischer Datumsbereich (Von – Bis)**: Startdatum und Bis-Datum (Zeitraum) teilen sich übersichtlich und sauber die Zeile (je 50%). Ein- oder mehrtägige Urlaube können mit einer einzigen Eingabe erfasst werden.
- **Automatische Kalender-Darstellung**: Jeder Tag der Abwesenheit wird nahtlos im Monatskalender und in der Terminliste in Knallrot hervorgehoben (mit Strand-Icon 🏖️ und Zeitraum-Badge `🏖️ Bis DD.MM.`).
- **Smarte Terminkonflikt-Warnung**: Wählt man beim Planen eines gemeinsamen Termins ein Datum aus, an dem Gruppenmitglieder abwesend gemeldet sind, informiert ein Hinweisbanner direkt im Formular (z. B. _„Achtung: Alex, Thomas sind an diesem Tag im Urlaub / abwesend!“_).
- **Klare Abwesenheitsliste**: Im Formular und Detail-Modal wird intuitiv angezeigt, welche Personen abwesend sind (inkl. Schnellauswahl aller Personen).

---

### 10. ✨ Intuitive Symbole für alle Kategorien

Jede Terminkategorie besitzt nun ein eigenes, passendes Symbol, das überall in der App (Filterleiste, Formular-Buttons, Terminkarten und Detail-Modal) angezeigt wird:

- 🍽️ **Essen**
- 🎸 **Konzert**
- 🎪 **Veranstaltung**
- 🎂 **Geburtstag**
- 🎯 **Dart**
- 🎱 **Billard**
- 🏖️ **Urlaub / Abwesend**
- 📌 **Sonstiges**
- 🌐 **Alle** _(in der Schnellfilterleiste)_

- **Symbole direkt im Monatskalender**: Auch im Kalender-Widget werden nun an Tagen mit Terminen die entsprechenden Kategorie-Icons (z. B. 🏖️ für Urlaub, 🎸 für Konzert, 🍽️ für Essen) direkt unter der Tageszahl dargestellt. Bei mehreren unterschiedlichen Kategorien zeigt ein kleiner Zähler (z. B. `+1`) weitere an.

---

## 🛠️ Tech-Stack

- **Frontend**: HTML5, CSS3 (Modern Glassmorphism & Custom Properties), Vanilla JavaScript (ES Modules).
- **Backend / Realtime Database**: Firebase Firestore (`data_termine`, `data_kasse`, `data_anschaffungen`).
- **Service Worker**: PWA Cache v2.7.2 mit Network-First Strategie für App-Ressourcen.
