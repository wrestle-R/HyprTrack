#!/usr/bin/env bash
# Run explicitly with sudo after installing Arch's nethogs package.
set -euo pipefail

if [[ ${EUID} -ne 0 || $# -ne 1 ]]; then
  echo 'Usage: sudo bash setup-network.sh YOUR_USERNAME' >&2
  exit 1
fi
account=$1
account_uid=$(id -u "$account")
account_group=$(id -gn "$account")
if [[ $account_uid -eq 0 ]]; then
  echo 'Choose the ordinary user running HyprTrack, not root.' >&2
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
install -d -o root -g root -m 0755 /usr/local/libexec/hyprtrack
install -o root -g "$account_group" -m 0750 "$capture_source" /usr/local/libexec/hyprtrack/nethogs
setcap 'cap_net_admin,cap_net_raw,cap_dac_read_search,cap_sys_ptrace+ep' /usr/local/libexec/hyprtrack/nethogs
echo 'Network capture is ready. The existing HyprTrack collector starts it automatically.'
echo 'Re-run this setup after updating the nethogs package to update the private capture copy.'
