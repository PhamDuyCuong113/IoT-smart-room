import { defaultProfile } from '../data/profileDefaults'

const profileKey = 'smart-room-profile'
export function readProfile() {
  try {
    const stored = JSON.parse(localStorage.getItem(profileKey))
    return {
      ...defaultProfile,
      ...(stored && typeof stored === 'object' ? stored : {}),
    }
  } catch {
    return { ...defaultProfile }
  }
}
export function saveProfile(profile) {
  try {
    localStorage.setItem(profileKey, JSON.stringify(profile))
    return true
  } catch {
    return false
  }
}
