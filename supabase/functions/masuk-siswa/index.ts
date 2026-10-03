// Dihentikan. Masuk siswa sekarang lewat fungsi `masuk` dengan username dan password.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
Deno.serve((req) => req.method === 'OPTIONS'
  ? new Response('ok', { headers: cors })
  : new Response(JSON.stringify({ ok: false }), { status: 410, headers: { ...cors, 'Content-Type': 'application/json' } }))
