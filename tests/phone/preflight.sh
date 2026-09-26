#!/usr/bin/env bash
# 真机走局前置：重启 APP → 取新 WebView 调试 socket → 重建 adb forward → 校验 CDP 可达。
# 只重启 APP 进程、不动手机数据、不重装包、不碰 :3000 与其他进程。
set -u

prepare() {
  local serial="$1" port="$2" label="$3"
  echo "=== [$label] $serial ==="

  adb -s "$serial" shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1
  adb -s "$serial" shell am force-stop night.party.app
  sleep 1
  adb -s "$serial" shell monkey -p night.party.app -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1

  local pid=""
  for _ in $(seq 1 20); do
    pid="$(adb -s "$serial" shell pidof night.party.app 2>/dev/null | tr -d '\r\n ')"
    [ -n "$pid" ] && break
    sleep 1
  done
  if [ -z "$pid" ]; then echo "  ✗ APP 未起来"; return 1; fi
  echo "  pid=$pid"

  # 等 webview_devtools socket 出现
  local sock=""
  for _ in $(seq 1 20); do
    sock="$(adb -s "$serial" shell cat /proc/net/unix 2>/dev/null | grep -o "webview_devtools_remote_[0-9]*" | head -1 | tr -d '\r')"
    [ -n "$sock" ] && break
    sleep 1
  done
  if [ -z "$sock" ]; then echo "  ✗ 没找到 webview_devtools socket"; return 1; fi
  echo "  socket=@$sock"

  adb -s "$serial" forward --remove "tcp:$port" >/dev/null 2>&1
  adb -s "$serial" forward "tcp:$port" "localabstract:$sock" >/dev/null || { echo "  ✗ forward 失败"; return 1; }

  local url=""
  for _ in $(seq 1 20); do
    url="$(curl -s -m 5 "http://127.0.0.1:$port/json" 2>/dev/null | grep -o '"url": *"[^"]*"' | head -1)"
    [ -n "$url" ] && break
    sleep 1
  done
  echo "  CDP tcp:$port -> $url"
  case "$url" in
    *192.168.31.60:3000*) echo "  ✓ 就绪"; return 0 ;;
    *) echo "  ✗ 页面未落在 192.168.31.60:3000"; return 1 ;;
  esac
}

rc=0
prepare "192.168.31.31:5555" 9331 "dev31" || rc=1
prepare "192.168.31.63:5555" 9363 "dev63" || rc=1
exit $rc
