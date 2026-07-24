import { createServer } from 'node:http'

export function createHealthHandler(getSnapshot) {
  return function healthHandler(request, response) {
    response.setHeader('content-type', 'application/json; charset=utf-8')
    response.setHeader('cache-control', 'no-store')

    if (request.method !== 'GET') {
      writeJson(response, 405, { error: 'method_not_allowed' })
      return
    }

    let pathname
    try {
      pathname = new URL(request.url ?? '/', 'http://cron-runner.invalid').pathname
    } catch {
      writeJson(response, 400, { error: 'invalid_request_target' })
      return
    }
    if (pathname === '/healthz') {
      writeJson(response, 200, { status: 'ok' })
      return
    }
    if (pathname === '/readyz') {
      const { ready } = getSnapshot()
      writeJson(response, ready ? 200 : 503, {
        status: ready ? 'ready' : 'not_ready',
      })
      return
    }
    writeJson(response, 404, { error: 'not_found' })
  }
}

export async function startHealthServer(config, getSnapshot, dependencies = {}) {
  const createServerImpl = dependencies.createServerImpl ?? createServer
  const server = createServerImpl(createHealthHandler(getSnapshot))

  await new Promise((resolve, reject) => {
    const onError = error => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(config.healthPort, config.healthHost)
  })

  return Object.freeze({
    close: () => closeServer(server),
  })
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve()
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
}

function writeJson(response, statusCode, body) {
  response.statusCode = statusCode
  response.end(JSON.stringify(body))
}
