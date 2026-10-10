#!/bin/sh
set -eu
umask 077
rm -f /tmp/passwords /tmp/acl
device_password=$(cat /secrets/device/password)
bridge_password=$(cat /secrets/bridge/password)
mosquitto_passwd -c -b /tmp/passwords bridge "$bridge_password"
sed -n 's/^user //p' /secrets/bridge/acl | while IFS= read -r device; do
  if [ "$device" != bridge ]; then mosquitto_passwd -b /tmp/passwords "$device" "$device_password"; fi
done
cp /secrets/bridge/acl /tmp/acl
unset device_password bridge_password
exec mosquitto -c /config/mosquitto.conf
