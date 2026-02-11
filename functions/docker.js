import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
const ByteArray = imports.byteArray

const DOCKER_SOCKET_PATH = '/var/run/docker.sock'

function connectUnixSocket(path) {
  return new Promise((resolve, reject) => {
    const client = new Gio.SocketClient()
    const address = new Gio.UnixSocketAddress({ path })
    client.connect_async(address, null, (c, res) => {
      try {
        resolve(c.connect_finish(res))
      } catch (error) {
        reject(error)
      }
    })
  })
}

function readAllAsync(inputStream) {
  return new Promise((resolve, reject) => {
    const chunks = []

    const readNext = () => {
      inputStream.read_bytes_async(4096, GLib.PRIORITY_DEFAULT, null, (s, res) => {
        try {
          const bytes = s.read_bytes_finish(res)
          if (bytes.get_size() === 0) {
            resolve(chunks)
            return
          }
          chunks.push(bytes)
          readNext()
        } catch (error) {
          reject(error)
        }
      })
    }

    readNext()
  })
}

function bytesToString(chunks) {
  let out = ''
  for (const bytes of chunks) {
    const arr = ByteArray.fromGBytes(bytes)
    out += ByteArray.toString(arr)
  }
  return out
}

function parseHeaders(headerText) {
  const lines = headerText.split('\r\n')
  const statusLine = lines.shift() || ''
  const headers = {}
  for (const line of lines) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    headers[key] = value
  }
  return { statusLine, headers }
}

function decodeChunked(body) {
  let i = 0
  let out = ''
  while (i < body.length) {
    const lineEnd = body.indexOf('\r\n', i)
    if (lineEnd === -1) break
    const sizeHex = body.slice(i, lineEnd).trim()
    const size = parseInt(sizeHex, 16)
    if (!Number.isFinite(size) || size === 0) break
    const start = lineEnd + 2
    const end = start + size
    out += body.slice(start, end)
    i = end + 2
  }
  return out
}

async function requestDocker(path) {
  const conn = await connectUnixSocket(DOCKER_SOCKET_PATH)
  const out = conn.get_output_stream()
  const input = conn.get_input_stream()

  const request =
    `GET ${path} HTTP/1.0\r\n` +
    'User-Agent: docker-manager\r\n' +
    'Accept: application/json\r\n' +
    'Connection: close\r\n' +
    '\r\n'

  out.write_all(request, null)

  const chunks = await readAllAsync(input)
  conn.close(null)

  const response = bytesToString(chunks)
  const splitIndex = response.indexOf('\r\n\r\n')
  if (splitIndex === -1) return ''
  const headerText = response.slice(0, splitIndex)
  const body = response.slice(splitIndex + 4)
  const { headers, statusLine } = parseHeaders(headerText)

  if (headers['transfer-encoding']?.toLowerCase() === 'chunked') {
    return { body: decodeChunked(body), statusLine, headers }
  }

  const length = Number.parseInt(headers['content-length'] || '0', 10)
  if (Number.isFinite(length) && length > 0) {
    return { body: body.slice(0, length), statusLine, headers }
  }
  return { body, statusLine, headers }
}

function normalizeContainer(c) {
  const rawName = Array.isArray(c.Names)
    ? c.Names[0]
    : typeof c.Names === 'string'
      ? c.Names
      : c.Name
  const name =
    typeof rawName === 'string'
      ? rawName.replace(/^\//, '')
      : c.Id?.slice(0, 12) || 'unknown'
  return {
    id: c.Id,
    name,
    image: c.Image || '',
    state: c.State || '',
    status: c.Status || '',
  }
}

export async function listContainers() {
  try {
    const { body } = await requestDocker('/containers/json?all=1')
    if (!body) return []
    const data = JSON.parse(body)
    if (!Array.isArray(data)) return []
    return data.map(normalizeContainer)
  } catch (error) {
    logError(error, 'Docker API error')
    return []
  }
}

export async function countRunningContainers() {
  const containers = await listContainers()
  return containers.filter(c => c.state === 'running').length
}

export async function listRunningContainers() {
  const containers = await listContainers()
  return containers.filter(c => c.state === 'running')
}
