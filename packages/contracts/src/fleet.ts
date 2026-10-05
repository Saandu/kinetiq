export const DEMO_FLEET = [
  { id: 'DEMO-CNC-01', name: 'Milling cell', kind: 'milling', location: 'Demo floor · Zone A' },
  { id: 'DEMO-DRL-02', name: 'Drill station', kind: 'drilling', location: 'Demo floor · Zone A' },
  { id: 'DEMO-LTH-03', name: 'Turning cell', kind: 'lathe', location: 'Demo floor · Zone B' },
  { id: 'DEMO-PRS-04', name: 'Forming press', kind: 'press', location: 'Demo floor · Zone B' },
  { id: 'DEMO-GRD-05', name: 'Grinding station', kind: 'grinding', location: 'Demo floor · Zone C' },
  { id: 'DEMO-WLD-06', name: 'Welding cell', kind: 'welding', location: 'Demo floor · Zone C' },
  { id: 'DEMO-CNV-07', name: 'Transfer conveyor', kind: 'conveyor', location: 'Demo floor · Zone D' },
  { id: 'DEMO-PMP-08', name: 'Cooling pump', kind: 'pump', location: 'Demo floor · Zone D' },
] as const

export function simulationFleet(count = 12) {
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error('Device count must be 1..500')
  return Array.from({ length: count }, (_, index) => DEMO_FLEET[index] ?? {
    id: `DEMO-LOAD-${String(index + 1).padStart(3, '0')}`, name: `Simulation cell ${index + 1}`,
    kind: 'milling' as const, location: 'Demo floor · Simulation zone',
  })
}
