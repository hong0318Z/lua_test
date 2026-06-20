// RisuAI 엔진 함수 스텁 모음 (mock_risu_api.lua 포팅).
// 원본과 동일한 동작을 하되, 전부 전역(global)으로 등록하고
// JS에서 직접 호출할 수 있는 __mock_* 헬퍼와 JSON 직렬화 함수를 추가했다.
// (브라우저에는 require가 없으므로 원본의 local M 패턴 대신 전역으로 노출한다.)
export const MOCK_RISU_API_LUA = `
local STATE = {}
local CHATLOG = {}
local EDIT_HANDLERS = {}

local function ensureChat(id)
  CHATLOG[id] = CHATLOG[id] or {}
  return CHATLOG[id]
end

function getState(id, key)
  STATE[id] = STATE[id] or {}
  return STATE[id][key]
end

function setState(id, key, value)
  STATE[id] = STATE[id] or {}
  STATE[id][key] = value
end

function getChatLength(id)
  return #ensureChat(id)
end

function getChat(id, idx)
  local log = ensureChat(id)
  return log[idx + 1]
end

function setChat(id, idx, data)
  local log = ensureChat(id)
  local entry = log[idx + 1]
  if entry then entry.data = data end
end

function addChat(id, role, data)
  local log = ensureChat(id)
  table.insert(log, { role = role, data = data, time = os.time() })
end

function getCharacterLastMessage(id)
  local log = ensureChat(id)
  for i = #log, 1, -1 do
    if log[i].role == "char" then return log[i].data end
  end
  return nil
end

function setCharacterLastMessage(id, msg)
  local log = ensureChat(id)
  for i = #log, 1, -1 do
    if log[i].role == "char" then log[i].data = msg; return end
  end
end

function refreshMarkers(id)
  -- no-op (실기기 캐시 갱신용, 테스트 환경에서는 의미 없음)
end

function listenEdit(eventName, fn)
  EDIT_HANDLERS[eventName] = fn
end

-- ===================== JS 연동 헬퍼 (전역, __mock_ 접두사) =====================

function __mock_addUserMessage(id, text)
  table.insert(ensureChat(id), { role = "user", data = text, time = os.time() })
end

function __mock_addCharMessage(id, text)
  table.insert(ensureChat(id), { role = "char", data = text, time = os.time() })
end

function __mock_triggerEdit(eventName, id, data)
  local fn = EDIT_HANDLERS[eventName]
  if not fn then error("등록된 핸들러가 없음: " .. tostring(eventName)) end
  return fn(id, data)
end

function __mock_hasHandler(eventName)
  return EDIT_HANDLERS[eventName] ~= nil
end

-- 간단한 Lua -> JSON 인코더 (state 덤프용. 순수 데이터 테이블만 가정)
local function jsonEscape(s)
  s = s:gsub('\\\\', '\\\\\\\\'):gsub('"', '\\\\"'):gsub('\\n', '\\\\n'):gsub('\\r', '\\\\r'):gsub('\\t', '\\\\t')
  return s
end

local function isArray(t)
  local n = 0
  for _ in pairs(t) do n = n + 1 end
  return n > 0 and n == #t
end

local jsonEncode

jsonEncode = function(v)
  local ty = type(v)
  if ty == "nil" then
    return "null"
  elseif ty == "boolean" then
    return v and "true" or "false"
  elseif ty == "number" then
    return tostring(v)
  elseif ty == "string" then
    return '"' .. jsonEscape(v) .. '"'
  elseif ty == "table" then
    if isArray(v) then
      local parts = {}
      for i, item in ipairs(v) do
        parts[i] = jsonEncode(item)
      end
      return "[" .. table.concat(parts, ",") .. "]"
    else
      local parts = {}
      local n = 0
      for k, item in pairs(v) do
        n = n + 1
        parts[n] = '"' .. jsonEscape(tostring(k)) .. '":' .. jsonEncode(item)
      end
      return "{" .. table.concat(parts, ",") .. "}"
    end
  else
    return "null"
  end
end

function __mock_dumpStateJSON(id)
  return jsonEncode(STATE[id] or {})
end

function __mock_dumpChatJSON(id)
  return jsonEncode(CHATLOG[id] or {})
end

function __mock_resetAll()
  STATE = {}
  CHATLOG = {}
end
`
