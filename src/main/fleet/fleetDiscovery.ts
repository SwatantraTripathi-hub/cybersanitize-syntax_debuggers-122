import * as dgram from 'node:dgram'
import * as os from 'node:os'
import type { Socket, RemoteInfo } from 'node:dgram'

export const FLEET_DISCOVERY_PORT = 4097
const DISCOVERY_REQUEST = 'CYBERSANITIZE_FLEET_DISCOVER'
const DISCOVERY_RESPONSE = 'CYBERSANITIZE_FLEET_FOUND'

export interface FleetEndpoint {
  hostIp: string
  port: number
}

interface DiscoveryPacket {
  type: string
  roomKey: string
  port?: number
}

/** Start the host-side UDP responder used to locate a workspace by room key. */
export function startFleetDiscoveryResponder(
  getRoomKey: () => string,
  getWebSocketPort: () => number
): Promise<Socket> {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

  socket.on('message', (message: Buffer, remote: RemoteInfo) => {
    let request: DiscoveryPacket
    try {
      request = JSON.parse(message.toString()) as DiscoveryPacket
    } catch {
      return
    }

    const roomKey = getRoomKey()
    if (request.type !== DISCOVERY_REQUEST || !roomKey || request.roomKey !== roomKey) return

    const response: DiscoveryPacket = {
      type: DISCOVERY_RESPONSE,
      roomKey,
      port: getWebSocketPort()
    }
    socket.send(JSON.stringify(response), remote.port, remote.address)
  })

  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      socket.removeListener('listening', onListening)
      socket.close()
      reject(error)
    }
    const onListening = () => {
      socket.removeListener('error', onError)
      resolve(socket)
    }

    socket.once('error', onError)
    socket.once('listening', onListening)
    socket.bind(FLEET_DISCOVERY_PORT, '0.0.0.0')
  })
}

/** Find a host on the attached LAN by broadcasting only the supplied room key. */
export function discoverFleetHost(roomKey: string, timeoutMs = 3500, includeLoopback = true): Promise<FleetEndpoint> {
  const socket = dgram.createSocket('udp4')
  const request = Buffer.from(JSON.stringify({ type: DISCOVERY_REQUEST, roomKey }))

  return new Promise((resolve, reject) => {
    let settled = false
    let timeout: NodeJS.Timeout
    let retry: NodeJS.Timeout | undefined

    const finish = (error?: Error, endpoint?: FleetEndpoint) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (retry) clearInterval(retry)
      socket.removeAllListeners()
      socket.close()
      if (error) reject(error)
      else if (endpoint) resolve(endpoint)
      else reject(new Error('Fleet discovery returned no host endpoint.'))
    }

    socket.on('message', (message: Buffer, remote: RemoteInfo) => {
      let response: DiscoveryPacket
      try {
        response = JSON.parse(message.toString()) as DiscoveryPacket
      } catch {
        return
      }

      if (
        response.type === DISCOVERY_RESPONSE &&
        response.roomKey === roomKey &&
        Number.isInteger(response.port) &&
        response.port! > 0 &&
        response.port! <= 65535
      ) {
        finish(undefined, { hostIp: remote.address, port: response.port! })
      }
    })

    socket.on('error', (error) => finish(error))
    timeout = setTimeout(() => {
      finish(new Error('No workspace with that key was found on the local network. Connect both devices to the same Wi-Fi or Ethernet LAN, and make sure the host workspace is open.'))
    }, timeoutMs)

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true)
        const packet = Buffer.from(request)
        const destinations = getBroadcastAddresses(includeLoopback)
        const sendDiscovery = () => {
          for (const address of destinations) {
            socket.send(packet, FLEET_DISCOVERY_PORT, address)
          }
        }
        sendDiscovery()
        retry = setInterval(sendDiscovery, 700)
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)))
      }
    })
  })
}

function getBroadcastAddresses(includeLoopback: boolean): string[] {
  const addresses = new Set<string>()

  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const network of interfaces ?? []) {
      if (network.internal || (network.family !== 'IPv4' && network.family !== 4)) continue

      const address = ipv4ToNumber(network.address)
      const mask = ipv4ToNumber(network.netmask)
      if (address === null || mask === null || mask === 0xffffffff) continue

      const broadcast = ((address & mask) | (~mask >>> 0)) >>> 0
      addresses.add(numberToIpv4(broadcast))
    }
  }

  addresses.add('255.255.255.255')
  if (includeLoopback) addresses.add('127.0.0.1')

  return Array.from(addresses)
}

function ipv4ToNumber(address: string): number | null {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0
}

function numberToIpv4(address: number): string {
  return [address >>> 24, (address >>> 16) & 255, (address >>> 8) & 255, address & 255].join('.')
}
