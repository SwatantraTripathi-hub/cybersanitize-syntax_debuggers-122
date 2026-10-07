require('ts-node/register/transpile-only')

const assert = require('node:assert/strict')
const net = require('node:net')
const { FleetHost } = require('../src/main/fleet/fleetHost.ts')
const { FleetClient } = require('../src/main/fleet/fleetClient.ts')
const { discoverFleetHost } = require('../src/main/fleet/fleetDiscovery.ts')

async function reservePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

async function run() {
  const port = await reservePort()
  const host = new FleetHost()
  const client = new FleetClient()
  const unauthorizedClient = new FleetClient()
  const workspaceMeta = {
    caseId: 'FLEET-JOIN-CHECK',
    title: 'Workspace Join Integration Check',
    evidenceTag: 'ASSET-JOIN-CHECK',
    authorizingOfficer: 'Integration Test',
    date: '2026-10-08',
    notes: 'Verifies workspace metadata handoff to a joining client.',
    classification: 'TEST',
    selectedOptions: {
      wipeStandard: 'nist-purge',
      recoveryTypes: ['PDF', 'JPEG'],
      writeBlockerEnforced: false,
      preScanEnabled: true
    }
  }

  let nodeJoinedResolve
  const nodeJoined = new Promise(resolve => { nodeJoinedResolve = resolve })
  host.on('node:joined', nodeJoinedResolve)

  try {
    const roomKey = await host.createLobby(port)
    host.setWorkspaceMeta(workspaceMeta)

    const endpoint = await discoverFleetHost(roomKey, 2500, false)
    assert.equal(endpoint.port, port, 'LAN discovery should return the host WebSocket port')

    const result = await client.joinLobby(endpoint.hostIp, endpoint.port, roomKey, 'join-test-node', {
      hostname: 'JOIN-TEST-LAPTOP',
      model: 'Integration Test Laptop',
      storage: '256 GB Test SSD'
    })

    assert.equal(result.success, true, 'client join should succeed')
    assert.deepEqual(result.workspaceMeta, workspaceMeta, 'host workspace metadata and policy should reach client')

    const registeredNode = await Promise.race([
      nodeJoined,
      new Promise((_, reject) => setTimeout(() => reject(new Error('host did not register joining node')), 3000))
    ])
    assert.equal(registeredNode.nodeId, 'join-test-node')
    assert.equal(registeredNode.hostname, 'JOIN-TEST-LAPTOP')

    await assert.rejects(
      unauthorizedClient.joinLobby('127.0.0.1', port, 'CS-FLEET-WRONG', 'unauthorized-node'),
      /Invalid room key/
    )
    await assert.rejects(discoverFleetHost('CS-FLEET-NOT-OPEN', 400), /No workspace with that key/)

    console.log('PASS: room key discovered the coordinator automatically over LAN broadcast')
    console.log('PASS: client authenticated with the host room key')
    console.log('PASS: central workspace metadata and selected options were synchronized')
    console.log('PASS: host registered the joining workstation')
    console.log('PASS: invalid room key was rejected')
    console.log('PASS: undiscovered key returned the same-LAN guidance error')
  } finally {
    client.disconnect()
    unauthorizedClient.disconnect()
    await new Promise(resolve => {
      host.once('host:stopped', resolve)
      host.closeLobby()
      setTimeout(resolve, 1000)
    })
  }
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
