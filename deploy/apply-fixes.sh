#!/usr/bin/env bash
# Run as root on docker01, with a previously tested candidate directory and image.
set -Eeuo pipefail
umask 077
candidate=${1:?candidate directory}
image=${2:?tested image tag}
stamp=${3:?release timestamp}
[[ "$candidate" =~ ^/opt/homelab/stacks/werkheft/candidates/fixes-[A-Za-z0-9]+$ ]]
[[ "$image" =~ ^werkheft:fixes-[0-9]+$ ]]
[[ "$stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]
stack=/opt/homelab/stacks/werkheft
release="$stack/releases/$stamp"
backupdir=/srv/werkheft/backups
old=$(docker inspect --format '{{.Image}}' werkheft)
new=$(docker image inspect --format '{{.Id}}' "$image")
test "$new" = "$(docker inspect --format '{{.Image}}' werkheft-fixes-review)"
test "$(docker inspect --format '{{index .Config.Labels "purpose"}}' werkheft-fixes-review)" = werkheft-fixes-review
install -d -m 700 "$release"
install -d -m 700 -o 1000 -g 1000 "$backupdir"
docker tag "$old" "werkheft:before-fixes-$stamp"
tar -czf "$release/source-before.tar.gz" -C "$stack/app" Dockerfile .dockerignore package.json server.mjs lib public
printf '{"before":"%s","after":"%s","backup":"%s/werkheft-before-%s.sqlite"}\n' "$old" "$new" "$backupdir" "$stamp" > "$release/release.json"
stopped=0
rollback(){
  status=$?
  trap - ERR
  if ((stopped)); then
    echo 'Aktualisierung fehlgeschlagen; vorheriges Image und vorheriger Quellstand werden wieder gestartet.' >&2
    tar -xzf "$release/source-before.tar.gz" -C "$stack/app"
    docker tag "$old" werkheft:local
    (cd "$stack" && docker compose up -d --no-build --pull never --wait --wait-timeout 60) || true
  fi
  exit "$status"
}
trap rollback ERR
cd "$stack"
docker compose stop --timeout 30 werkheft
stopped=1
# The old application is stopped: the backup includes every committed write,
# and a read-only source mount prevents the backup helper from modifying data.
docker run --rm -i --network none --read-only --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges:true \
  -v /srv/werkheft/data:/source:ro -v "$backupdir:/backup" -e RELEASE_STAMP="$stamp" "$old" node --input-type=module - <<'JS'
import {DatabaseSync,backup} from 'node:sqlite';
import {chmodSync,writeFileSync} from 'node:fs';
const destination='/backup/werkheft-before-'+process.env.RELEASE_STAMP+'.sqlite';
// The app is stopped and /source is read-only: open immutable so SQLite needs no -shm/-wal files.
const source=new DatabaseSync('file:/source/werkheft.sqlite?immutable=1',{readOnly:true});
try{
 await backup(source,destination);chmodSync(destination,0o600);
 const copy=new DatabaseSync(destination,{readOnly:true});
 try{if(Object.values(copy.prepare('PRAGMA quick_check').get())[0]!=='ok')throw new Error('Integrity check failed');}finally{copy.close();}
 console.log('Konsistente SQLite-Sicherung erstellt und geprüft.');
}catch(error){console.error('Sicherung fehlgeschlagen:',error.name);process.exitCode=1;}finally{source.close();}
JS
# Rehearse startup repairs and a complete JSON round-trip on a disposable copy.
# No data leaves the VM; only aggregate repair counts are logged.
docker run --rm -i --network none --read-only --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges:true --memory 512m \
  --tmpfs /tmp:size=256m,mode=1777 -v "$backupdir:/backup:ro" -e RELEASE_STAMP="$stamp" "$new" node --input-type=module - <<'JS'
import {copyFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {Store} from '/app/lib/store.mjs';
const file='/tmp/check.sqlite';copyFileSync('/backup/werkheft-before-'+process.env.RELEASE_STAMP+'.sqlite',file);
const raw=new DatabaseSync(file,{readOnly:true});
const before=new Map(raw.prepare('SELECT id,type,data FROM records').all().map(r=>[r.id,{type:r.type,data:JSON.parse(r.data)}]));raw.close();
let checked,restored;
try{
 checked=new Store(file);
 const snapshot=checked.export();
 const after=checked.db.prepare('SELECT id,type,data FROM records').all();assert.equal(after.length,before.size);
 for(const row of after){
  const previous=structuredClone(before.get(row.id).data),current=JSON.parse(row.data);
  if(row.type==='documents')for(const key of ['vehicleId','updatedAt','revision']){delete previous[key];delete current[key];}
  if(row.type==='readings')for(const key of ['supersedes','updatedAt','revision']){delete previous[key];delete current[key];}
  assert.deepEqual(current,previous,'Unrelated record fields must remain unchanged');
 }
 restored=new Store('/tmp/roundtrip.sqlite');restored.import(snapshot);
 for(const type of ['vehicles','entries','tasks','fuel','shelf','documents','expenses','board','readings'])assert.equal(restored.all(type).length,snapshot[type].length);
 console.log('Datensicherung: Reparatur und vollständiger Restore auf isolierter Kopie erfolgreich.',checked.repairs);
}catch(error){console.error('Datensicherungs-Validierung fehlgeschlagen:',error.name);process.exitCode=1;}finally{restored?.close();checked?.close();}
JS
tar -cf - -C "$candidate" Dockerfile .dockerignore package.json server.mjs lib public | tar -xf - -C "$stack/app"
docker tag "$new" werkheft:local
docker compose up -d --no-build --pull never --wait --wait-timeout 60
test "$(docker inspect --format '{{.Image}}' werkheft)" = "$new"
docker exec werkheft node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
stopped=0
trap - ERR
printf 'Aktualisierung erfolgreich. Sicherung: %s/werkheft-before-%s.sqlite\n' "$backupdir" "$stamp"
docker inspect --format 'Image={{.Image}} Status={{.State.Status}} Health={{.State.Health.Status}}' werkheft
