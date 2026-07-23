# Even R1 Relay — HTTP API Specification

> **Schema version:** `even-r1-relay/v1`
> **Last updated:** 2026-07-23

---

## 1. Overview

Even R1 Relay 是一个 HTTP 事件转发系统，将 Even G2 眼镜和 R1 戒指的输入事件通过 POST 请求转发到任意硬件或服务端。

**数据流向：**

```
R1 戒指 / G2 眼镜
      ↓ (BLE)
Even App (iOS/Android)
      ↓ (WebView bridge)
手机 Web 页面 (Vite dev server)
      ↓ (HTTP POST)
Mac Relay Server (:8787)
      ↓ (HTTP POST, optional)
目标硬件 / 微控制器 / 服务端
```

---

## 2. Endpoint

### 2.1 Relay Server (Mac 侧)

| 属性 | 值 |
|------|-----|
| **URL** | `http://<mac-ip>:8787/even` |
| **Method** | `POST` |
| **Content-Type** | `application/json` |
| **CORS** | `Access-Control-Allow-Origin: *` |

### 2.2 直连硬件 (No-CORS 模式)

| 属性 | 值 |
|------|-----|
| **URL** | `http://<hardware-ip>:<port>/even` (自定义) |
| **Method** | `POST` |
| **Content-Type** | `text/plain;charset=UTF-8` |
| **CORS** | 无需（fire-and-forget，不等待响应） |

> 硬件端无需实现 CORS，body 仍是 JSON 字符串，只是 Content-Type 标记为 text/plain 以绕过浏览器预检。

---

## 3. Request

### 3.1 HTTP Headers

```
POST /even HTTP/1.1
Host: <relay-or-hardware-ip>:8787
Content-Type: application/json
```

### 3.2 Payload Schema

```jsonc
{
  "schema": "even-r1-relay/v1",     // 协议版本标识，固定值
  "context": {                       // 设备和应用上下文
    "app": {
      "url": string,                 // 当前页面 URL
      "userAgent": string,           // WebView User-Agent
      "launchSource": "appMenu" | "glassesMenu" | null
    },
    "device": DeviceInfo | null,     // 设备信息（见 §4.1）
    "status": DeviceStatus | null,   // 设备状态（见 §4.2）
    "location": AppLocation | null,  // GPS 位置（见 §4.3）
    "recentGestures": GestureToken[] // 最近 8 条手势记录（见 §4.4）
  },
  "event": NormalizedEvent,          // 当前事件（见 §5）
  "action": RecognizedAction | null  // 识别到的组合动作（见 §6）
}
```

---

## 4. Context Types

### 4.1 DeviceInfo

```jsonc
{
  "model": "g2" | "g1" | "ring",    // 设备型号
  "sn": string,                      // 序列号
  "status": DeviceStatus | null      // 嵌套状态
}
```

### 4.2 DeviceStatus

```jsonc
{
  "sn": string,                      // 序列号
  "batteryLevel": number,            // 电量 0-100
  "connectType": number              // 连接类型枚举
}
```

### 4.3 AppLocation

```jsonc
{
  "latitude": number,
  "longitude": number,
  "altitude": number,
  "accuracy": number,
  "timestamp": string                // ISO 8601
}
```

> 仅当用户点击 Location 按钮后才有值，否则为 `null`。

### 4.4 GestureToken

```jsonc
{
  "at": string,                      // ISO 8601 时间戳
  "source": SourceKind,              // 见 §5.2
  "name": string,                    // 事件标签：click / double_click / swipe_up / swipe_down
  "label": string                    // 完整标签：ring.click / glasses_right.swipe_up 等
}
```

---

## 5. NormalizedEvent

```jsonc
{
  "id": number,                      // 自增事件 ID
  "receivedAt": string,              // ISO 8601 接收时间
  "envelope": EventEnvelope,         // 见 §5.1
  "gesture": string,                 // 可读手势标签，如 "ring.click"
  "source": {                        // 事件来源
    "code": number | undefined,      // SDK 枚举值
    "label": string,                 // 来源名称
    "kind": SourceKind               // 见 §5.2
  },
  "eventType": {                     // 事件类型
    "code": number | undefined,      // SDK 枚举值
    "label": string                  // 类型标签，见 §5.3
  },
  "container": {                     // 可选：触发事件的 UI 容器
    "id": number | undefined,
    "name": string | undefined
  } | undefined,
  "selected": {                      // 可选：列表选中项
    "index": number | undefined,
    "name": string | undefined
  } | undefined,
  "imu": {                           // 可选：IMU 数据
    "x": number | undefined,
    "y": number | undefined,
    "z": number | undefined
  } | undefined,
  "audio": {                         // 可选：音频帧
    "source": string,                // "glasses" | "phone"
    "byteLength": number             // PCM 数据字节数
  } | undefined,
  "raw": object | undefined          // 可选：原始 JSON（includeRaw=true 时包含）
}
```

### 5.1 EventEnvelope

| 值 | 含义 |
|----|------|
| `sysEvent` | 系统事件（点击、滑动、IMU、前后台切换） |
| `textEvent` | 文本容器事件 |
| `listEvent` | 列表容器事件 |
| `audioEvent` | 音频帧事件 |
| `unknown` | 未识别（仍保留 raw 数据） |

### 5.2 SourceKind

| 值 | 含义 | 物理设备 |
|----|------|----------|
| `ring` | R1 戒指输入 | Even R1 |
| `glasses_right` | G2 右侧镜腿触控 | Even G2 |
| `glasses_left` | G2 左侧镜腿触控 | Even G2 |
| `unknown` | 未知来源 | — |

### 5.3 eventType.label

| label | 含义 | 典型来源 |
|-------|------|----------|
| `click` | 单击 | ring / glasses |
| `double_click` | 双击 | ring / glasses |
| `swipe_up` | 上滑 | ring / glasses |
| `swipe_down` | 下滑 | ring / glasses |
| `imu` | IMU 数据上报 | ring |
| `foreground_enter` | 进入前台 | system |
| `foreground_exit` | 退出前台 | system |
| `abnormal_exit` | 异常退出 | system |
| `system_exit` | 系统退出 | system |
| `unknown` | 未识别 | — |

### 5.4 gesture 命名规则

格式：`{source.kind}.{eventType.label}`

示例：
- `ring.click` — R1 戒指单击
- `ring.swipe_up` — R1 戒指上滑
- `glasses_right.double_click` — G2 右镜腿双击
- `glasses_left.click` — G2 左镜腿单击
- `ring.imu` — R1 IMU 数据
- `audio.frame` — 音频帧（固定）

---

## 6. RecognizedAction

基于 2.5 秒窗口内的手势序列识别出的组合动作。

```jsonc
{
  "name": string,       // 动作名称
  "confidence": number  // 置信度 0.0-1.0
}
```

| name | 手势序列 | confidence | 含义 |
|------|----------|------------|------|
| `ring_confirm_up` | swipe_up → click | 0.95 | 上滑确认 |
| `ring_confirm_down` | swipe_down → click | 0.95 | 下滑确认 |
| `ring_debug_context` | double_click → swipe_up | 0.85 | 调试上下文 |
| `ring_select` | click | 0.80 | 选择/确认 |
| `ring_cancel_or_shortcut` | double_click | 0.80 | 取消/快捷操作 |
| `ring_previous` | swipe_up | 0.75 | 上一个 |
| `ring_next` | swipe_down | 0.75 | 下一个 |

> 当序列不匹配任何组合时，`action` 为 `null`。

---

## 7. Response (Relay Server)

### 7.1 成功

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"ok": true, "forwarded": false}
```

| 字段 | 类型 | 含义 |
|------|------|------|
| `ok` | boolean | 请求处理成功 |
| `forwarded` | boolean | 是否已转发到 `FORWARD_URL` |

### 7.2 错误

```http
HTTP/1.1 500 Internal Server Error
Content-Type: application/json; charset=utf-8

{"ok": false, "error": "FORWARD_URL returned HTTP 502"}
```

### 7.3 No-CORS 模式

无响应体（opaque response），硬件端无需返回任何内容。

---

## 8. Full Example

### 8.1 R1 单击事件

```json
{
  "schema": "even-r1-relay/v1",
  "context": {
    "app": {
      "url": "http://192.168.1.10:5173/",
      "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ...",
      "launchSource": "glassesMenu"
    },
    "device": {
      "model": "g2",
      "sn": "EVR-G2-XXXX",
      "status": { "sn": "EVR-G2-XXXX", "batteryLevel": 82 }
    },
    "status": { "sn": "EVR-G2-XXXX", "batteryLevel": 82 },
    "location": null,
    "recentGestures": [
      { "at": "2026-07-23T10:30:01.123Z", "source": "ring", "name": "click", "label": "ring.click" }
    ]
  },
  "event": {
    "id": 12,
    "receivedAt": "2026-07-23T10:30:01.123Z",
    "envelope": "sysEvent",
    "gesture": "ring.click",
    "source": { "code": 2, "label": "ring", "kind": "ring" },
    "eventType": { "code": 0, "label": "click" },
    "container": { "id": 1, "name": "relay-main" },
    "selected": null,
    "imu": null,
    "audio": null
  },
  "action": { "name": "ring_select", "confidence": 0.8 }
}
```

### 8.2 R1 上滑 + 单击组合

```json
{
  "schema": "even-r1-relay/v1",
  "context": { "..." : "..." },
  "event": {
    "id": 15,
    "receivedAt": "2026-07-23T10:30:05.456Z",
    "envelope": "sysEvent",
    "gesture": "ring.click",
    "source": { "code": 2, "label": "ring", "kind": "ring" },
    "eventType": { "code": 0, "label": "click" }
  },
  "action": { "name": "ring_confirm_up", "confidence": 0.95 }
}
```

### 8.3 G2 镜腿双击 + IMU

```json
{
  "schema": "even-r1-relay/v1",
  "context": { "..." : "..." },
  "event": {
    "id": 20,
    "receivedAt": "2026-07-23T10:31:00.789Z",
    "envelope": "sysEvent",
    "gesture": "glasses_right.double_click",
    "source": { "code": 1, "label": "glasses_right", "kind": "glasses_right" },
    "eventType": { "code": 3, "label": "double_click" },
    "imu": { "x": 0.12, "y": -0.34, "z": 9.78 }
  },
  "action": { "name": "ring_cancel_or_shortcut", "confidence": 0.8 }
}
```

---

## 9. Hardware Integration Guide

### 9.1 ESP32 / Arduino (No-CORS 直连)

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "your-wifi";
const char* password = "your-password";
const int port = 80;

WiFiServer server(port);

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  Serial.println(WiFi.localIP());
  server.begin();
}

void loop() {
  WiFiClient client = server.available();
  if (!client) return;

  // 读取 POST body
  String body = "";
  while (client.available()) body += (char)client.read();

  // 解析 JSON
  StaticJsonDocument<2048> doc;
  deserializeJson(doc, body);

  const char* gesture = doc["event"]["gesture"];
  const char* action  = doc["action"]["name"];

  Serial.printf("gesture=%s action=%s\n", gesture, action);

  // 根据 action 控制硬件
  if (action && strcmp(action, "ring_select") == 0) {
    // 执行选择操作
  } else if (action && strcmp(action, "ring_next") == 0) {
    // 下一个
  }

  // 返回 200（No-CORS 模式下可省略）
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: application/json");
  client.println();
  client.println("{\"ok\":true}");
  client.stop();
}
```

### 9.2 Python (通过 Relay 转发)

```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/even', methods=['POST'])
def handle_even_event():
    payload = request.json
    event = payload.get('event', {})
    action = payload.get('action')

    gesture = event.get('gesture', 'unknown')
    action_name = action['name'] if action else 'none'

    print(f"gesture={gesture} action={action_name}")

    # 根据 action 执行硬件控制
    if action_name == 'ring_select':
        print(">> 执行选择")
    elif action_name == 'ring_next':
        print(">> 下一个")
    elif action_name == 'ring_previous':
        print(">> 上一个")
    elif action_name == 'ring_confirm_up':
        print(">> 确认")

    return jsonify(ok=True)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
```

启动 relay 并指定转发地址：

```bash
FORWARD_URL=http://<python-server-ip>:8080/even npm run relay
```

### 9.3 Raspberry Pi / Node.js

```javascript
import http from 'node:http'

http.createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return }

  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', () => {
    const { event, action } = JSON.parse(body)

    console.log(`${event.gesture} → ${action?.name ?? 'none'}`)

    // GPIO 控制
    if (action?.name === 'ring_select') {
      // gpio.write(pin, HIGH)
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  })
}).listen(8080, '0.0.0.0')
```

---

## 10. Relay Server 配置

| 环境变量 | 默认值 | 含义 |
|----------|--------|------|
| `PORT` | `8787` | Relay 监听端口 |
| `FORWARD_URL` | *(空)* | 二级转发目标 URL（留空则仅接收） |
| `MAX_BODY_BYTES` | `1048576` | 最大请求体字节数 |

```bash
# 仅接收，不转发
npm run relay

# 接收并转发到硬件
FORWARD_URL=http://192.168.1.50:8080/even npm run relay

# 自定义端口
PORT=9000 npm run relay
```

---

## 11. Error Handling

| 场景 | HTTP Status | Response Body |
|------|-------------|---------------|
| 正常接收 | 200 | `{"ok": true, "forwarded": false}` |
| 正常接收 + 已转发 | 200 | `{"ok": true, "forwarded": true}` |
| 非 POST 或路径错误 | 404 | `{"ok": false, "error": "POST /even expected"}` |
| JSON 解析失败 | 500 | `{"ok": false, "error": "<message>"}` |
| FORWARD_URL 不可达 | 500 | `{"ok": false, "error": "FORWARD_URL returned HTTP <code>"}` |
| 请求体超限 | 500 | `{"ok": false, "error": "Request body exceeded <bytes> bytes"}` |

---

## 12. CORS Headers

Relay server 所有响应均包含：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

`OPTIONS` 预检请求返回 `204 No Content`。

---

## 13. Quick Reference Card

```
┌─────────────────────────────────────────────────────┐
│  Endpoint:  POST /even                              │
│  Content-Type: application/json                     │
│                                                     │
│  Key Fields:                                        │
│    event.gesture    → "ring.click"                  │
│    event.source.kind → "ring" | "glasses_right"     │
│    event.eventType.label → "click" | "swipe_up"     │
│    action.name      → "ring_select" | "ring_next"   │
│    action.confidence → 0.0 ~ 1.0                   │
│                                                     │
│  Response:  {"ok": true, "forwarded": false}        │
└─────────────────────────────────────────────────────┘
```
