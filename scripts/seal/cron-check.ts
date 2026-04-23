const issueUrl = process.env.SEAL_ISSUE_URL;
const sealToken = process.env.SEAL_TOKEN;

if (!issueUrl || !sealToken) {
  throw new Error('SEAL_ISSUE_URL and SEAL_TOKEN are required');
}

async function run(url: string, token: string) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const json = await res.json();
  console.log('[auto-seal]', json);
}

setInterval(() => {
  void run(issueUrl, sealToken);
}, 5 * 60 * 1000);
void run(issueUrl, sealToken);
