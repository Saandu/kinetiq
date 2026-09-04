export default {
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
    thresholdsValid: 'Thresholds are valid and apply to this machine.',
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
    openMenu: 'Open navigation',
    closeMenu: 'Close navigation',
    mainNav: 'Main navigation',
    page: 'Page {n}',
    previousPage: 'Previous page',
    nextPage: 'Next page',
  },
}
