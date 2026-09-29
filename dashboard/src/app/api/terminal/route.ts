import { NextResponse } from 'next/server';
import { Client } from 'ssh2';
import { apiClient } from '@/lib/api-client';
import fs from 'fs';
import os from 'os';
import path from 'path';

export async function POST(request: Request) {
  try {
    const {
      instanceId,
      command,
      username,
      password,
      privateKey,
    } = await request.json();

    if (!instanceId) {
      return NextResponse.json({ error: 'Instance ID is required' }, { status: 400 });
    }

    const instance = await apiClient.getInstance(instanceId);
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    // Find exposed SSH port (guest 22)
    const sshPortRule = instance.allowed_ports.find((p) => p.guest_port === 22);
    if (!sshPortRule) {
      return NextResponse.json(
        {
          error:
            'Port 22 is not exposed on this instance. Please edit allowed ports to include port 22.',
        },
        { status: 400 }
      );
    }

    // Determine default user based on image
    let user = username;
    let pwd = password;
    const isCirros = instance.base_image && instance.base_image.includes('cirros');

    if (isCirros) {
      if (!user) user = 'cirros';
      if (!pwd) pwd = 'gocubsgo';
    } else {
      if (!user) user = 'cloud-user';
    }

    // Locate private key if available
    let privKey = privateKey;
    if (!privKey) {
      const defaultKeyPath = path.join(os.homedir(), '.ssh', 'id_ed25519');
      if (fs.existsSync(defaultKeyPath)) {
        try {
          privKey = fs.readFileSync(defaultKeyPath, 'utf8');
        } catch (e) {}
      }
    }

    return new Promise<NextResponse>((resolve) => {
      const conn = new Client();
      let output = '';
      let isResolved = false;

      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          conn.end();
          resolve(
            NextResponse.json({
              output: output || 'Command execution timed out after 10 seconds.',
              timeout: true,
            })
          );
        }
      }, 10000);

      conn
        .on('ready', () => {
          conn.exec(command || 'uname -a && uptime', (err, stream) => {
            if (err) {
              clearTimeout(timer);
              if (!isResolved) {
                isResolved = true;
                conn.end();
                resolve(NextResponse.json({ error: err.message }, { status: 500 }));
              }
              return;
            }

            stream
              .on('close', (code: number) => {
                clearTimeout(timer);
                if (!isResolved) {
                  isResolved = true;
                  conn.end();
                  resolve(NextResponse.json({ output, exitCode: code }));
                }
              })
              .on('data', (data: Buffer) => {
                output += data.toString('utf-8');
              })
              .stderr.on('data', (data: Buffer) => {
                output += data.toString('utf-8');
              });
          });
        })
        .on('error', (err) => {
          clearTimeout(timer);
          if (!isResolved) {
            isResolved = true;
            resolve(
              NextResponse.json(
                {
                  error: `SSH connection to localhost:${sshPortRule.host_port} failed: ${err.message}`,
                  hint:
                    'The VM may still be booting up, waiting for cloud-init, or authentication rejected.',
                },
                { status: 502 }
              )
            );
          }
        });

      const connectConfig: any = {
        host: '127.0.0.1',
        port: sshPortRule.host_port,
        username: user,
        readyTimeout: 6000,
      };

      if (pwd) {
        connectConfig.password = pwd;
      }
      if (privKey) {
        connectConfig.privateKey = privKey;
      }

      conn.connect(connectConfig);
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
