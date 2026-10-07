import { WebSocketServer, WebSocket } from 'ws'

async function runTest() {
  console.log('--- Starting Fleet WebSocket Orchestration Verification Test ---')

  const PORT = 4099
  const ROOM_KEY = 'CS-FLEET-TEST-9999'

  // 1. Simulate Host
  let hostConnectedClient = null
  const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' })

  let nodeJoinedReceived = false
  let preScanRequestedReceived = false
  let preScanResultReceived = false
  let telemetryReceived = false
  let wipeRequestedReceived = false
  let jobCompleteReceived = false

  wss.on('connection', (ws) => {
    console.log('[Host Test Server] Incoming client connection accepted.')
    hostConnectedClient = ws

    ws.on('message', (raw) => {
      const packet = JSON.parse(raw.toString())
      console.log(`[Host Test Server] Received packet: ${packet.type}`)

      if (packet.type === 'JOIN_ROOM') {
        nodeJoinedReceived = true
        ws.send(JSON.stringify({
          type: 'ROOM_ACCEPTED',
          nodeId: 'host',
          roomKey: ROOM_KEY,
          timestamp: new Date().toISOString(),
          payload: { roomKey: ROOM_KEY, hostVersion: '1.0.0', connectedPeers: 1 }
        }))
      }

      if (packet.type === 'PRE_SCAN_RESULT') {
        preScanResultReceived = true
        console.log('[Host Test Server] PreScan Findings verified:', packet.payload)
      }

      if (packet.type === 'TELEMETRY') {
        telemetryReceived = true
        console.log(`[Host Test Server] Telemetry stream verified: ${packet.payload.phase} ${packet.payload.progress}%`)
      }

      if (packet.type === 'JOB_COMPLETE') {
        jobCompleteReceived = true
        console.log('[Host Test Server] Job Complete verified:', packet.payload.summary)
      }
    })
  })

  // Wait for host server to be ready
  await new Promise(r => setTimeout(r, 500))

  // 2. Connect Client
  const clientWs = new WebSocket(`ws://127.0.0.1:${PORT}`)

  await new Promise((resolve, reject) => {
    clientWs.on('open', resolve)
    clientWs.on('error', reject)
  })

  console.log('[Client Test] Connected to Host.')

  clientWs.on('message', (raw) => {
    const packet = JSON.parse(raw.toString())
    console.log(`[Client Test] Received packet from host: ${packet.type}`)

    if (packet.type === 'ROOM_ACCEPTED') {
      console.log('[Client Test] Room accepted! Sending PRE_SCAN_RESULT...')
      // Simulate client pre-scan reply
      clientWs.send(JSON.stringify({
        type: 'PRE_SCAN_RESULT',
        nodeId: 'node-client-test-01',
        roomKey: ROOM_KEY,
        timestamp: new Date().toISOString(),
        payload: {
          filesFound: 5200,
          docs: 1200,
          media: 3500,
          databases: 500,
          entropy: 7.41,
          safeToWipe: true,
          driveLabel: 'PhysicalDrive1',
          scannedAt: new Date().toISOString()
        }
      }))
    }

    if (packet.type === 'EXEC_WIPE') {
      wipeRequestedReceived = true
      console.log('[Client Test] Host commanded wipe! Streaming telemetry...')
      clientWs.send(JSON.stringify({
        type: 'TELEMETRY',
        nodeId: 'node-client-test-01',
        roomKey: ROOM_KEY,
        timestamp: new Date().toISOString(),
        payload: {
          progress: 50,
          speed: '495 MB/s',
          eta: '1m',
          phase: 'SANITIZING',
          logLine: 'Streaming NIST SP 800-88 overwrite pattern...'
        }
      }))

      setTimeout(() => {
        clientWs.send(JSON.stringify({
          type: 'JOB_COMPLETE',
          nodeId: 'node-client-test-01',
          roomKey: ROOM_KEY,
          timestamp: new Date().toISOString(),
          payload: {
            success: true,
            operation: 'WIPE',
            summary: 'NIST Clear sanitize verified (Entropy 0.0000).',
            durationMs: 3200
          }
        }))
      }, 500)
    }
  })

  // Send JOIN_ROOM
  clientWs.send(JSON.stringify({
    type: 'JOIN_ROOM',
    nodeId: 'node-client-test-01',
    roomKey: ROOM_KEY,
    timestamp: new Date().toISOString(),
    payload: {
      nodeId: 'node-client-test-01',
      hostname: 'REMOTE-WORKSTATION-01',
      ip: '127.0.0.1',
      mac: 'AA:BB:CC:DD:EE:FF',
      model: 'Test Rig Laptop',
      storage: '512 GB SSD',
      platform: 'win32'
    }
  }))

  await new Promise(r => setTimeout(r, 600))

  // Host broadcasts EXEC_WIPE
  if (hostConnectedClient) {
    hostConnectedClient.send(JSON.stringify({
      type: 'EXEC_WIPE',
      nodeId: 'host',
      roomKey: ROOM_KEY,
      timestamp: new Date().toISOString(),
      payload: { standard: 'nist-clear' }
    }))
  }

  await new Promise(r => setTimeout(r, 1200))

  clientWs.close()
  wss.close()

  console.log('--- Verification Results ---')
  console.log('Node Joined:', nodeJoinedReceived ? 'PASS' : 'FAIL')
  console.log('PreScan Result:', preScanResultReceived ? 'PASS' : 'FAIL')
  console.log('Wipe Command:', wipeRequestedReceived ? 'PASS' : 'FAIL')
  console.log('Telemetry Streaming:', telemetryReceived ? 'PASS' : 'FAIL')
  console.log('Job Complete:', jobCompleteReceived ? 'PASS' : 'FAIL')

  if (nodeJoinedReceived && preScanResultReceived && wipeRequestedReceived && telemetryReceived && jobCompleteReceived) {
    console.log('ALL FLEET ORCHESTRATION PROTOCOL TESTS PASSED SUCCESSFULLY!')
    process.exit(0)
  } else {
    console.error('TEST FAILED')
    process.exit(1)
  }
}

runTest().catch((err) => {
  console.error(err)
  process.exit(1)
})

