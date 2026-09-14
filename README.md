# PRIMR

Eine App für Training, Schlaf und tägliche Aufgaben im Wechselschichtdienst.
Sie läuft als PWA im Browser, speichert alles lokal auf dem Gerät und braucht
weder Server noch Konto.

## Starten

```bash
npm start          # dann http://localhost:8080 öffnen
npm test           # prüft die Rechenkerne (37 Tests, ohne Browser)
```

Auf dem iPhone in Safari öffnen und über *Teilen → Zum Home-Bildschirm* ablegen.
Danach startet sie im Vollbild und funktioniert offline.

## Die fünf Tabs

**Heute** – Datum, Schichttag, die eingetragenen WHOOP-Werte und daraus die
Bereitschaft von 0 bis 100. Hinter „Auswirkungen auf Tag und Training“ steht,
welcher Wert wie stark eingeflossen ist und was das konkret für heute bedeutet.
Darunter die vorgeschlagene Einheit und die Aufgaben des Tages.

**Training** – der Wochenplan, warum jede Einheit an ihrem Tag liegt, die
Zonenverteilung, die Progression und die Vorbelastung der letzten 28 Tage.

**Aufgaben** – tägliche Gewohnheiten und eigene Aufgaben. Eigene Aufgaben können
einmalig, täglich, an festen Wochentagen oder an bestimmten Schichttagen stehen.

**Schlaf** – das Schlaffenster für heute, Abend- und Morgenroutine passend zum
Schichttag, Schlafdauer der letzten 14 Tage und die Fenster der nächsten Woche.

**Werte** – VO2max, Schwellenherzfrequenz, Ruhepuls, HRV und
Herzfrequenzerholung nach einer Minute im Verlauf.

## Das Schichtmodell

Der Zyklus ist eine Folge aus `T` (Tagschicht 07:00–19:00, Dienstbeginn 06:45),
`N` (Nachtschicht 19:00–07:00, Dienstbeginn 18:45) und frei. Alles andere leitet
die App daraus ab:

| Tagtyp | Erkannt an | Schlaf |
|---|---|---|
| Tagschicht | `T` | 23:30 – 05:30 |
| Nachtschicht | `N` nach einem Nicht-`N` | auf 08:00, Vorschlaf 15:00–17:30, danach ab 08:00 ins Bett |
| Nachtschicht Folgetag | `N` nach `N` | 08:00 – 14:00, optional 60 min vor der Schicht |
| Schlaftag | frei direkt nach `N` | 08:00 – 14:00 und wieder ab 00:00 |
| Frei 2 | frei direkt vor `T` | 22:00 – 05:30 |
| Frei 1 | jeder andere freie Tag | 23:30 – 08:00 |

Eingetragen wird der Zyklus unter *Einstellungen → Schichtplan*: jeden der 35
Tage antippen, bis er stimmt, dann angeben, der wievielte Zyklustag heute ist.

## Wie der Trainingsplan entsteht

Ziel sind drei Läufe (einmal intensiv, einmal Longrun, einmal locker) und drei
Kraft-/Athletikeinheiten pro Woche.

Der Planer durchsucht alle möglichen Verteilungen der sechs Einheiten auf die
sieben Tage vollständig und bewertet jede:

- An der Tagschicht ist kein Training möglich, höchstens Mobility.
- Der Longrun liegt bevorzugt an freien Tagen, sonst am Vormittag vor der Nacht.
- Zwei harte Einheiten an aufeinanderfolgenden Tagen kosten stark Punkte.
- Longrun und intensive Einheit werden auseinandergezogen.
- Eine Einheit muss in das Zeitfenster des Tages passen.
- An einem freien Tag dürfen zwei lockere Einheiten stehen (ein Lauf plus Kraft) –
  sonst gehen in Wochen mit zwei Tagschichten keine sechs Einheiten in fünf
  nutzbare Tage.

Weil der Suchraum vollständig durchlaufen wird, ist das Ergebnis reproduzierbar
und nicht das Ergebnis einer Faustregel.

### Progression

Vierwochenblöcke mit 100 %, 110 %, 120 % und 72 % des Blockumfangs. Jeder neue
Block startet 5 % über dem letzten, gedeckelt beim 2,6-fachen des Startumfangs.
Im Kraftraum läuft dieselbe Welle über dem Trainingsmaximum (78 %, 80 %, 87 %,
62 %); nach jedem Block steigt das Maximum um 5 kg bei Bein- und 2,5 kg bei
Oberkörperübungen. Der Plan hat kein Ende und kein Wettkampfziel – gemessen wird
an physiologischen Markern.

### Herzfrequenzzonen

| Zone | Bereich | Zweck |
|---|---|---|
| 1 | 114–138 | Regeneration |
| 2 | 139–160 | Grundlage |
| 3 | 161–175 | Schwelle |
| 4 | 176–190 | VO2max |
| 5 | 191–205 | Anaerob |

## Bereitschaft

Aus dem Check-in wird ein Wert von 0 bis 100: Recovery (42 %),
Schlaf-Performance (18 %), Schlafdauer gegen das Tagessoll (14 %), HRV (14 %),
Ruhepuls (12 %) und das eigene Muskelgefühl (10 %). HRV und Ruhepuls werden
gegen den eigenen 14-Tage-Schnitt verrechnet, nicht gegen Normwerte, und fließen
deshalb erst nach einigen Check-ins ein.

Dazu kommen Korrekturen: eine 7-Tage-Last deutlich über dem 28-Tage-Schnitt senkt
den Wert, eine ruhige Woche hebt ihn leicht, die zweite Nacht in Folge kostet
Punkte.

| Wert | Wirkung auf das Training |
|---|---|
| ab 75 | Plan unverändert, harte Reize erlaubt |
| 55–74 | Intensität bleibt, Umfang −15 %, Zone 5 gesperrt |
| 38–54 | kein harter Reiz, Umfang −40 %, Puls unter 160 |
| unter 38 | Regeneration statt Training |

## Aufbau

```
index.html            Hülle
css/app.css           Design-Tokens und Komponenten
js/core/              Rechenkerne, ohne DOM und ohne Browser testbar
  shift.js            35-Tage-Zyklus und Tagtypen
  sleep.js            Schlaffenster und Routinen
  plan.js             Trainingsplaner und Progression
  library.js          Einheiten-Bibliothek
  readiness.js        Bereitschaft aus den WHOOP-Werten
  tasks.js            Aufgaben und Gewohnheiten
  store.js            Zustand im localStorage
  context.js          abgeleitete Tagesdaten für die Views
js/ui/                DOM-Helfer, SVG-Diagramme, geteilte Bausteine
js/views/             die fünf Tabs und die Formulare
test/run.js           Tests der Rechenkerne
sw.js                 Offline-Betrieb
```

## Daten

Alles liegt im `localStorage` dieses Browsers. Es gibt keinen Server, keine
Anmeldung und keine Übertragung nach außen. Unter *Einstellungen → Daten* lässt
sich eine JSON-Sicherung schreiben und wieder einspielen – wer den Browserspeicher
leert, verliert den Verlauf sonst.

## Hinweis

Die App ersetzt keine ärztliche Beratung. Bei anhaltend erhöhtem Ruhepuls,
Schmerzen oder Infektzeichen gehört das abgeklärt und nicht wegtrainiert.
