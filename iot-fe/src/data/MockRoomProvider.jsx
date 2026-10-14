import { useEffect, useState } from 'react'
import { MockRoomContext } from './useMockRoom'
import { activityRecords, defaultDevices, formatMockDate } from './mockData'
import { readProfile } from '../utils/storage'

const storageKey = 'smart-room-demo-v1'

function readRoom() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey))
    if (saved && defaultDevices.every((device) =>
      saved.devices?.some((item) => item.name === device.name && typeof item.on === 'boolean'),
    ) && Array.isArray(saved.activities) && saved.activities.every((record) =>
      Number.isFinite(record.id) && ['device', 'action', 'status', 'mode', 'user', 'time']
        .every((key) => typeof record[key] === 'string'),
    )) return saved
  } catch {  }
  return { devices: defaultDevices, activities: activityRecords }
}

export function MockRoomProvider({ children }) {
  const [room, setRoom] = useState(readRoom)
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(room)) }
    catch {  }
  }, [room])

  function toggleDevice(name) {
    const user = readProfile().username
    const time = formatMockDate(Date.now())
    setRoom((current) => {
      const device = current.devices.find((item) => item.name === name)
      if (!device) return current
      const record = {
        id: Math.max(0, ...current.activities.map((item) => item.id)) + 1,
        device: name, action: device.on ? 'TẮT' : 'BẬT',
        status: 'THÀNH CÔNG', mode: 'THỦ CÔNG', user, time,
      }
      return {
        devices: current.devices.map((item) => item.name === name ? { ...item, on: !item.on } : item),
        activities: [record, ...current.activities].slice(0, 100),
      }
    })
  }
  return <MockRoomContext.Provider value={{ ...room, toggleDevice }}>{children}</MockRoomContext.Provider>
}
