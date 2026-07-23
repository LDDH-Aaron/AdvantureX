import {
  AppLocationAccuracy,
  CreateStartUpPageContainer,
  EventSourceType,
  OsEventTypeList,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
  type AppLocation,
  type DeviceInfo,
  type DeviceStatus,
  type EvenAppBridge,
  type EvenHubEvent,
  type LaunchSource,
} from '@evenrealities/even_hub_sdk'

type ForwardConfig = {
  endpoint: string
  enabled: boolean
  includeRaw: boolean
  noCors: boolean
}

type SourceKind = 'ring' | 'glasses_right' | 'glasses_left' | 'unknown'
type EventEnvelope = 'sysEvent' | 'textEvent' | 'listEvent' | 'audioEvent' | 'unknown'

type NormalizedSource = {
  code?: number
  label: string
  kind: SourceKind
}

type NormalizedEventType = {
  code?: number
  label: string
}

type GestureToken = {
  at: string
  source: SourceKind
  name: string
  label: string
}

type RecognizedAction = {
  name: string
  confidence: number
}

type NormalizedEvent = {
  id: number
  receivedAt: string
  envelope: EventEnvelope
  gesture: string
  source: NormalizedSource
  eventType: NormalizedEventType
  container?: {
    id?: number
    name?: string
  }
  selected?: {
    index?: number
    name?: string
  }
  imu?: {
    x?: number
    y?: number
    z?: number
  }
  audio?: {
    source: string
    byteLength: number
  }
  raw?: unknown
}

type RelayPayload = {
  schema: 'even-r1-relay/v1'
  context: {
    app: {
      url: string
      userAgent: string
      launchSource: LaunchSource | null
    }
    device: unknown
    status: unknown
    location: AppLocation | null
    recentGestures: GestureToken[]
  }
  event: NormalizedEvent
  action: RecognizedAction | null
}

const CONFIG_KEY = 'even-r1-relay.config.v1'
const MAX_LOGS = 40
const SEQUENCE_WINDOW_MS = 2500

const eventTypeLabels: Record<number, string> = {
  [OsEventTypeList.CLICK_EVENT]: 'click',
  [OsEventTypeList.SCROLL_TOP_EVENT]: 'swipe_up',
  [OsEventTypeList.SCROLL_BOTTOM_EVENT]: 'swipe_down',
  [OsEventTypeList.DOUBLE_CLICK_EVENT]: 'double_click',
  [OsEventTypeList.FOREGROUND_ENTER_EVENT]: 'foreground_enter',
  [OsEventTypeList.FOREGROUND_EXIT_EVENT]: 'foreground_exit',
  [OsEventTypeList.ABNORMAL_EXIT_EVENT]: 'abnormal_exit',
  [OsEventTypeList.SYSTEM_EXIT_EVENT]: 'system_exit',
  [OsEventTypeList.IMU_DATA_REPORT]: 'imu',
}

const eventTypeNameToCode: Record<string, number> = {
  CLICK: OsEventTypeList.CLICK_EVENT,
  CLICK_EVENT: OsEventTypeList.CLICK_EVENT,
  SCROLL_TOP: OsEventTypeList.SCROLL_TOP_EVENT,
  SCROLL_TOP_EVENT: OsEventTypeList.SCROLL_TOP_EVENT,
  SWIPE_UP: OsEventTypeList.SCROLL_TOP_EVENT,
  SCROLL_BOTTOM: OsEventTypeList.SCROLL_BOTTOM_EVENT,
  SCROLL_BOTTOM_EVENT: OsEventTypeList.SCROLL_BOTTOM_EVENT,
  SWIPE_DOWN: OsEventTypeList.SCROLL_BOTTOM_EVENT,
  DOUBLE_CLICK: OsEventTypeList.DOUBLE_CLICK_EVENT,
  DOUBLE_CLICK_EVENT: OsEventTypeList.DOUBLE_CLICK_EVENT,
  FOREGROUND_ENTER: OsEventTypeList.FOREGROUND_ENTER_EVENT,
  FOREGROUND_ENTER_EVENT: OsEventTypeList.FOREGROUND_ENTER_EVENT,
  FOREGROUND_EXIT: OsEventTypeList.FOREGROUND_EXIT_EVENT,
  FOREGROUND_EXIT_EVENT: OsEventTypeList.FOREGROUND_EXIT_EVENT,
  ABNORMAL_EXIT: OsEventTypeList.ABNORMAL_EXIT_EVENT,
  ABNORMAL_EXIT_EVENT: OsEventTypeList.ABNORMAL_EXIT_EVENT,
  SYSTEM_EXIT: OsEventTypeList.SYSTEM_EXIT_EVENT,
  SYSTEM_EXIT_EVENT: OsEventTypeList.SYSTEM_EXIT_EVENT,
  IMU_DATA_REPORT: OsEventTypeList.IMU_DATA_REPORT,
  IMU: OsEventTypeList.IMU_DATA_REPORT,
}

const sourceLabels: Record<number, { label: string; kind: SourceKind }> = {
  [EventSourceType.TOUCH_EVENT_FORM_DUMMY_NULL]: { label: 'unknown', kind: 'unknown' },
  [EventSourceType.TOUCH_EVENT_FROM_GLASSES_R]: { label: 'glasses_right', kind: 'glasses_right' },
  [EventSourceType.TOUCH_EVENT_FROM_RING]: { label: 'ring', kind: 'ring' },
  [EventSourceType.TOUCH_EVENT_FROM_GLASSES_L]: { label: 'glasses_left', kind: 'glasses_left' },
}

const sourceNameToCode: Record<string, number> = {
  TOUCH_EVENT_FORM_DUMMY_NULL: EventSourceType.TOUCH_EVENT_FORM_DUMMY_NULL,
  TOUCH_EVENT_FROM_GLASSES_R: EventSourceType.TOUCH_EVENT_FROM_GLASSES_R,
  TOUCH_EVENT_FROM_RING: EventSourceType.TOUCH_EVENT_FROM_RING,
  TOUCH_EVENT_FROM_GLASSES_L: EventSourceType.TOUCH_EVENT_FROM_GLASSES_L,
  GLASSES_R: EventSourceType.TOUCH_EVENT_FROM_GLASSES_R,
  GLASSES_RIGHT: EventSourceType.TOUCH_EVENT_FROM_GLASSES_R,
  RING: EventSourceType.TOUCH_EVENT_FROM_RING,
  GLASSES_L: EventSourceType.TOUCH_EVENT_FROM_GLASSES_L,
  GLASSES_LEFT: EventSourceType.TOUCH_EVENT_FROM_GLASSES_L,
}

let bridge: EvenAppBridge | null = null
let deviceInfo: DeviceInfo | null = null
let deviceStatus: DeviceStatus | null = null
let launchSource: LaunchSource | null = null
let lastLocation: AppLocation | null = null
let glassesReady = false
let eventId = 0
let events: NormalizedEvent[] = []
let sequence: GestureToken[] = []
let lastForwardStatus = 'Forward idle'
let deviceDiagnostic = 'Device not loaded'
let glassesDiagnostic = 'G2 page pending'
let lastRawEventPreview = 'No raw event'

const app = byId<HTMLDivElement>('app')
app.innerHTML = `
  <main class="shell">
    <section class="panel header-panel">
      <div>
        <p class="eyebrow">Even G2 / R1</p>
        <h1>Input Relay Console</h1>
      </div>
      <span id="bridge-status" class="status-pill warn">Bridge pending</span>
    </section>

    <section class="panel controls-grid">
      <label class="field">
        <span>Forward endpoint</span>
        <input id="endpoint" inputmode="url" placeholder="http://30.201.217.2:8787/even" />
      </label>
      <label class="check-field">
        <input id="enabled" type="checkbox" />
        <span>Forward events</span>
      </label>
      <label class="check-field">
        <input id="include-raw" type="checkbox" />
        <span>Include raw JSON</span>
      </label>
      <label class="check-field">
        <input id="no-cors" type="checkbox" />
        <span>No-CORS fire-and-forget</span>
      </label>
      <div class="button-row">
        <button id="save-config" type="button">Save</button>
        <button id="send-test" type="button">Send test</button>
        <button id="refresh-device" type="button">Device</button>
        <button id="refresh-location" type="button">Location</button>
        <button id="close-glasses" type="button" class="danger">Close G2</button>
      </div>
    </section>

    <section class="panel status-grid">
      <div>
        <span class="metric-label">Last event</span>
        <strong id="last-event">None</strong>
      </div>
      <div>
        <span class="metric-label">Sequence</span>
        <strong id="sequence">Empty</strong>
      </div>
      <div>
        <span class="metric-label">Forward</span>
        <strong id="forward-status">Idle</strong>
      </div>
      <div>
        <span class="metric-label">Context</span>
        <strong id="context-status">No device context</strong>
      </div>
    </section>

    <section class="panel">
      <div class="section-title">
        <h2>Event Log</h2>
        <button id="clear-log" type="button">Clear</button>
      </div>
      <ol id="event-log" class="event-log"></ol>
    </section>

    <section class="panel diagnostics">
      <h2>Diagnostics</h2>
      <dl>
        <div>
          <dt>Device</dt>
          <dd id="device-diagnostic">Device not loaded</dd>
        </div>
        <div>
          <dt>G2 page</dt>
          <dd id="glasses-diagnostic">G2 page pending</dd>
        </div>
        <div>
          <dt>Last raw event</dt>
          <dd><pre id="raw-event">No raw event</pre></dd>
        </div>
      </dl>
    </section>
  </main>
`

const bridgeStatus = byId<HTMLSpanElement>('bridge-status')
const endpointInput = byId<HTMLInputElement>('endpoint')
const enabledInput = byId<HTMLInputElement>('enabled')
const includeRawInput = byId<HTMLInputElement>('include-raw')
const noCorsInput = byId<HTMLInputElement>('no-cors')
const saveConfigButton = byId<HTMLButtonElement>('save-config')
const sendTestButton = byId<HTMLButtonElement>('send-test')
const refreshDeviceButton = byId<HTMLButtonElement>('refresh-device')
const refreshLocationButton = byId<HTMLButtonElement>('refresh-location')
const closeGlassesButton = byId<HTMLButtonElement>('close-glasses')
const clearLogButton = byId<HTMLButtonElement>('clear-log')
const lastEventEl = byId<HTMLElement>('last-event')
const sequenceEl = byId<HTMLElement>('sequence')
const forwardStatusEl = byId<HTMLElement>('forward-status')
const contextStatusEl = byId<HTMLElement>('context-status')
const eventLogEl = byId<HTMLOListElement>('event-log')
const deviceDiagnosticEl = byId<HTMLElement>('device-diagnostic')
const glassesDiagnosticEl = byId<HTMLElement>('glasses-diagnostic')
const rawEventEl = byId<HTMLPreElement>('raw-event')

const initialConfig = loadConfig()
endpointInput.value = initialConfig.endpoint
enabledInput.checked = initialConfig.enabled
includeRawInput.checked = initialConfig.includeRaw
noCorsInput.checked = initialConfig.noCors

saveConfigButton.addEventListener('click', () => {
  saveConfig(readConfigFromControls())
  setForwardStatus('Config saved')
})

for (const input of [endpointInput, enabledInput, includeRawInput, noCorsInput]) {
  input.addEventListener('change', () => saveConfig(readConfigFromControls()))
}

sendTestButton.addEventListener('click', () => {
  void handleTestEvent()
})

refreshDeviceButton.addEventListener('click', () => {
  void loadDeviceInfo()
})

refreshLocationButton.addEventListener('click', () => {
  void refreshLocation()
})

closeGlassesButton.addEventListener('click', () => {
  void bridge?.shutDownPageContainer(1)
})

clearLogButton.addEventListener('click', () => {
  events = []
  sequence = []
  render()
  void updateGlasses('R1 Relay\nWaiting for input\nForward ready')
})

void boot()

async function boot() {
  bridge = await waitForBridgeWithTimeout(7000)

  if (!bridge) {
    setBridgeStatus('Bridge unavailable', 'warn')
    setForwardStatus('Open inside Even App to capture R1/G2 events')
    render()
    return
  }

  setBridgeStatus('Bridge connected', 'ok')

  await Promise.all([loadDeviceInfo(), createGlassesPage()])

  bridge.onLaunchSource(source => {
    launchSource = source
    renderContext()
  })

  bridge.onDeviceStatusChanged(status => {
    deviceStatus = status
    renderContext()
  })

  bridge.onEvenHubEvent(event => {
    void handleEvenHubEvent(event)
  })

  render()
  void updateGlasses('R1 Relay\nWaiting for R1/G2 input\nEndpoint: ' + endpointHostLabel())
}

async function waitForBridgeWithTimeout(timeoutMs: number): Promise<EvenAppBridge | null> {
  try {
    return await Promise.race([
      waitForEvenAppBridge(),
      new Promise<null>(resolve => window.setTimeout(() => resolve(null), timeoutMs)),
    ])
  } catch (error) {
    console.warn('Even bridge unavailable:', error)
    return null
  }
}

async function loadDeviceInfo() {
  if (!bridge) return

  try {
    deviceInfo = await bridge.getDeviceInfo()
    deviceStatus = deviceInfo?.status ?? null
    deviceDiagnostic = deviceInfo
      ? previewJson(toPlainValue(deviceInfo), 240)
      : 'getDeviceInfo returned null. Check G2/R1 pairing, connection, and whether this page was opened from Even App with devices connected.'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    deviceDiagnostic = `getDeviceInfo failed: ${message}`
    console.warn('Failed to load device info:', error)
  }

  renderContext()
  renderDiagnostics()
}

async function createGlassesPage() {
  if (!bridge) return

  const mainText = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 0,
    borderColor: 5,
    paddingLength: 4,
    containerID: 1,
    containerName: 'relay-main',
    content: 'R1 Relay\nStarting...',
    isEventCapture: 1,
  })

  const result = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [mainText],
    }),
  )

  glassesReady = result === 0
  glassesDiagnostic = glassesReady
    ? 'createStartUpPageContainer success'
    : `createStartUpPageContainer failed: ${String(result)}`
  console.log('G2 page created:', glassesReady ? 'success' : `failed (${result})`)
}

async function handleEvenHubEvent(event: EvenHubEvent) {
  lastRawEventPreview = previewJson(event.jsonData ?? toPlainValue(event), 500)
  const normalized = normalizeEvent(event)
  if (!normalized) {
    renderDiagnostics()
    return
  }

  const action = updateGestureSequence(normalized)
  events = [normalized, ...events].slice(0, MAX_LOGS)
  render()

  await updateGlasses(glassesSummary(normalized, action))

  const config = readConfigFromControls()
  if (config.enabled && config.endpoint.trim()) {
    await forwardEvent(normalized, action)
  }

  if (
    bridge &&
    normalized.eventType.code === OsEventTypeList.DOUBLE_CLICK_EVENT &&
    (normalized.source.kind === 'glasses_left' || normalized.source.kind === 'glasses_right')
  ) {
    await bridge.shutDownPageContainer(1)
  }
}

function normalizeEvent(event: EvenHubEvent): NormalizedEvent | null {
  const envelope = getEnvelope(event)
  const typedPayload = getTypedPayload(event, envelope)
  const raw = event.jsonData ?? toPlainValue(envelope === 'unknown' ? event : typedPayload)
  if (envelope === 'unknown' && isEmptyRaw(raw)) return null

  const eventType = normalizeEventType(readPayloadEventType(typedPayload, raw, envelope))
  const source = normalizeSource(readPayloadSource(typedPayload, raw))
  const container = readContainer(typedPayload, raw)
  const selected = readSelected(typedPayload, raw)
  const imu = readImu(typedPayload, raw)
  const audio = readAudio(typedPayload)
  const gesture = buildGestureLabel(source, eventType, envelope)

  return {
    id: ++eventId,
    receivedAt: new Date().toISOString(),
    envelope,
    gesture,
    source,
    eventType,
    container,
    selected,
    imu,
    audio,
    raw,
  }
}

async function handleTestEvent() {
  const event = createTestEvent()
  const action = updateGestureSequence(event) ?? { name: 'ring_select', confidence: 0.8 }

  lastRawEventPreview = previewJson(event.raw, 500)
  events = [event, ...events].slice(0, MAX_LOGS)
  render()

  await updateGlasses(glassesSummary(event, action))
  await forwardEvent(event, action)
}

function getEnvelope(event: EvenHubEvent): EventEnvelope {
  if (event.sysEvent) return 'sysEvent'
  if (event.textEvent) return 'textEvent'
  if (event.listEvent) return 'listEvent'
  if (event.audioEvent) return 'audioEvent'
  return 'unknown'
}

function getTypedPayload(event: EvenHubEvent, envelope: EventEnvelope): unknown {
  if (envelope === 'sysEvent') return event.sysEvent
  if (envelope === 'textEvent') return event.textEvent
  if (envelope === 'listEvent') return event.listEvent
  if (envelope === 'audioEvent') return event.audioEvent
  return null
}

function readPayloadEventType(payload: unknown, raw: unknown, envelope: EventEnvelope): unknown {
  const typedValue = readLoose(payload, ['eventType'])
  const rawValue = readLoose(raw, ['eventType', 'Event_Type', 'event_type', 'type'])

  if (typedValue !== undefined) return typedValue
  if (rawValue !== undefined) return rawValue

  if (envelope === 'sysEvent' || envelope === 'textEvent' || envelope === 'listEvent') {
    return OsEventTypeList.CLICK_EVENT
  }

  return undefined
}

function readPayloadSource(payload: unknown, raw: unknown): unknown {
  const typedValue = readLoose(payload, ['eventSource'])
  if (typedValue !== undefined) return typedValue

  return readLoose(raw, ['eventSource', 'EventSource', 'event_source', 'source', 'Source'])
}

function normalizeEventType(value: unknown): NormalizedEventType {
  const code = toEnumCode(value, eventTypeNameToCode)
  return {
    code,
    label: code === undefined ? 'unknown' : eventTypeLabels[code] ?? `event_${code}`,
  }
}

function normalizeSource(value: unknown): NormalizedSource {
  const code = toEnumCode(value, sourceNameToCode)
  const source = code === undefined ? undefined : sourceLabels[code]

  return {
    code,
    label: source?.label ?? 'unknown',
    kind: source?.kind ?? 'unknown',
  }
}

function toEnumCode(value: unknown, nameMap: Record<string, number>): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const asNumber = Number(trimmed)
    if (Number.isFinite(asNumber)) return asNumber

    const normalized = trimmed.split('.').pop()?.toUpperCase()
    if (normalized && normalized in nameMap) return nameMap[normalized]
  }

  return undefined
}

function buildGestureLabel(source: NormalizedSource, eventType: NormalizedEventType, envelope: EventEnvelope): string {
  if (envelope === 'audioEvent') return 'audio.frame'
  if (eventType.label === 'imu') return `${source.kind}.imu`
  return `${source.kind}.${eventType.label}`
}

function readContainer(payload: unknown, raw: unknown): NormalizedEvent['container'] {
  const id = readNumberFrom(payload, raw, ['containerID', 'Container_ID', 'containerId'])
  const name = readStringFrom(payload, raw, ['containerName', 'Container_Name', 'container'])
  if (id === undefined && name === undefined) return undefined
  return { id, name }
}

function readSelected(payload: unknown, raw: unknown): NormalizedEvent['selected'] {
  const index = readNumberFrom(payload, raw, ['currentSelectItemIndex', 'CurrentSelect_ItemIndex', 'selectedIndex'])
  const name = readStringFrom(payload, raw, ['currentSelectItemName', 'CurrentSelect_ItemName', 'selectedName'])
  if (index === undefined && name === undefined) return undefined
  return { index, name }
}

function readImu(payload: unknown, raw: unknown): NormalizedEvent['imu'] {
  const imuValue = readLoose(payload, ['imuData', 'IMU_Data']) ?? readLoose(raw, ['imuData', 'IMU_Data', 'imu'])
  if (!isRecord(imuValue)) return undefined

  return {
    x: readNumberFrom(imuValue, imuValue, ['x', 'X']),
    y: readNumberFrom(imuValue, imuValue, ['y', 'Y']),
    z: readNumberFrom(imuValue, imuValue, ['z', 'Z']),
  }
}

function readAudio(payload: unknown): NormalizedEvent['audio'] {
  if (!isRecord(payload)) return undefined

  const source = String(readLoose(payload, ['source']) ?? 'unknown')
  const audioPcm = readLoose(payload, ['audioPcm'])
  const byteLength = audioPcm instanceof Uint8Array ? audioPcm.byteLength : Array.isArray(audioPcm) ? audioPcm.length : 0

  return { source, byteLength }
}

function updateGestureSequence(event: NormalizedEvent): RecognizedAction | null {
  const now = Date.parse(event.receivedAt)
  sequence = sequence.filter(item => now - Date.parse(item.at) <= SEQUENCE_WINDOW_MS)

  if (isGestureEvent(event)) {
    sequence.push({
      at: event.receivedAt,
      source: event.source.kind,
      name: event.eventType.label,
      label: event.gesture,
    })
  }

  return recognizeAction(sequence)
}

function isGestureEvent(event: NormalizedEvent): boolean {
  return ['click', 'double_click', 'swipe_up', 'swipe_down'].includes(event.eventType.label)
}

function recognizeAction(tokens: GestureToken[]): RecognizedAction | null {
  const recent = tokens.slice(-2).map(token => token.label).join(' ')
  const last = tokens.at(-1)?.label

  if (recent === 'ring.swipe_up ring.click') return { name: 'ring_confirm_up', confidence: 0.95 }
  if (recent === 'ring.swipe_down ring.click') return { name: 'ring_confirm_down', confidence: 0.95 }
  if (recent === 'ring.double_click ring.swipe_up') return { name: 'ring_debug_context', confidence: 0.85 }
  if (last === 'ring.click') return { name: 'ring_select', confidence: 0.8 }
  if (last === 'ring.double_click') return { name: 'ring_cancel_or_shortcut', confidence: 0.8 }
  if (last === 'ring.swipe_up') return { name: 'ring_previous', confidence: 0.75 }
  if (last === 'ring.swipe_down') return { name: 'ring_next', confidence: 0.75 }

  return null
}

async function forwardEvent(event: NormalizedEvent, action: RecognizedAction | null) {
  const config = readConfigFromControls()
  saveConfig(config)

  if (!config.endpoint.trim()) {
    setForwardStatus('No endpoint configured')
    return
  }

  const payload = buildRelayPayload(event, action, config.includeRaw)
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(config.endpoint.trim(), {
      method: 'POST',
      mode: config.noCors ? 'no-cors' : 'cors',
      headers: {
        'Content-Type': config.noCors ? 'text/plain;charset=UTF-8' : 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (config.noCors) {
      setForwardStatus(`Sent opaque ${formatTime(new Date())}`)
      return
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    setForwardStatus(`POST ok ${formatTime(new Date())}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setForwardStatus(`POST failed: ${message}`)
  } finally {
    window.clearTimeout(timeout)
  }
}

function buildRelayPayload(event: NormalizedEvent, action: RecognizedAction | null, includeRaw: boolean): RelayPayload {
  const relayEvent = includeRaw ? event : { ...event, raw: undefined }

  return {
    schema: 'even-r1-relay/v1',
    context: {
      app: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        launchSource,
      },
      device: toPlainValue(deviceInfo),
      status: toPlainValue(deviceStatus),
      location: lastLocation,
      recentGestures: sequence.slice(-8),
    },
    event: relayEvent,
    action,
  }
}

function createTestEvent(): NormalizedEvent {
  return {
    id: ++eventId,
    receivedAt: new Date().toISOString(),
    envelope: 'sysEvent',
    gesture: 'ring.click',
    source: { code: EventSourceType.TOUCH_EVENT_FROM_RING, label: 'ring', kind: 'ring' },
    eventType: { code: OsEventTypeList.CLICK_EVENT, label: 'click' },
    raw: { test: true, eventSource: EventSourceType.TOUCH_EVENT_FROM_RING, eventType: OsEventTypeList.CLICK_EVENT },
  }
}

async function refreshLocation() {
  if (!bridge) {
    setForwardStatus('Bridge unavailable')
    return
  }

  try {
    lastLocation = await bridge.getAppLocation({
      accuracy: AppLocationAccuracy.Medium,
      timeoutMs: 5000,
    })
    renderContext()
    setForwardStatus(lastLocation ? 'Location updated' : 'Location unavailable')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setForwardStatus(`Location failed: ${message}`)
  }
}

async function updateGlasses(content: string) {
  if (!bridge || !glassesReady) return

  try {
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: 1,
        containerName: 'relay-main',
        content,
      }),
    )
  } catch (error) {
    console.warn('Failed to update glasses:', error)
  }
}

function glassesSummary(event: NormalizedEvent, action: RecognizedAction | null): string {
  const lines = [
    'R1 Relay',
    event.gesture,
    action ? `action: ${action.name}` : `event: ${event.envelope}`,
    `seq: ${sequence.slice(-4).map(item => item.name.replace('swipe_', '')).join(' ') || '-'}`,
    lastForwardStatus.slice(0, 32),
  ]

  return lines.join('\n')
}

function render() {
  lastEventEl.textContent = events[0]?.gesture ?? 'None'
  sequenceEl.textContent = sequence.slice(-4).map(item => item.label).join(' -> ') || 'Empty'
  forwardStatusEl.textContent = lastForwardStatus
  renderContext()
  renderLog()
  renderDiagnostics()
}

function renderContext() {
  const model = deviceInfo?.model ?? 'no-device'
  const battery = deviceStatus?.batteryLevel === undefined ? '' : ` ${deviceStatus.batteryLevel}%`
  const location = lastLocation ? ' location' : ''
  contextStatusEl.textContent = `${model}${battery}${location}`
}

function renderLog() {
  if (events.length === 0) {
    eventLogEl.innerHTML = '<li class="empty">No events captured yet</li>'
    return
  }

  eventLogEl.innerHTML = events
    .map(event => {
      const detail = [
        event.envelope,
        event.container?.name,
        event.selected?.name,
        event.imu ? `imu ${formatNumber(event.imu.x)},${formatNumber(event.imu.y)},${formatNumber(event.imu.z)}` : '',
      ]
        .filter(Boolean)
        .join(' | ')

      return `
        <li>
          <time>${escapeHtml(formatTime(new Date(event.receivedAt)))}</time>
          <strong>${escapeHtml(event.gesture)}</strong>
          <span>${escapeHtml(detail || 'event')}</span>
        </li>
      `
    })
    .join('')
}

function renderDiagnostics() {
  deviceDiagnosticEl.textContent = deviceDiagnostic
  glassesDiagnosticEl.textContent = glassesDiagnostic
  rawEventEl.textContent = lastRawEventPreview
}

function setBridgeStatus(text: string, mode: 'ok' | 'warn') {
  bridgeStatus.textContent = text
  bridgeStatus.className = `status-pill ${mode}`
}

function setForwardStatus(text: string) {
  lastForwardStatus = text
  forwardStatusEl.textContent = text
}

function readConfigFromControls(): ForwardConfig {
  return {
    endpoint: endpointInput.value.trim(),
    enabled: enabledInput.checked,
    includeRaw: includeRawInput.checked,
    noCors: noCorsInput.checked,
  }
}

function loadConfig(): ForwardConfig {
  const fallback: ForwardConfig = {
    endpoint: defaultEndpoint(),
    enabled: false,
    includeRaw: true,
    noCors: false,
  }

  try {
    const raw = window.localStorage.getItem(CONFIG_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<ForwardConfig>
    return {
      endpoint: parsed.endpoint ?? fallback.endpoint,
      enabled: parsed.enabled ?? fallback.enabled,
      includeRaw: parsed.includeRaw ?? fallback.includeRaw,
      noCors: parsed.noCors ?? fallback.noCors,
    }
  } catch {
    return fallback
  }
}

function saveConfig(config: ForwardConfig) {
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

function defaultEndpoint(): string {
  const host = window.location.hostname
  if (!host || host === 'localhost' || host === '127.0.0.1') return ''
  return `http://${host}:8787/even`
}

function endpointHostLabel(): string {
  const endpoint = readConfigFromControls().endpoint
  if (!endpoint) return 'not set'

  try {
    return new URL(endpoint).host
  } catch {
    return 'invalid'
  }
}

function readNumberFrom(primary: unknown, fallback: unknown, keys: string[]): number | undefined {
  const value = readLoose(primary, keys) ?? readLoose(fallback, keys)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }

  return undefined
}

function readStringFrom(primary: unknown, fallback: unknown, keys: string[]): string | undefined {
  const value = readLoose(primary, keys) ?? readLoose(fallback, keys)
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function readLoose(value: unknown, keys: string[]): unknown {
  if (!isRecord(value)) return undefined

  for (const key of keys) {
    if (key in value) return value[key]
  }

  const normalizedEntries = new Map(
    Object.entries(value).map(([key, entryValue]) => [key.toLowerCase().replaceAll('_', ''), entryValue]),
  )

  for (const key of keys) {
    const normalized = key.toLowerCase().replaceAll('_', '')
    if (normalizedEntries.has(normalized)) return normalizedEntries.get(normalized)
  }

  return undefined
}

function toPlainValue(value: unknown): unknown {
  if (value == null) return null

  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return String(value)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isEmptyRaw(value: unknown): boolean {
  if (value == null) return true
  if (isRecord(value)) return Object.keys(value).length === 0
  return false
}

function previewJson(value: unknown, maxLength: number): string {
  let output: string

  try {
    output = JSON.stringify(value, null, 2)
  } catch {
    output = String(value)
  }

  return output.length > maxLength ? `${output.slice(0, maxLength)}...` : output
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? '-' : value.toFixed(2)
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[char] ?? char
  })
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing #${id}`)
  return element as T
}
