import { createContext, useContext } from 'react'

export const MockRoomContext = createContext(null)

export function useMockRoom() {
  return useContext(MockRoomContext)
}
