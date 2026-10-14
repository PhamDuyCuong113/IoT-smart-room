export const defaultProfile = {
  fullName: 'Phạm Duy Cường', username: 'phamduycuong', role: 'Người dùng',
  github: '', figma: '', report: '', postman: '',
}


export const mockSnapshotTime = Date.parse('2026-10-07T10:45:00+07:00')
const sampleInterval = 5 * 60 * 1000
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})
const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
export const formatMockDate = (timestamp) => dateFormatter.format(timestamp).replace(',', '')
export const formatMockTime = (timestamp) => timeFormatter.format(timestamp)

export const sensorDefinitions = [
  {
    key: 'temperature', label: 'NHIỆT ĐỘ', shortLabel: 'Nhiệt độ', title: 'Biến động nhiệt độ',
    unit: '°C', device: 'DHT11 - Nhiệt độ', color: '#111', ticks: [30, 28, 26, 24], precision: 1,
    anchors: [25.8, 25.7, 25.9, 26.2, 26.6, 27.1, 27.6, 28.1, 28.3, 28.0, 27.7, 27.5, 27.4], noise: 0.09,
  },
  {
    key: 'humidity', label: 'ĐỘ ẨM', shortLabel: 'Độ ẩm', title: 'Biến động độ ẩm',
    unit: '%', device: 'DHT11 - Độ ẩm', color: '#111', ticks: [80, 70, 60, 50], precision: 0,
    anchors: [74, 75, 74, 73, 72, 70, 68, 65, 64, 65, 66, 67, 68], noise: 0.65,
  },
  {
    key: 'light', label: 'ÁNH SÁNG', shortLabel: 'Ánh sáng', title: 'Biến động ánh sáng',
    unit: 'lux', device: 'Cảm biến ánh sáng', color: '#111', ticks: [1600, 1200, 800, 400, 0], precision: 0,
    anchors: [180, 190, 220, 310, 450, 690, 840, 1010, 1160, 1090, 1320, 1290, 1250], noise: 32,
  },
]

// Slow environmental changes plus small, deterministic sensor fluctuations.
export const sensorSamples = Array.from({ length: 73 }, (_, index) => {
  const timestamp = mockSnapshotTime - (72 - index) * sampleInterval
  const readings = Object.fromEntries(sensorDefinitions.map((sensor, sensorIndex) => {
    const anchorIndex = Math.min(Math.floor(index / 6), 11)
    const fraction = (index - anchorIndex * 6) / 6
    const base = sensor.anchors[anchorIndex] * (1 - fraction) + sensor.anchors[anchorIndex + 1] * fraction
    const noise = Math.sin(index * 1.7 + sensorIndex) * Math.sin(fraction * Math.PI) * sensor.noise
    return [sensor.key, Number((base + noise).toFixed(sensor.precision))]
  }))
  return { timestamp, ...readings }
})

export const sensorRecords = sensorSamples.flatMap((sample, index) =>
  sensorDefinitions.map((sensor, sensorIndex) => ({
    id: index * 3 + sensorIndex + 1,
    value: `${sample[sensor.key].toFixed(sensor.precision)} ${sensor.unit}`,
    time: formatMockDate(sample.timestamp), device: sensor.device,
  })),
).reverse()

export const defaultDevices = [
  { name: 'Quạt', on: true }, { name: 'Đèn', on: true }, { name: 'Điều hòa', on: false },
]
const activitySeeds = [
  ['Điều hòa', 'TẮT', 'THÀNH CÔNG', 'THỦ CÔNG', 5],
  ['Quạt', 'BẬT', 'THÀNH CÔNG', 'THỦ CÔNG', 15],
  ['Đèn', 'BẬT', 'THÀNH CÔNG', 'THỦ CÔNG', 35],
  ['Điều hòa', 'BẬT', 'THÀNH CÔNG', 'TỰ ĐỘNG', 65],
  ['Điều hòa', 'BẬT', 'THẤT BẠI', 'TỰ ĐỘNG', 66],
  ['Quạt', 'TẮT', 'THÀNH CÔNG', 'TỰ ĐỘNG', 95],
  ['Đèn', 'TẮT', 'THÀNH CÔNG', 'THỦ CÔNG', 125],
  ['Quạt', 'BẬT', 'THÀNH CÔNG', 'THỦ CÔNG', 145],
  ['Điều hòa', 'TẮT', 'THÀNH CÔNG', 'TỰ ĐỘNG', 165],
  ['Đèn', 'BẬT', 'THẤT BẠI', 'THỦ CÔNG', 185],
  ['Quạt', 'TẮT', 'THÀNH CÔNG', 'TỰ ĐỘNG', 215],
  ['Đèn', 'TẮT', 'THÀNH CÔNG', 'TỰ ĐỘNG', 245],
]
export const activityRecords = activitySeeds.map(([device, action, status, mode, minutes], index) => ({
  id: activitySeeds.length - index, device, action, status, mode,
  user: mode === 'TỰ ĐỘNG' ? 'Hệ thống' : defaultProfile.username,
  time: formatMockDate(mockSnapshotTime - minutes * 60 * 1000),
}))
