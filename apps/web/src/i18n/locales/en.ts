export default {
  data: {
    backendReadOnly: "Local backend · read-only. Sensor readings are stored in PostgreSQL; analytics and writes are not available yet.",
    unavailable: "No recorded data available.",
    waiting: "Waiting for device readings",
    latestReading: "Latest stored sensor reading",
    temperature: "Temperature",
    vibration: "Vibration",
    spindle: "Spindle speed",
    power: "Power",
    sampleWindow: "Availability and state shares use {n} received samples from the last 24 hours; gaps are not counted as uptime.",

    loading: 'Loading machine data…',
    loadFailed: 'Machine data could not be loaded. Any displayed values are from the last successful refresh.',
    writeFailed: 'The change could not be saved. Please try it again.',
  },

  app: {
    descriptor: 'Condition Monitoring',
    tagline: 'Condition monitoring for industrial machines',
  },

  nav: {
    dashboard: 'Dashboard',
    machine: 'Machine',
    notifications: 'Notifications',
    settings: 'Settings',
    section: { overview: 'Overview', machine: 'Selected machine' },
  },

  demo: {
    backendNotice: 'Local backend demo — simulated devices publish to MQTT. Readings reach this dashboard through SQS, PostgreSQL and the local API.',
    badge: 'Demo',
    notice: 'Portfolio demo — telemetry is simulated in your browser. No data leaves this page.',
    reset: 'Reset demo data',
    resetDone: 'Demo data reset',
  },

  actions: {
    details: 'Details',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    add: 'Add',
    close: 'Close',
    remove: 'Remove',
    dismiss: 'Dismiss',
    activate: 'Activate',
    deactivate: 'Deactivate',
    back: 'Back to dashboard',
    retry: 'Try again',
  },

  theme: {
    label: 'Theme',
    light: 'Light',
    dark: 'Dark',
    toggle: 'Switch theme',
  },

  language: {
    label: 'Language',
    toggle: 'Switch language',
    en: 'English',
    de: 'Deutsch',
  },

  status: {
    online: 'Online',
    offline: 'Offline',
    label: 'Status',
  },

  alert: {
    label: 'Alert',
    0: 'Normal',
    1: 'Watch',
    2: 'Warning',
    3: 'Critical',
  },

  metrics: {
    sampleAvailability: 'Online samples · 24h',
    atRisk: 'Machines at risk',
    availability: 'Availability',
    anomalyScore: 'Anomaly score',
    confidence: 'Confidence',
    currentState: 'Current state',
    machines: 'Machines',
    online: 'Online',
    alerts: 'Open alerts',
    avgAvailability: 'Avg. availability',
    statesTracked: '{n} states tracked',
    active: 'Active',
    inactive: 'Inactive',
  },

  kind: {
    milling: 'Milling',
    drilling: 'Drilling',
    lathe: 'Lathe',
    press: 'Press',
    grinding: 'Grinding',
    welding: 'Welding',
    conveyor: 'Conveyor',
    pump: 'Pump',
  },

  states: {
    default: {
      1: 'Standby',
      2: 'Active cycle',
      3: 'Load / unload',
      4: 'Changeover',
      5: 'Warm-up',
      6: 'Service',
      7: 'Fault',
      8: 'Stopped',
    },
  },

  category: {
    inspection: 'Inspection',
    adjustment: 'Adjustment',
    mechanical: 'Mechanical check',
    electrical: 'Electrical check',
    lubrication: 'Lubrication',
  },

  dashboard: {
    title: 'Dashboard',
    subtitle: 'Live condition across the fictional demo floor',
    machineId: 'ID',
    empty: {
      title: 'No machines in the list',
      body: 'Every machine has been removed. Restore the demo roster to continue.',
      action: 'Restore machines',
    },
    remove: {
      title: 'Remove machine',
      body: 'Remove {id} from the monitored list? This cannot be undone from the dashboard.',
      note: 'The configuration can be added again at any time.',
    },
    removed: '{id} removed from the list',
  },

  machine: {
    sampleStateHint: 'Share of received samples across operating states over the last 24 hours',
    notFound: {
      title: 'Machine not found',
      body: 'This machine is not part of the monitored roster.',
    },
    stateAnalysis: 'Machine state analysis',
    stateAnalysisHint: 'Share of runtime spent in each generated operating state',
    maintenanceMonitoring: 'Maintenance monitoring',
    faultMonitoring: 'Fault monitoring',
    previousMaintenance: 'Past maintenance',
    nextMaintenance: 'Next maintenance',
    previousFault: 'Past faults',
    nextFault: 'Next fault',
    condition: 'Machine condition',
    maintenancePanel: 'Maintenance log',
    maintenancePanelHint: 'Record a maintenance action that already happened',
    controlUnit: 'Control unit',
    maintenanceMode: 'Maintenance mode',
    monitoringEnabled: 'Condition monitoring',
    date: 'Date',
    time: 'Time',
    category: 'Category',
    chooseCategory: 'Select a category',
    entryAdded: 'Maintenance entry recorded',
    entryFailed: 'Pick a date, time and category first',
    entryFuture: 'Maintenance entries cannot be dated in the future',
    modeOn: '{mode} activated',
    modeOff: '{mode} deactivated',
    loggedEntries: 'Recorded entries',
    noEntries: 'Nothing recorded yet',
    predicted: 'Predicted',
    window: 'Window',
  },

  notifications: {
    title: 'Notifications',
    subtitle: 'Events raised for {machine}',
    empty: {
      title: 'No notifications',
      body: 'Nothing has been raised for this machine.',
    },
    messages: {
      rose: 'Machine availability rose to {value}.',
      fell: 'Machine availability fell to {value}.',
    },
    dismiss: {
      title: 'Dismiss notification',
      body: 'Remove this notification from the list?',
    },
    dismissed: 'Notification dismissed',
    details: {
      title: 'Notification detail',
      interval: 'Time interval',
      date: 'Recorded',
      machine: 'Machine',
      message: 'Event',
      snapshot: 'Machine snapshot at the time of the event',
    },
  },

  settings: {
    title: 'Settings',
    subtitle: 'Demo configuration for {machine}',
    stateDescription: 'State labels',
    stateDescriptionHint:
      'Give the generated operating states names that fit this demo.',
    stateN: 'State {n}',
    statePlaceholder: 'e.g. {example}',
    alertSettings: 'Alert thresholds',
    alertSettingsHint: 'Fictional demo values, expressed as availability percentages.',
    saved: 'Settings saved',
    thresholdsValid: 'Valid thresholds. Save to apply them to this machine.',
    invalidThresholds:
      'Use values from 0 to 100, ordered critical below warning below watch.',
    fields: {
      watchBelow: 'Watch below',
      warningBelow: 'Warning below',
      criticalBelow: 'Critical below',
    },
  },

  time: {
    justNow: 'just now',
    minutesAgo: '{n} min ago',
    hoursAgo: '{n} h ago',
    in: 'in {value}',
  },

  a11y: {
    skipContent: 'Skip to main content',
    viewSource: 'View source on GitHub',
    openMenu: 'Open navigation',
    closeMenu: 'Close navigation',
    mainNav: 'Main navigation',
    pagination: 'Pagination',
    dialog: 'Dialog',
    page: 'Page {n}',
    previousPage: 'Previous page',
    nextPage: 'Next page',
  },
}
