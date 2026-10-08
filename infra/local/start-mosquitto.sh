#!/bin/sh
set -eu
umask 077
device_password=$(cat /secrets/mqtt-device/password)
bridge_password=$(cat /secrets/mqtt-bridge/password)
# A container restart retains /tmp. Recreate these derived files rather than
# opening last run's broker-owned files from the root startup process.
rm -f /tmp/passwords /tmp/acl
mosquitto_passwd -c -b /tmp/passwords bridge "$bridge_password"
sed -n 's/^user //p' /secrets/mqtt-bridge/acl | while IFS= read -r device; do
  if [ "$device" != bridge ]; then mosquitto_passwd -b /tmp/passwords "$device" "$device_password"; fi
done
cp /secrets/mqtt-bridge/acl /tmp/acl
chown mosquitto:mosquitto /tmp/passwords /tmp/acl
chmod 600 /tmp/passwords /tmp/acl
unset device_password bridge_password
exec /docker-entrypoint.sh mosquitto -c /local/mosquitto.conf
