#!/bin/sh
# Runtime users need only macOS system tools. Never write protocol logs to stdout.
set -eu
umask 077
fail() { printf 'No Short Usage: %s\n' "$1" >&2; exit 1; }
[ "$(/usr/bin/uname -s)" = Darwin ] || fail 'Usage hiện chỉ hỗ trợ macOS 14 trở lên; hai skill vẫn dùng độc lập.'
mac_version=$(/usr/bin/sw_vers -productVersion)
mac_major=${mac_version%%.*}
case "$mac_major" in ''|*[!0-9]*) fail 'Không xác định được phiên bản macOS.';; esac
[ "$mac_major" -ge 14 ] || fail 'Usage cần macOS 14 trở lên.'
case "$(/usr/bin/uname -m)" in arm64) usage_target=darwin-arm64;; x86_64) usage_target=darwin-x64;; *) fail 'Kiến trúc máy chưa được hỗ trợ.';; esac
usage_script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
usage_root=$(CDPATH= cd -- "$usage_script_dir/.." && pwd)
usage_manifest="$usage_root/packages/usage/runtime-manifest.json"
[ -f "$usage_manifest" ] || fail 'Thiếu runtime manifest. Hãy cài gói plugin đầy đủ.'
value() { /usr/bin/plutil -extract "$1" raw -o - "$usage_manifest" 2>/dev/null; }
usage_version=$(value version) || fail 'Runtime manifest không hợp lệ.'
case "$usage_version" in ''|*[!0-9.]*) fail 'Phiên bản runtime không hợp lệ.';; esac
plugin_version=$(/usr/bin/plutil -extract version raw -o - "$usage_root/plugin.json" 2>/dev/null) || fail 'Thiếu plugin manifest.'
[ "$plugin_version" = "$usage_version" ] || fail 'Phiên bản plugin và runtime không khớp. Hãy cài lại plugin.'
usage_prefix="platforms.$usage_target"
usage_helper_sha=$(value "$usage_prefix.binaries.no-short-usage") || fail 'Thiếu checksum helper.'
usage_cli_sha=$(value "$usage_prefix.binaries.ccusage") || fail 'Thiếu checksum ccusage.'
valid_hash() { [ "${#1}" -eq 64 ] && case "$1" in *[!0-9a-f]*) return 1;; *) return 0;; esac; }
valid_hash "$usage_helper_sha" && valid_hash "$usage_cli_sha" || fail 'Checksum manifest không hợp lệ.'
verify_runtime() {
  [ -f "$1/no-short-usage" ] && [ ! -L "$1/no-short-usage" ] && [ -x "$1/no-short-usage" ] || return 1
  [ -f "$1/ccusage" ] && [ ! -L "$1/ccusage" ] && [ -x "$1/ccusage" ] || return 1
  usage_actual=$(/usr/bin/shasum -a 256 "$1/no-short-usage" | /usr/bin/awk '{print $1}')
  [ "$usage_actual" = "$usage_helper_sha" ] || return 1
  usage_actual=$(/usr/bin/shasum -a 256 "$1/ccusage" | /usr/bin/awk '{print $1}')
  [ "$usage_actual" = "$usage_cli_sha" ]
}
usage_bundled="$usage_root/packages/usage/runtime/$usage_target"
if [ -d "$usage_bundled" ]; then
  verify_runtime "$usage_bundled" || fail 'Runtime bundled sai checksum hoặc quyền thực thi; không chạy. Hãy cài lại plugin.'
  exec "$usage_bundled/no-short-usage" "$@"
fi
usage_cache_base="${XDG_CACHE_HOME:-$HOME/Library/Caches}/no-short/runtime/$usage_version"
usage_cached="$usage_cache_base/$usage_target"
if [ -d "$usage_cached" ]; then
  verify_runtime "$usage_cached" || fail 'Runtime cache sai checksum; không chạy. Xóa cache runtime no-short rồi cài lại.'
  exec "$usage_cached/no-short-usage" "$@"
fi
usage_url=$(value "$usage_prefix.url") || fail 'Thiếu URL runtime.'
usage_archive_sha=$(value "$usage_prefix.sha256") || fail 'Thiếu checksum archive.'
valid_hash "$usage_archive_sha" || fail 'Checksum archive không hợp lệ.'
[ "$usage_url" = "https://github.com/longlonglong173/no-short/releases/download/v$usage_version/no-short-usage-$usage_target.tar.gz" ] || fail 'URL runtime không thuộc release đã khóa.'
/bin/mkdir -p "$usage_cache_base"
usage_install_lock="$usage_cache_base/$usage_target.install-lock"
usage_wait=0
while ! /bin/mkdir "$usage_install_lock" 2>/dev/null; do
  if [ -d "$usage_cached" ]; then
    verify_runtime "$usage_cached" || fail 'Runtime tải về sai checksum; không chạy.'
    exec "$usage_cached/no-short-usage" "$@"
  fi
  usage_owner=$(/bin/cat "$usage_install_lock/pid" 2>/dev/null || true)
  case "$usage_owner" in
    ''|*[!0-9]*)
      # Allow an initializing owner time to atomically publish its PID; reclaim
      # abandoned directories after a crash before that write completed.
      usage_modified=$(/usr/bin/stat -f %m "$usage_install_lock" 2>/dev/null || printf 0)
      usage_now=$(/bin/date +%s)
      if [ "$((usage_now - usage_modified))" -gt 30 ]; then /bin/rm -rf "$usage_install_lock"; continue; fi;;
    *) if ! kill -0 "$usage_owner" 2>/dev/null; then /bin/rm -rf "$usage_install_lock"; continue; fi;;
  esac
  usage_wait=$((usage_wait + 1))
  [ "$usage_wait" -lt 120 ] || fail 'Một tiến trình khác đang cài runtime. Hãy mở lại plugin sau.'
  /bin/sleep 1
done
usage_scratch=''
cleanup() { [ -z "$usage_scratch" ] || /bin/rm -rf "$usage_scratch"; /bin/rm -rf "$usage_install_lock"; }
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
printf '%s\n' "$$" > "$usage_install_lock/pid.tmp"
/bin/mv "$usage_install_lock/pid.tmp" "$usage_install_lock/pid"
usage_scratch=$(/usr/bin/mktemp -d "$usage_cache_base/.install.XXXXXX")
printf 'No Short Usage: đang tải runtime %s cho %s (một lần).\n' "$usage_version" "$usage_target" >&2
/usr/bin/curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 10 --max-time 120 --output "$usage_scratch/runtime.tar.gz" "$usage_url" || fail 'Chưa tải được runtime đã khóa. Kiểm tra mạng hoặc cài gói plugin đầy đủ từ release.'
usage_actual=$(/usr/bin/shasum -a 256 "$usage_scratch/runtime.tar.gz" | /usr/bin/awk '{print $1}')
[ "$usage_actual" = "$usage_archive_sha" ] || fail 'Archive sai checksum; không giải nén hoặc thực thi.'
/usr/bin/tar -tzf "$usage_scratch/runtime.tar.gz" > "$usage_scratch/files"
/usr/bin/awk '$0 != "no-short-usage" && $0 != "ccusage" && $0 != "THIRD_PARTY_NOTICES.txt" {exit 1}' "$usage_scratch/files" || fail 'Archive chứa đường dẫn không được phép.'
/usr/bin/tar -tvzf "$usage_scratch/runtime.tar.gz" | /usr/bin/awk 'substr($0,1,1) != "-" {exit 1}' || fail 'Archive chứa liên kết hoặc kiểu file không được phép.'
/bin/mkdir "$usage_scratch/runtime"
/usr/bin/tar -xzf "$usage_scratch/runtime.tar.gz" -C "$usage_scratch/runtime" --no-same-owner
verify_runtime "$usage_scratch/runtime" || fail 'Binary tải về sai checksum hoặc quyền thực thi; không chạy.'
/bin/mv "$usage_scratch/runtime" "$usage_cached"
cleanup
trap - EXIT HUP INT TERM
exec "$usage_cached/no-short-usage" "$@"
