import { Server } from 'socket.io'

let io

export function initSocket(server, origin) {
  io = new Server(server, { cors: { origin } })
  return io
}

export function emit(event, data) {
  io?.emit(event, data)
}
