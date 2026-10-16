#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_PUBLIC_KEY="${DEPLOY_PUBLIC_KEY:?Set DEPLOY_PUBLIC_KEY to the SSH public key of the deploy user}"
SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLICATION_UID=10001

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl gnupg ufw fail2ban unattended-upgrades restic

if ! command -v docker > /dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  . /etc/os-release
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" }
}
JSON
systemctl enable --now docker
systemctl restart docker

if ! id "$DEPLOY_USER" > /dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
grep -qxF "$DEPLOY_PUBLIC_KEY" "/home/$DEPLOY_USER/.ssh/authorized_keys" 2> /dev/null \
  || echo "$DEPLOY_PUBLIC_KEY" >> "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

cat > /etc/ssh/sshd_config.d/99-imkon-hardening.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
sshd -t
systemctl reload ssh || systemctl reload sshd

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl enable --now fail2ban
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF

install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /var/lib/imkon /opt/imkon /opt/imkon/deploy /var/backups/imkon
install -d -m 700 /var/lib/imkon/postgres /var/lib/imkon/redis
install -d -m 755 /var/lib/imkon/caddy
install -d -m 755 -o "$APPLICATION_UID" -g "$APPLICATION_UID" /var/lib/imkon/storage
chown -R "$APPLICATION_UID:$APPLICATION_UID" /var/lib/imkon/storage
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /etc/imkon

if [[ -d "$SCRIPT_DIRECTORY/systemd" ]]; then
  install -m 644 "$SCRIPT_DIRECTORY"/systemd/*.service "$SCRIPT_DIRECTORY"/systemd/*.timer /etc/systemd/system/
  systemctl daemon-reload
fi

echo "Provisioning complete. Next: create /etc/imkon/backend.env, /etc/imkon/deploy.env, /etc/imkon/backup.env, docker login ghcr.io as $DEPLOY_USER, enable timers."
