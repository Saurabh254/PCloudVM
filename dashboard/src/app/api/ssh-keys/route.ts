import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import crypto from 'crypto';

function computeFingerprint(publicKey: string): string {
  try {
    const parts = publicKey.trim().split(/\s+/);
    if (parts.length >= 2) {
      const keyBuffer = Buffer.from(parts[1], 'base64');
      const hash = crypto.createHash('sha256').update(keyBuffer).digest('base64');
      return `SHA256:${hash.replace(/=+$/, '')}`;
    }
  } catch (e) {}
  return `MD5:${crypto.createHash('md5').update(publicKey).digest('hex')}`;
}

export async function GET() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM ssh_keys ORDER BY created_at DESC').all();
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = getDb();

    // Check if generating a new key pair
    if (body.generate) {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      // Convert SPKI PEM to OpenSSH format
      // Node crypto ssh key conversion or clean Ed25519 openssh string
      const pubBuf = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
      // The last 32 bytes of Ed25519 public key in SPKI format is the raw key
      const rawPub = pubBuf.subarray(pubBuf.length - 32);
      const prefix = Buffer.from([
        0, 0, 0, 11, ...Buffer.from('ssh-ed25519'),
        0, 0, 0, 32, ...rawPub
      ]);
      const openSSHKey = `ssh-ed25519 ${prefix.toString('base64')} ${body.name || 'generated-key'}`;

      const id = `key-${crypto.randomBytes(4).toString('hex')}`;
      const fingerprint = computeFingerprint(openSSHKey);
      const name = body.name || `key-${Date.now()}`;

      db.prepare(`
        INSERT INTO ssh_keys (id, name, public_key, fingerprint)
        VALUES (?, ?, ?, ?)
      `).run(id, name, openSSHKey, fingerprint);

      return NextResponse.json({
        id,
        name,
        public_key: openSSHKey,
        private_key: privateKey, // returned once for download
        fingerprint,
      }, { status: 201 });
    }

    // Adding existing public key
    const { name, public_key } = body;
    if (!name || !public_key) {
      return NextResponse.json({ error: 'Name and public key are required' }, { status: 400 });
    }

    const id = `key-${crypto.randomBytes(4).toString('hex')}`;
    const fingerprint = computeFingerprint(public_key);

    db.prepare(`
      INSERT INTO ssh_keys (id, name, public_key, fingerprint)
      VALUES (?, ?, ?, ?)
    `).run(id, name, public_key.trim(), fingerprint);

    db.prepare(`
      INSERT INTO activity_logs (action, details, entity_id)
      VALUES (?, ?, ?)
    `).run('SSH_KEY_ADD', `Added SSH key ${name}`, id);

    return NextResponse.json({ id, name, public_key, fingerprint }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const db = getDb();
    db.prepare('DELETE FROM ssh_keys WHERE id = ?').run(id);

    db.prepare(`
      INSERT INTO activity_logs (action, details, entity_id)
      VALUES (?, ?, ?)
    `).run('SSH_KEY_DELETE', `Deleted SSH key ${id}`, id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
