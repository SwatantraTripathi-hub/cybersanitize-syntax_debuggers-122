import { ipcMain, BrowserWindow } from 'electron'
import { FleetHost } from '../fleet/fleetHost'
import { FleetClient } from '../fleet/fleetClient'

let fleetHostInstance: FleetHost | null = null
let fleetClientInstance: FleetClient | null = null

export function registerFleetIpc(mainWindow: BrowserWindow): void {
  // 1. Create Fleet Host Lobby
  ipcMain.handle('fleet:create-lobby', async (_, port: number = 4096) => {
    try {
      if (!fleetHostInstance) {
        fleetHostInstance = new FleetHost()
      }

      // Forward fleet host events directly to renderer window
      fleetHostInstance.removeAllListeners()

      fleetHostInstance.on('node:joined', (node) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('fleet:node-joined', node)
        }
      })

      fleetHostInstance.on('node:prescan_ready', (node) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('fleet:node-prescan', node)
        }
      })

      fleetHostInstance.on('node:telemetry', (data) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('fleet:telemetry', data)
        }
      })

      fleetHostInstance.on('node:completed', (data) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('fleet:node-complete', data)
        }
      })

      fleetHostInstance.on('node:disconnected', (nodeId) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('fleet:node-disconnected', nodeId)
        }
      })

      const roomCode = fleetHostInstance.createLobby(port)
      return { success: true, roomCode, port }
    } catch (err: any) {
      console.error('[FleetIPC] Error creating lobby:', err)
      return { success: false, error: err.message }
    }
  })

  // 2. Join Lobby as a Client Node
  ipcMain.handle('fleet:join-lobby', async (_, { hostIp, roomCode, nodeId, port = 4096 }) => {
    try {
      if (fleetClientInstance) {
        fleetClientInstance.disconnect()
      }
      fleetClientInstance = new FleetClient()
      await fleetClientInstance.joinLobby(hostIp, port, roomCode, nodeId)
      return { success: true }
    } catch (err: any) {
      console.error('[FleetIPC] Error joining lobby:', err)
      return { success: false, error: err.message }
    }
  })

  // 3. Broadcast Pre-Scan
  ipcMain.handle('fleet:broadcast-prescan', async (_, nodeIds?: string[]) => {
    if (fleetHostInstance) {
      fleetHostInstance.broadcastPreScan(nodeIds)
      return { success: true }
    }
    return { success: false, error: 'Fleet host not running' }
  })

  // 4. Broadcast Wipe
  ipcMain.handle('fleet:broadcast-wipe', async (_, standard: string, nodeIds?: string[]) => {
    if (fleetHostInstance) {
      fleetHostInstance.broadcastWipe(standard, nodeIds)
      return { success: true }
    }
    return { success: false, error: 'Fleet host not running' }
  })

  // 5. Broadcast Recovery
  ipcMain.handle('fleet:broadcast-recovery', async (_, fileTypes: string[], nodeIds?: string[]) => {
    if (fleetHostInstance) {
      fleetHostInstance.broadcastRecovery(fileTypes, nodeIds)
      return { success: true }
    }
    return { success: false, error: 'Fleet host not running' }
  })

  // 6. Close Lobby
  ipcMain.handle('fleet:close-lobby', async () => {
    if (fleetHostInstance) {
      fleetHostInstance.closeLobby()
    }
    if (fleetClientInstance) {
      fleetClientInstance.disconnect()
      fleetClientInstance = null
    }
    return { success: true }
  })

  // 7. Get Connected Nodes
  ipcMain.handle('fleet:get-nodes', async () => {
    if (fleetHostInstance) {
      return fleetHostInstance.getConnectedNodes()
    }
    return []
  })

  // 8. Get Host Status
  ipcMain.handle('fleet:get-status', async () => {
    if (fleetHostInstance && fleetHostInstance.isRunning()) {
      return {
        running: true,
        port: fleetHostInstance.getPort(),
        roomKey: fleetHostInstance.getRoomKey(),
        nodeCount: fleetHostInstance.getConnectedNodes().length
      }
    }
    return { running: false }
  })
}

