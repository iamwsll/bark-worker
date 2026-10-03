import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPairSync } from 'node:crypto'
import worker from '../main.js'

function makeEnv() {
    return {
        ROOT_PATH: '/test-access-token',
        ALLOW_NEW_DEVICE: 'true',
        ALLOW_QUERY_NUMS: 'true',
        database: {
            exec() {},
            prepare(query) {
                const run = async () => ({ results: query.includes('COUNT(*)')
                    ? [{ rowCount: 0 }]
                    : query.includes('SELECT `token` FROM `devices`')
                        ? [{ token: 'test-device-token' }]
                        : [] })
                return { run, bind: () => ({ run }) }
            },
        },
    }
}

function context() {
    const pending = []
    return { waitUntil(promise) { pending.push(promise) }, settle: () => Promise.all(pending) }
}

test('requests without the access token cannot reach health or registration, even without a database', async () => {
    for (const path of ['/ping', '/register?devicetoken=abcd', '/wrong-token/ping', '/test-access-token-extra/ping']) {
        const response = await worker.fetch(new Request('https://worker.example' + path), {
            ROOT_PATH: '/test-access-token',
        }, context())
        assert.equal(response.status, 404)
    }
})

test('authenticated server paths remain compatible with the Bark client', async () => {
    const env = makeEnv()
    const ctx = context()
    const ping = await worker.fetch(new Request('https://worker.example/test-access-token/ping'), env, ctx)
    assert.equal(ping.status, 200)
    assert.equal((await ping.json()).message, 'pong')
    const info = await worker.fetch(new Request('https://worker.example/test-access-token/info'), env, ctx)
    assert.equal((await info.json()).devices, 0)
    const register = await worker.fetch(new Request('https://worker.example/test-access-token/register?devicetoken=' + 'a'.repeat(64)), env, ctx)
    assert.equal(register.status, 200)
    assert.ok((await register.json()).data.key)
    await ctx.settle()
})

test('APNs signs with the configured secret rather than a hardcoded private key', async () => {
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const env = makeEnv()
    env.APNS_PRIVATE_KEY = keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
    const ctx = context()
    const originalFetch = globalThis.fetch
    let authorization
    globalThis.fetch = async (url, init) => {
        authorization = init.headers.authorization
        return new Response(null, { status: 200 })
    }
    try {
        const response = await worker.fetch(new Request('https://worker.example/test-access-token/push', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ device_key: 'signingtest', title: 'test', body: 'test' }),
        }), env, ctx)
        assert.equal(response.status, 200)
        const [header, claims, signature] = authorization.slice('bearer '.length).split('.')
        const publicKey = await crypto.subtle.importKey('spki', keys.publicKey.export({ format: 'der', type: 'spki' }), {
            name: 'ECDSA', namedCurve: 'P-256',
        }, false, ['verify'])
        assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey,
            Buffer.from(signature, 'base64url'), new TextEncoder().encode(header + '.' + claims)), true)
        await ctx.settle()
    } finally {
        globalThis.fetch = originalFetch
    }
})
