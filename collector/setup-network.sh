#!/usr/bin/env bash
# Run explicitly with sudo after installing Arch's nethogs package.
set -euo pipefail

if [[ ${EUID} -ne 0 || $# -ne 1 ]]; then
  echo 'Usage: sudo bash setup-network.sh YOUR_USERNAME' >&2
  exit 1
fi
account=$1
account_uid=$(id -u "$account")
if [[ $account_uid -eq 0 ]]; then
  echo 'Choose the ordinary user running HyprTrack, not root.' >&2
  exit 1
fi
if ! command -v setfacl >/dev/null; then
  echo 'Install the Arch acl package first: sudo pacman -S --needed acl' >&2
  exit 1
fi
capture_source=/usr/bin/nethogs
if [[ ! -x $capture_source || $(stat -c %u "$capture_source") -ne 0 ]]; then
  echo 'Install the root-owned Arch package first: sudo pacman -S --needed nethogs' >&2
  exit 1
fi
if ! "$capture_source" -h 2>&1 | grep -q -- '-C'; then
  echo 'This NetHogs version does not support TCP + UDP capture (-C). Update nethogs.' >&2
  exit 1
fi
capture_dir=/usr/local/libexec/hyprtrack
install -d -o root -g root -m 0755 "$capture_dir"
staged_capture=$(mktemp "$capture_dir/.nethogs.XXXXXXXX")
trap 'rm -f -- "$staged_capture"' EXIT
install -o root -g root -m 0700 "$capture_source" "$staged_capture"
# Grant capture access to the selected UID even when its primary group is shared.
setfacl --set "u::rwx,u:$account_uid:r-x,g::---,m::r-x,o::---" "$staged_capture"
setcap 'cap_net_admin,cap_net_raw,cap_dac_read_search,cap_sys_ptrace+ep' "$staged_capture"
mv -Tf -- "$staged_capture" "$capture_dir/nethogs"
echo 'Network capture is ready. The existing HyprTrack collector starts it automatically.'
echo 'Re-run this setup after updating the nethogs package to update the private capture copy.'
