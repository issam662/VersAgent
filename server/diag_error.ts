async function test() {
    try {
        const res = await fetch('http://localhost:3002/api/agent/inventory', {
            method: 'POST',
            body: JSON.stringify({
                agentId: '61217ec2-39ea-4491-9566-f7b6150c8053',
                currentUser: 'APTIV\\testuser',
                osName: 'Windows 11'
            }),
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': 'aptiv-sec-123-123-123-123-123-123-123-123'
            }
        });
        const text = await res.text();
        console.log("HTTP Status:", res.status);
        console.log("Response:", text);
    } catch (err: any) {
        console.error("Unknown Error:", err.message);
    }
}
test();
