import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import crypto from 'crypto';

export async function GET() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM security_groups ORDER BY created_at DESC').all() as any[];
  const groups = rows.map(r => ({
    ...r,
    rules: JSON.parse(r.rules_json || '[]'),
  }));
  return NextResponse.json(groups);
}

export async function POST(request: Request) {
  try {
    const { name, description, rules } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const db = getDb();
    const id = `sg-${crypto.randomBytes(4).toString('hex')}`;
    const rulesJson = JSON.stringify(rules || []);

    db.prepare(`
      INSERT INTO security_groups (id, name, description, rules_json)
      VALUES (?, ?, ?, ?)
    `).run(id, name, description || '', rulesJson);

    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (action, details, entity_id)
      VALUES (?, ?, ?)
    `).run('SECURITY_GROUP_CREATE', `Created security group ${name}`, id);

    return NextResponse.json({ id, name, description, rules }, { status: 201 });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return NextResponse.json({ error: 'A security group with this name already exists' }, { status: 409 });
    }
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
    db.prepare('DELETE FROM security_groups WHERE id = ?').run(id);

    db.prepare(`
      INSERT INTO activity_logs (action, details, entity_id)
      VALUES (?, ?, ?)
    `).run('SECURITY_GROUP_DELETE', `Deleted security group ${id}`, id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
