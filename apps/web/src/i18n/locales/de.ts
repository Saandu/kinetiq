export default {
  app: {
    descriptor: 'Zustandsüberwachung',
    tagline: 'Zustandsüberwachung für Industriemaschinen',
  },

  nav: {
    dashboard: 'Dashboard',
    machine: 'Maschine',
    notifications: 'Notifikationen',
    settings: 'Einstellungen',
    section: { overview: 'Übersicht', machine: 'Ausgewählte Maschine' },
  },

  demo: {
    badge: 'Demo',
    notice:
      'Portfolio-Demo — die Telemetrie wird im Browser simuliert. Es werden keine Daten übertragen.',
    reset: 'Demodaten zurücksetzen',
    resetDone: 'Demodaten zurückgesetzt',
  },

  actions: {
    details: 'Details',
    cancel: 'Abbrechen',
    confirm: 'Bestätigen',
    save: 'Speichern',
    add: 'Hinzufügen',
    close: 'Schließen',
    remove: 'Entfernen',
    dismiss: 'Ausblenden',
    activate: 'Aktivieren',
    deactivate: 'Deaktivieren',
    back: 'Zurück zum Dashboard',
    retry: 'Erneut versuchen',
  },

  theme: {
    label: 'Design',
    light: 'Hell',
    dark: 'Dunkel',
    toggle: 'Design wechseln',
  },

  language: {
    label: 'Sprache',
    toggle: 'Sprache wechseln',
    en: 'English',
    de: 'Deutsch',
  },

  status: {
    online: 'Online',
    offline: 'Offline',
    label: 'Status',
  },

  alert: {
    label: 'Alarm',
    0: 'Normal',
    1: 'Beobachten',
    2: 'Warnung',
    3: 'Kritisch',
  },

  metrics: {
    availability: 'Verfügbarkeit',
    anomalyScore: 'Anomaliewert',
    confidence: 'Sicherheit',
    currentState: 'Aktueller Zustand',
    machines: 'Maschinen',
    online: 'Online',
    alerts: 'Offene Alarme',
    avgAvailability: 'Ø Verfügbarkeit',
    statesTracked: '{n} Zustände erfasst',
    active: 'Aktiv',
    inactive: 'Inaktiv',
  },

  kind: {
    milling: 'Fräsen',
    drilling: 'Bohren',
    lathe: 'Drehen',
    press: 'Presse',
    grinding: 'Schleifen',
    welding: 'Schweißen',
    conveyor: 'Förderband',
    pump: 'Pumpe',
  },

  states: {
    default: {
      1: 'Bereitschaft',
      2: 'Aktiver Zyklus',
      3: 'Be- / Entladen',
      4: 'Umrüstung',
      5: 'Aufwärmen',
      6: 'Service',
      7: 'Störung',
      8: 'Gestoppt',
    },
  },

  category: {
    inspection: 'Inspektion',
    adjustment: 'Einstellung',
    mechanical: 'Mechanische Prüfung',
    electrical: 'Elektrische Prüfung',
    lubrication: 'Schmierung',
  },

  dashboard: {
    title: 'Dashboard',
    subtitle: 'Live-Zustand der fiktiven Demo-Produktionsfläche',
    machineId: 'ID',
    empty: {
      title: 'Keine Maschinen in der Liste',
      body: 'Alle Maschinen wurden entfernt. Setze die Demo-Liste zurück, um fortzufahren.',
      action: 'Maschinen wiederherstellen',
    },
    remove: {
      title: 'Maschine entfernen',
      body: '{id} aus der überwachten Liste entfernen? Diese Aktion kann im Dashboard nicht rückgängig gemacht werden.',
      note: 'Die Konfiguration kann jederzeit wieder hinzugefügt werden.',
    },
    removed: '{id} aus der Liste entfernt',
  },

  machine: {
    notFound: {
      title: 'Maschine nicht gefunden',
      body: 'Diese Maschine gehört nicht zur überwachten Liste.',
    },
    stateAnalysis: 'Maschinenzustandsanalyse',
    stateAnalysisHint: 'Anteil der Laufzeit je generiertem Betriebszustand',
    maintenanceMonitoring: 'Wartungsüberwachung',
    faultMonitoring: 'Störungsüberwachung',
    previousMaintenance: 'Vergangene Wartungen',
    nextMaintenance: 'Nächste Wartung',
    previousFault: 'Vergangene Störungen',
    nextFault: 'Nächste Störung',
    condition: 'Maschinenstatus',
    maintenancePanel: 'Wartungspanel',
    maintenancePanelHint: 'Eine bereits erfolgte Wartung erfassen',
    controlUnit: 'Steuerungseinheit',
    maintenanceMode: 'Wartungsmodus',
    monitoringEnabled: 'Zustandsüberwachung',
    date: 'Datum',
    time: 'Uhrzeit',
    category: 'Kategorie',
    chooseCategory: 'Kategorie wählen',
    entryAdded: 'Wartungseintrag erfasst',
    entryFailed: 'Bitte zuerst Datum, Uhrzeit und Kategorie wählen',
    entryFuture: 'Wartungseinträge dürfen nicht in der Zukunft liegen',
    modeOn: '{mode} aktiviert',
    modeOff: '{mode} deaktiviert',
    loggedEntries: 'Erfasste Einträge',
    noEntries: 'Noch nichts erfasst',
    predicted: 'Prognose',
    window: 'Zeitfenster',
  },

  notifications: {
    title: 'Notifikationen',
    subtitle: 'Ereignisse für {machine}',
    empty: {
      title: 'Keine Notifikationen',
      body: 'Für diese Maschine liegt nichts vor.',
    },
    messages: {
      rose: 'Maschinenverfügbarkeit ist auf {value} gestiegen.',
      fell: 'Maschinenverfügbarkeit ist auf {value} gefallen.',
    },
    dismiss: {
      title: 'Notifikation ausblenden',
      body: 'Diese Notifikation aus der Liste entfernen?',
    },
    dismissed: 'Notifikation ausgeblendet',
    details: {
      title: 'Notifikationsdetails',
      interval: 'Zeit-Intervall',
      date: 'Erfasst',
      machine: 'Maschine',
      message: 'Ereignis',
      snapshot: 'Maschinenzustand zum Zeitpunkt des Ereignisses',
    },
  },

  settings: {
    title: 'Einstellungen',
    subtitle: 'Demokonfiguration für {machine}',
    stateDescription: 'Zustandsbeschreibung',
    stateDescriptionHint:
      'Vergib den generierten Betriebszuständen passende Namen für diese Demo.',
    stateN: '{n}. Zustand',
    statePlaceholder: 'z. B. {example}',
    alertSettings: 'Alarmschwellen',
    alertSettingsHint: 'Fiktive Demowerte als Verfügbarkeitsprozente.',
    saved: 'Einstellungen gespeichert',
    thresholdsValid: 'Gültige Schwellenwerte. Speichern, um sie auf diese Maschine anzuwenden.',
    invalidThresholds:
      'Werte von 0 bis 100 verwenden: kritisch kleiner als Warnung, Warnung kleiner als Beobachten.',
    fields: {
      watchBelow: 'Beobachten unter',
      warningBelow: 'Warnung unter',
      criticalBelow: 'Kritisch unter',
    },
  },

  time: {
    justNow: 'gerade eben',
    minutesAgo: 'vor {n} Min.',
    hoursAgo: 'vor {n} Std.',
    in: 'in {value}',
  },

  a11y: {
    skipContent: 'Zum Hauptinhalt springen',
    viewSource: 'Quellcode auf GitHub ansehen',
    openMenu: 'Navigation öffnen',
    closeMenu: 'Navigation schließen',
    mainNav: 'Hauptnavigation',
    pagination: 'Seitennavigation',
    dialog: 'Dialogfenster',
    page: 'Seite {n}',
    previousPage: 'Vorherige Seite',
    nextPage: 'Nächste Seite',
  },
}
