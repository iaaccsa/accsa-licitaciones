set -euo pipefail
# Moves containerd's root onto the LV dedicated to Docker.
#
# Docker 29 stores images through the containerd image store, whose root is
# /var/lib/containerd. That path is NOT under /var/lib/docker, so the dedicated
# LV was holding only volumes and the build cache while every image grew on /,
# which is exactly what that LV exists to prevent.
#
# Idempotent: re-running it after a successful migration is a no-op.
# Disruptive: stops Docker, and with it every container on the host.

LV=/var/lib/docker
NEW=$LV/containerd
OLD=/var/lib/containerd
CONFIG=/etc/containerd/config.toml
UNITS="licitaciones-app licitaciones-executor licitaciones-registry"

echo "== preconditions =="
mountpoint -q "$LV" || { echo "  ERROR: $LV is not a mount point" >&2; exit 1; }
if grep -qE "^root = \"$NEW\"" "$CONFIG"; then
  echo "  already migrated (root = $NEW), nothing to do"
  exit 0
fi
[ -d "$OLD" ] || { echo "  ERROR: $OLD does not exist" >&2; exit 1; }
need=$(du -sm "$OLD" | cut -f1)
free=$(df -m --output=avail "$LV" | tail -1 | tr -d ' ')
echo "  to move: ${need}M, free on the LV: ${free}M"
[ "$free" -gt $((need + 2048)) ] || { echo "  ERROR: not enough room on $LV" >&2; exit 1; }

echo "== stopping workloads =="
stopped=""
for u in $UNITS; do
  if systemctl is-active --quiet "$u" 2>/dev/null; then
    systemctl stop "$u"; stopped="$stopped $u"; echo "  stopped $u"
  fi
done
[ -n "$stopped" ] || echo "  (none were running)"

echo "== stopping docker and containerd =="
# The socket goes first: leaving it up would pull docker.service back in.
systemctl stop docker.socket docker.service
systemctl stop containerd.service
echo "  docker=$(systemctl is-active docker.service) containerd=$(systemctl is-active containerd.service)"

echo "== copying the data =="
mkdir -p "$NEW"
# -H matters: the content store hardlinks blobs, and losing that would inflate
# the copy and break layer identity.
rsync -aHAX --numeric-ids --delete "$OLD/" "$NEW/"
echo "  copied: $(du -sh "$NEW" | cut -f1)"

echo "== pointing containerd at the new root =="
cp -a "$CONFIG" "$CONFIG.bak"
sed -i "s|^#\?root = \".*\"|root = \"$NEW\"|" "$CONFIG"
grep -E "^root = " "$CONFIG" | sed 's/^/  /'

# Kept, not deleted: it is the rollback if anything below goes wrong.
mv "$OLD" "$OLD.old"

echo "== starting back up =="
systemctl start containerd.service
systemctl start docker.service
for u in $stopped; do systemctl start "$u"; echo "  started $u"; done

echo "== verification =="
containerd config dump 2>/dev/null | grep -E "^root = " | sed 's/^/  effective /'
echo "  images: $(docker images -q | wc -l | tr -d ' ')"
echo "  containers up: $(docker ps -q | wc -l | tr -d ' ')"
docker ps --format '    {{.Names}}  {{.Status}}'
df -h / "$LV" | sed 's/^/  /'
echo ""
echo "  Old data kept at $OLD.old ($(du -sh "$OLD.old" 2>/dev/null | cut -f1))."
echo "  Remove it once the containers have been verified:  rm -rf $OLD.old"
